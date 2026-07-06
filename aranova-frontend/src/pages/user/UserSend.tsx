import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";
import UserLayout from "../../components/layout/UserLayout";
import LoadingWorkspace from "../../components/ui/LoadingWorkspace";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  where,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../firebase/config";
import CryptoJS from "crypto-js";
import { Html5Qrcode } from "html5-qrcode";
import { payP2P } from "../../services/sorobanService";
import {
  recalculateAndSyncTrustScore,
  queueBluetoothPayment,
} from "../../services/aranovaWorkflow";

const UserSend: React.FC = () => {
  const { userData, loading: authLoading } = useAuth();
  const { dark } = useTheme();
  const navigate = useNavigate();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [processingState, setProcessingState] = useState<string | null>(null);

  // PIN Modal States
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinDigits, setPinDigits] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinPurpose, setPinPurpose] = useState("");
  const [pinCallback, setPinCallback] = useState<((secret: string) => void) | null>(null);

  // HTML5 QR Scanner
  useEffect(() => {
    let scanner: Html5Qrcode | null = null;
    if (scanning) {
      scanner = new Html5Qrcode("reader-send");
      scanner
        .start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            setRecipient(decodedText);
            scanner?.stop().then(() => setScanning(false)).catch(() => undefined);
          },
          () => {}
        )
        .catch((err) => {
          console.error("Camera scanner error:", err);
          alert("Failed to start camera: " + err);
          setScanning(false);
        });
    }
    return () => {
      if (scanner && scanner.isScanning) {
        scanner.stop().catch(() => undefined);
      }
    };
  }, [scanning]);

  const handleSend = async () => {
    const value = Number(amount);
    if (!recipient || !value) return alert("Enter a recipient and amount.");
    if (value > Number(userData.walletBalance || 0)) return alert("Insufficient wallet balance.");

    if (!navigator.onLine) {
      const nonce = Math.random().toString(36).substring(7);
      const payloadObj = {
        type: "offline_pay",
        payerId: userData.uid,
        payerKey: userData.publicKey,
        recipient,
        amount: value,
        nonce,
        timestamp: Date.now(),
      };

      const key = `aranova_offline_queue_${userData.uid}`;
      const queued = JSON.parse(localStorage.getItem(key) || "[]");
      queued.push(payloadObj);
      localStorage.setItem(key, JSON.stringify(queued));

      queueBluetoothPayment(userData.uid, { recipient, amount: value, mode: "bluetooth" });
      addDoc(collection(db, "offline_payments"), {
        payerId: userData.uid,
        recipient,
        amount: value,
        channel: "bluetooth",
        status: "queued-offline",
        createdAt: serverTimestamp(),
      }).catch(() => undefined);

      alert("Offline payment queued.");
      navigate("/user");
      return;
    }

    try {
      let destPublicKey = recipient;
      let destUid = "";
      let recipientVaultRoutingPct = 0;
      let recipientPreferredDays = 30;

      const isStellarKey = recipient.startsWith("G") && recipient.length === 56;
      if (!isStellarKey) {
        const snap = await getDoc(doc(db, "users", recipient));
        if (snap.exists()) {
          destPublicKey = snap.data().publicKey;
          destUid = snap.id;
          recipientVaultRoutingPct = snap.data().vaultRoutingPct || 0;
          recipientPreferredDays = snap.data().vaultPreferredDays || 30;
        } else {
          const qEmail = query(collection(db, "users"), where("email", "==", recipient));
          const qSnap = await getDocs(qEmail);
          if (!qSnap.empty) {
            destPublicKey = qSnap.docs[0].data().publicKey;
            destUid = qSnap.docs[0].id;
            recipientVaultRoutingPct = qSnap.docs[0].data().vaultRoutingPct || 0;
            recipientPreferredDays = qSnap.docs[0].data().vaultPreferredDays || 30;
          } else {
            throw new Error("Recipient public key, user ID, or email not found.");
          }
        }
      } else {
        const qKey = query(collection(db, "users"), where("publicKey", "==", recipient));
        const qSnap = await getDocs(qKey);
        if (!qSnap.empty) {
          destUid = qSnap.docs[0].id;
          recipientVaultRoutingPct = qSnap.docs[0].data().vaultRoutingPct || 0;
          recipientPreferredDays = qSnap.docs[0].data().vaultPreferredDays || 30;
        }
      }

      if (!destPublicKey) {
        throw new Error("Could not resolve recipient's Stellar public key.");
      }

      const vault_portion = (value * recipientVaultRoutingPct) / 100;

      setPinPurpose(`Pay ${value.toFixed(2)} XLM`);
      setPinDigits("");
      setPinError("");
      setPinCallback(() => async (secret: string) => {
        setBusy(true);
        setProcessingState("Constructing Soroban payment payload...");
        try {
          const handler = { signWithSecret: secret };
          const amountStroops = BigInt(Math.round(value * 10_000_000));
          const vaultPctBps = BigInt(recipientVaultRoutingPct * 100);

          setProcessingState("Simulating smart contract on-chain execution...");
          const txHash = await payP2P(userData.publicKey, destPublicKey, amountStroops, vaultPctBps, handler);

          setProcessingState("Finalizing ledger validation...");

          await addDoc(collection(db, "transactions"), {
            type: "send",
            from: userData.uid,
            to: destUid || destPublicKey,
            amount: value,
            vaultPortion: vault_portion,
            routingPct: recipientVaultRoutingPct,
            lockDays: recipientPreferredDays,
            channel: "wallet",
            status: "completed",
            blockchainTxHash: txHash,
            createdAt: serverTimestamp(),
          });

          await updateDoc(doc(db, "users", userData.uid), {
            walletBalance: increment(-value),
            lastTrustUpdate: serverTimestamp(),
          });
          await recalculateAndSyncTrustScore(userData.uid);

          alert("Payment completed successfully!");
          navigate("/user");
        } catch (err: any) {
          console.error(err);
          alert(`Payment transaction failed: ${err.message || err}`);
        } finally {
          setBusy(false);
          setProcessingState(null);
        }
      });
      setShowPinModal(true);
    } catch (err: any) {
      console.error(err);
      alert(`Payment setup failed: ${err.message || err}`);
    }
  };

  const handlePinSubmit = () => {
    if (pinDigits.length < 4) {
      setPinError("PIN must be 4 digits.");
      return;
    }
    try {
      const bytes = CryptoJS.AES.decrypt(userData.encryptedSecretKey, pinDigits);
      const secret = bytes.toString(CryptoJS.enc.Utf8);
      if (!secret || !secret.startsWith("S")) {
        throw new Error("Invalid PIN.");
      }
      setPinError("");
      setShowPinModal(false);
      if (pinCallback) pinCallback(secret);
    } catch (err) {
      setPinError("Incorrect PIN. Decryption failed.");
      setPinDigits("");
    }
  };

  const handlePinKey = (num: string) => {
    setPinError("");
    if (pinDigits.length < 4) setPinDigits((prev) => prev + num);
  };

  if (authLoading) return <LoadingWorkspace />;
  if (!userData) return <div className="p-8 text-center text-red-500">Authentication Error</div>;

  const role = userData.role || "commuter";
  const btnColor = role === "driver" ? "bg-[#FF6B00]" : role === "cooperative" ? "bg-[#10B981]" : "bg-[#FFE600]";
  const btnHover = role === "driver" ? "hover:bg-[#E05E00]" : role === "cooperative" ? "hover:bg-[#0E9F6E]" : "hover:bg-[#E6CE00]";
  const textColor = role === "commuter" ? "text-black" : "text-white";

  return (
    <UserLayout userData={userData} activeTab="wallet">
      <div className="max-w-xl mx-auto pb-24">
        {/* App Bar */}
        <div className="flex items-center gap-3 mb-6">
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
          <h1 className="text-2xl font-black tracking-tight">Send Payment</h1>
        </div>

        {/* Available Balance Context */}
        <div className={`p-5 mb-8 rounded-[24px] border ${dark ? "bg-[#141620] border-white/10" : "bg-white border-gray-100 shadow-sm"}`}>
          <div className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Available to Send</div>
          <div className="text-2xl font-black">
            {Number(userData.walletBalance || 0).toFixed(2)} <span className="text-sm opacity-50">XLM</span>
          </div>
        </div>

        {/* Send Form */}
        <div className="space-y-5">
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-2 block ml-1">Recipient</label>
            <div className="flex gap-2">
              <input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="Email, Aranova ID, or Stellar Key"
                className={`flex-1 px-4 py-4 rounded-2xl border text-sm font-semibold focus:outline-none focus:ring-2 transition-all ${
                  dark
                    ? "bg-white/5 border-white/10 text-white placeholder-gray-500 focus:ring-white/20"
                    : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:ring-black/10"
                }`}
              />
              <button
                onClick={() => setScanning((s) => !s)}
                className={`px-4 rounded-2xl font-bold text-xl flex items-center justify-center transition-all ${
                  scanning
                    ? "bg-red-500/10 border border-red-500/30 text-red-500"
                    : dark
                    ? "bg-white/5 border border-white/10 text-white"
                    : "bg-gray-100 border border-gray-200 text-gray-800"
                }`}
              >
                {scanning ? "✕" : "📷"}
              </button>
            </div>
            {scanning && (
              <div className="mt-4 p-2 rounded-2xl border border-dashed border-gray-400">
                <div id="reader-send" className="w-full h-48 rounded-xl overflow-hidden" />
              </div>
            )}
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-2 block ml-1">Amount (XLM)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className={`w-full px-4 py-4 rounded-2xl border text-lg font-black focus:outline-none focus:ring-2 transition-all ${
                dark
                  ? "bg-white/5 border-white/10 text-white placeholder-gray-600 focus:ring-white/20"
                  : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-300 focus:ring-black/10"
              }`}
            />
          </div>

          <button
            onClick={handleSend}
            disabled={busy || !recipient || !amount || Number(amount) <= 0}
            className={`w-full mt-4 py-4 rounded-2xl font-black text-sm uppercase tracking-wider transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:active:scale-100 ${btnColor} ${textColor} ${btnHover}`}
          >
            {busy ? "Processing..." : "Send Now"}
          </button>
        </div>

        {/* Modals & Overlays */}
        {processingState && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center z-[9999] p-6 text-center text-white">
            <div className="relative w-20 h-20 mb-6 flex items-center justify-center">
              <div className="absolute w-full h-full rounded-full border-4 border-t-transparent border-white/50 animate-spin" />
              <span className="text-xl animate-pulse">⚡</span>
            </div>
            <h3 className="text-lg font-black mb-1">Processing Transaction</h3>
            <p className="text-xs text-gray-400 uppercase tracking-wider font-bold animate-pulse">{processingState}</p>
          </div>
        )}

        {showPinModal && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-[9999] p-6">
            <div className={`rounded-[32px] p-8 max-w-sm w-full border shadow-2xl text-center ${dark ? "bg-[#0E0F14] border-white/10 text-white" : "bg-white border-gray-100 text-gray-900"}`}>
              <span className="text-3xl mb-3 block">🔑</span>
              <h3 className="text-lg font-black">Confirm Payment</h3>
              <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-wider font-bold">{pinPurpose}</p>

              <div className="flex justify-center gap-4 my-6">
                {[0, 1, 2, 3].map((idx) => (
                  <div key={idx} className={`w-4 h-4 rounded-full border-2 transition-all ${pinDigits.length > idx ? `${btnColor} border-transparent scale-110` : "bg-transparent border-gray-400"}`} />
                ))}
              </div>

              {pinError && <p className="text-red-500 text-xs font-black mb-4">{pinError}</p>}

              <div className="grid grid-cols-3 gap-3 max-w-[240px] mx-auto mb-6">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                  <button key={num} onClick={() => handlePinKey(num)} className={`h-12 rounded-xl text-lg font-black active:scale-95 ${dark ? "bg-white/5 hover:bg-white/10" : "bg-gray-100 hover:bg-gray-200"}`}>{num}</button>
                ))}
                <button onClick={() => setPinDigits("")} className={`h-12 rounded-xl text-xs font-black text-red-500 active:scale-95 ${dark ? "bg-white/5" : "bg-gray-50"}`}>Clear</button>
                <button onClick={() => handlePinKey("0")} className={`h-12 rounded-xl text-lg font-black active:scale-95 ${dark ? "bg-white/5" : "bg-gray-100"}`}>0</button>
                <button onClick={() => setPinDigits((p) => p.slice(0, -1))} className={`h-12 rounded-xl text-sm font-black text-gray-400 active:scale-95 ${dark ? "bg-white/5" : "bg-gray-100"}`}>⌫</button>
              </div>

              <div className="flex gap-3">
                <button onClick={handlePinSubmit} disabled={pinDigits.length < 4} className={`flex-1 py-3.5 rounded-xl font-black text-xs uppercase disabled:opacity-50 active:scale-95 ${btnColor} ${textColor}`}>Confirm</button>
                <button onClick={() => { setShowPinModal(false); setPinCallback(null); }} className={`flex-1 py-3.5 rounded-xl font-bold text-xs uppercase border ${dark ? "border-white/10 hover:bg-white/5" : "border-gray-200 hover:bg-gray-50"}`}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </UserLayout>
  );
};

export default UserSend;
