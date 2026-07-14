import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";
import UserLayout from "../../components/layout/UserLayout";
import LoadingWorkspace from "../../components/ui/LoadingWorkspace";
import QRCode from "qrcode";
import { Html5Qrcode } from "html5-qrcode";
import {
  doc,
  getDoc,
  setDoc,
  increment,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../firebase/config";

const OfflineQrCanvas: React.FC<{ text: string; size?: number }> = ({ text, size = 250 }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (canvasRef.current && text) {
      QRCode.toCanvas(canvasRef.current, text, { width: size, margin: 2, scale: 10, color: { dark: '#000000', light: '#ffffff' } }, (error) => {
        if (error) console.error("Error generating QR:", error);
      });
    }
  }, [text, size]);

  return (
    <div className="flex justify-center my-8">
      <div className="p-4 bg-white rounded-3xl shadow-xl transform transition-transform hover:scale-105">
        <canvas ref={canvasRef} className="rounded-2xl max-w-full h-auto block" />
      </div>
    </div>
  );
};

const UserReceive: React.FC = () => {
  const { userData: contextUserData, loading: authLoading, currentUser } = useAuth();
  const userData = (() => {
    if (contextUserData) return contextUserData;
    const cached = localStorage.getItem("aranova_auth_profile");
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (currentUser && parsed && parsed.uid === currentUser.uid) {
          return parsed;
        }
      } catch (e) {}
    }
    return null;
  })();
  const { dark } = useTheme();
  const navigate = useNavigate();
  const [scanningReceipt, setScanningReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState<any | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const handleRetryCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());
      setScanningReceipt(true);
    } catch (err: any) {
      console.error("Camera prompt retry failed:", err);
      setCameraError("Camera access is still blocked. Please tap the lock/settings icon in your browser address bar and enable the camera manually.");
    }
  };

  useEffect(() => {
    let scanner: Html5Qrcode | null = null;
    if (scanningReceipt) {
      scanner = new Html5Qrcode("reader-receive");
      scanner
        .start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          async (decodedText) => {
            try {
              const receipt = JSON.parse(decodedText);
              if (receipt.type !== "offline_pay" || !receipt.payerId || !receipt.amount || !receipt.signature || !receipt.payerKey) {
                throw new Error("Invalid receipt QR format.");
              }
              
              // ─── CRYPTOGRAPHIC SIGNATURE VERIFICATION ───
              const message = `${receipt.payerId}:${receipt.recipient}:${receipt.amount}:${receipt.nonce}:${receipt.timestamp}`;
              const { Keypair } = await import("@stellar/stellar-sdk");
              const isValid = Keypair.fromPublicKey(receipt.payerKey).verify(
                Buffer.from(message),
                Buffer.from(receipt.signature, "hex")
              );
              if (!isValid) {
                throw new Error("Payer signature is cryptographically invalid.");
              }

              // Local duplicate check
              const localKey = `aranova_received_offline_${userData.uid}`;
              const received = JSON.parse(localStorage.getItem(localKey) || "[]");
              if (received.some((r: any) => r.nonce === receipt.nonce)) {
                throw new Error("This receipt nonce was already scanned on this device.");
              }

              if (navigator.onLine) {
                // Process settlement immediately online
                const txDocId = receipt.nonce;
                const recSnap = await getDoc(doc(db, "users", userData.uid));
                let vaultPct = 0;
                let preferredDays = 30;
                if (recSnap.exists()) {
                  vaultPct = recSnap.data().vaultRoutingPct || 0;
                  preferredDays = recSnap.data().vaultPreferredDays || 30;
                }

                const vault_portion = (receipt.amount * vaultPct) / 100;
                const wallet_portion = receipt.amount - vault_portion;

                await runTransaction(db, async (transaction) => {
                  const paymentRef = doc(db, "offline_payments", txDocId);
                  const paymentDoc = await transaction.get(paymentRef);
                  if (paymentDoc.exists()) {
                    throw new Error("This offline payment nonce has already been processed on the server.");
                  }

                  const payerRef = doc(db, "users", receipt.payerId);
                  const payerDoc = await transaction.get(payerRef);
                  if (!payerDoc.exists()) {
                    throw new Error("Payer profile not found on the server.");
                  }
                  const currentPayerBalance = Number(payerDoc.data().walletBalance || 0);
                  if (currentPayerBalance < receipt.amount) {
                    throw new Error("Payer has insufficient balance on server.");
                  }

                  // Write payment log record
                  transaction.set(paymentRef, {
                    payerId: receipt.payerId,
                    payerKey: receipt.payerKey,
                    recipientId: userData.uid,
                    amount: receipt.amount,
                    nonce: receipt.nonce,
                    channel: "offline_qr",
                    status: "synced",
                    createdAt: serverTimestamp(),
                  });

                  // Decrement payer balance
                  transaction.update(payerRef, {
                    walletBalance: increment(-receipt.amount)
                  });

                  // Credit recipient (driver) balance & vault
                  const recipientRef = doc(db, "users", userData.uid);
                  transaction.update(recipientRef, {
                    walletBalance: increment(wallet_portion),
                    vaultBalance: increment(vault_portion),
                  });
                });

                // Write vault lock record
                if (vault_portion > 0) {
                  const calculatedMaturityDate = new Date(Date.now() + preferredDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
                  const vaultId = `${userData.uid}_vault_offline_${txDocId}`;
                  await setDoc(doc(db, "vaults", vaultId), {
                    ownerId: userData.uid,
                    lockedAmount: vault_portion,
                    lockPercent: vaultPct,
                    lockDays: preferredDays,
                    maturityDate: calculatedMaturityDate,
                    status: "locked",
                    createdAt: serverTimestamp(),
                    isOfflineRouted: true,
                  });
                }

                // Write final transaction ledger record
                await setDoc(doc(db, "transactions", `tx_${txDocId}`), {
                  type: "offline_qr_settled",
                  from: receipt.payerId,
                  to: userData.uid,
                  amount: receipt.amount,
                  status: "completed",
                  createdAt: serverTimestamp(),
                });

                alert("Receipt scanned and settled successfully online!");
              } else {
                // Store in local queue for later syncing when online
                received.push(receipt);
                localStorage.setItem(localKey, JSON.stringify(received));
                alert("Scan successful! Stored offline in queue to sync when internet is restored.");
              }

              setReceiptData(receipt);
              setShowReceiptModal(true);
              scanner?.stop().then(() => setScanningReceipt(false)).catch(() => undefined);
            } catch (err: any) {
              console.error("Scanned payment processing failed:", err);
              alert("Error: " + (err.message || err));
              scanner?.stop().then(() => setScanningReceipt(false)).catch(() => undefined);
            }
          },
          () => {}
        )
        .catch(async (err) => {
          console.error("Scanner start error:", err);
          let friendlyMsg = "To scan commuter tickets, Aranova needs camera access. If you blocked it, tap the site settings icon in your browser address bar and toggle 'Camera' to 'Allow'.";
          try {
            if (navigator.permissions && navigator.permissions.query) {
              const res = await navigator.permissions.query({ name: "camera" as any });
              if (res.state === "denied") {
                friendlyMsg = "Camera access is blocked by your browser settings. Please tap the lock/settings icon in your browser address bar, change 'Camera' to 'Allow', and click Retry.";
              }
            }
          } catch (pErr) {}
          setCameraError(friendlyMsg);
          setScanningReceipt(false);
        });
    }
    return () => {
      if (scanner && scanner.isScanning) {
        scanner.stop().catch(() => undefined);
      }
    };
  }, [scanningReceipt, userData?.uid]);

  if (authLoading) return <LoadingWorkspace />;
  if (!userData) return <div className="p-8 text-center text-red-500">Authentication Error</div>;

  const handleDownloadQr = () => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return alert("QR not ready yet.");
    const link = document.createElement("a");
    link.download = `Aranova-QR-${userData.displayName || "Pass"}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const role = userData.role || "commuter";
  const btnColor = role === "driver" ? "bg-[#FF6B00]" : role === "cooperative" ? "bg-[#10B981]" : "bg-[#FFE600]";
  const btnHover = role === "driver" ? "hover:bg-[#E05E00]" : role === "cooperative" ? "hover:bg-[#0E9F6E]" : "hover:bg-[#E6CE00]";
  const textColor = role === "commuter" ? "text-black" : "text-white";

  return (
    <UserLayout userData={userData} activeTab="wallet">
      <div className="max-w-md mx-auto pb-24 text-center">
        {/* App Bar */}
        <div className="flex items-center gap-3 mb-6 text-left">
          <button
            onClick={() => navigate("/user")}
            className={`p-3 rounded-full flex items-center justify-center transition-colors ${
              dark ? "bg-white/10 text-white hover:bg-white/20" : "bg-black/5 text-black hover:bg-black/10"
            }`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
          </button>
          <h1 className="text-2xl font-black tracking-tight">Receive</h1>
        </div>

        {/* QR Code Container */}
        <div className={`mt-8 p-8 rounded-[36px] border premium-shadow ${dark ? "bg-[#12141D] border-white/5" : "bg-white border-gray-150"}`}>
          <div className="mb-2">
            <span className={`inline-block px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
              role === "driver" ? "bg-[#FF6B00]/10 text-[#FF6B00]" : role === "cooperative" ? "bg-[#10B981]/10 text-[#10B981]" : "bg-[#FFE600]/20 text-[#B8A000]"
            }`}>
              {userData.network === "PUBLIC" ? "Mainnet Active" : "Testnet Active"}
            </span>
          </div>
          
          <h2 className="text-xl font-black mt-4">Scan to Pay Me</h2>
          <p className="text-xs text-gray-500 mt-2 font-semibold px-4">
            Show this QR code to any Aranova user to receive XLM directly into your wallet.
          </p>

          <OfflineQrCanvas text={userData.publicKey || userData.uid} />

          <div className={`p-4 rounded-2xl break-all font-mono text-[10px] ${dark ? "bg-black/40 text-gray-400" : "bg-gray-50 text-gray-600"}`}>
            {userData.publicKey || userData.uid}
          </div>

          <button
            onClick={handleDownloadQr}
            className={`w-full mt-6 py-4 rounded-2xl font-black text-sm uppercase tracking-wider transition-all shadow-md active:scale-95 ${btnColor} ${textColor} ${btnHover}`}
          >
            Save QR Code
          </button>

          {/* Offline Receipt Collect Button (Specifically for Drivers/Receivers) */}
          <div className="mt-4 pt-4 border-t border-dashed border-gray-200 dark:border-white/10">
            {cameraError && (
              <div className="mb-4 p-5 rounded-2xl border border-red-500/20 bg-red-500/5 text-center animate-fadeIn">
                <span className="text-2xl block mb-2">📸</span>
                <h4 className="text-xs font-black text-red-500 uppercase tracking-wider">Camera Permission Blocked</h4>
                <p className="text-[10px] text-gray-500 mt-2 leading-relaxed">
                  {cameraError}
                </p>
                <button
                  onClick={handleRetryCamera}
                  className="mt-3.5 px-5 py-2.5 bg-[#FF6B00] text-white rounded-xl font-bold text-[10px] uppercase tracking-wider hover:bg-[#E05E00] transition-all active:scale-95 shadow-sm"
                >
                  Grant Permission / Retry
                </button>
              </div>
            )}
            {scanningReceipt && (
              <div className="mb-4 p-2 rounded-2xl border border-dashed border-gray-400">
                <div id="reader-receive" className="w-full h-48 rounded-xl overflow-hidden" />
              </div>
            )}
            <button
              onClick={() => {
                setCameraError(null);
                setScanningReceipt(s => !s);
              }}
              className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-wider transition-all border shadow-sm active:scale-95 ${
                scanningReceipt 
                  ? "bg-red-500/10 border-red-500/30 text-red-500" 
                  : dark 
                    ? "bg-white/5 border-white/10 text-white hover:bg-white/10" 
                    : "bg-gray-100 border-gray-200 text-gray-800 hover:bg-gray-200"
              }`}
            >
              {scanningReceipt ? "Cancel Camera Scan" : "Scan Commuter Receipt QR"}
            </button>
          </div>
        </div>

        {showReceiptModal && receiptData && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center z-[9999] p-0 sm:p-6 animate-fadeIn">
            <div className={`bottom-sheet sm:rounded-[32px] rounded-t-[32px] p-6 max-w-sm w-full border shadow-2xl text-center ${dark ? "bg-[#0E0F14] border-white/10 text-white" : "bg-white border-gray-100 text-gray-900"}`}>
              <div className="w-16 h-16 bg-[#10B981]/20 text-[#10B981] rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              <h3 className="text-xl font-black">Offline Payment Scanned</h3>
              <p className="text-xs text-gray-500 mt-2 font-medium px-2">This transit ticket receipt has been scanned and verified.</p>
              
              {/* Premium Ticket Receipt representation */}
              <div className={`my-6 p-5 rounded-2xl border text-left space-y-3 relative overflow-hidden ${dark ? "bg-black/30 border-white/5" : "bg-gray-50 border-gray-100"}`}>
                <div className="absolute top-0 right-0 transform translate-x-3 -translate-y-3 w-10 h-10 rounded-full border border-dashed opacity-10" />
                <div className="text-[10px] font-black uppercase tracking-wider text-gray-400">Aranova Transit Ticket</div>
                <div className="flex justify-between items-baseline border-b border-dashed pb-2 border-gray-200 dark:border-white/5">
                  <span className="text-xs font-bold text-gray-500">Amount Received</span>
                  <span className="text-xl font-black">{receiptData.amount} XLM</span>
                </div>
                <div className="space-y-1.5 pt-1 text-[10px] font-semibold text-gray-500">
                  <div className="flex justify-between">
                    <span>Payer (Commuter):</span>
                    <span className="font-mono text-gray-800 dark:text-gray-200">{receiptData.payerName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Recipient (Driver):</span>
                    <span className="font-mono text-gray-800 dark:text-gray-200">
                      {userData.publicKey ? `${userData.publicKey.slice(0, 10)}...${userData.publicKey.slice(-10)}` : userData.uid}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Timestamp:</span>
                    <span className="text-gray-800 dark:text-gray-200">{new Date(receiptData.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t border-dashed border-gray-200 dark:border-white/5">
                    <span>Proof Signature:</span>
                    <span className="font-mono text-[9px] text-[#10B981]">{receiptData.signature.slice(0, 16)}...</span>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-amber-500/10 text-amber-500 text-[10px] font-bold rounded-xl mb-4 leading-normal">
                ⚠️ Scanned payment saved locally. Funds will sync on-chain automatically once your device reconnects to the network.
              </div>

              <button 
                onClick={() => { setShowReceiptModal(false); setReceiptData(null); navigate("/user"); }} 
                className={`w-full mt-6 py-3.5 rounded-xl font-black text-sm uppercase tracking-wider transition-all shadow-md active:scale-95 ${btnColor} ${textColor} ${btnHover}`}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </UserLayout>
  );
};

export default UserReceive;
