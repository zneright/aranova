import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";
import UserLayout from "../../components/layout/UserLayout";
import LoadingWorkspace from "../../components/ui/LoadingWorkspace";
import QRCode from "qrcode";
import { Html5Qrcode } from "html5-qrcode";

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
  const { userData, loading: authLoading } = useAuth();
  const { dark } = useTheme();
  const navigate = useNavigate();
  const [scanningReceipt, setScanningReceipt] = useState(false);

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
              if (receipt.type !== "offline_pay" || !receipt.payerId || !receipt.amount || !receipt.signature) {
                throw new Error("Invalid receipt QR format.");
              }
              
              const key = `aranova_received_offline_${userData.uid}`;
              const received = JSON.parse(localStorage.getItem(key) || "[]");
              
              if (received.some((r: any) => r.nonce === receipt.nonce)) {
                alert("This offline receipt has already been scanned!");
                scanner?.stop().then(() => setScanningReceipt(false)).catch(() => undefined);
                return;
              }

              received.push(receipt);
              localStorage.setItem(key, JSON.stringify(received));

              alert(`Offline Payment QR Scanned!\nAmount: ${receipt.amount} XLM\nPayer: ${receipt.payerName}\n\nThis will sync on-chain once you get online.`);
              scanner?.stop().then(() => setScanningReceipt(false)).catch(() => undefined);
            } catch (err: any) {
              console.error("QR decode failed:", err);
              alert("Error decoding receipt: " + (err.message || err));
              scanner?.stop().then(() => setScanningReceipt(false)).catch(() => undefined);
            }
          },
          () => {}
        )
        .catch((err) => {
          console.error("Scanner start error:", err);
          alert("Failed to access camera: " + err);
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
        <div className={`mt-8 p-8 rounded-[36px] border ${dark ? "bg-[#141620] border-white/10" : "bg-white border-gray-100 shadow-xl"}`}>
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
            {scanningReceipt && (
              <div className="mb-4 p-2 rounded-2xl border border-dashed border-gray-400">
                <div id="reader-receive" className="w-full h-48 rounded-xl overflow-hidden" />
              </div>
            )}
            <button
              onClick={() => setScanningReceipt(s => !s)}
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
      </div>
    </UserLayout>
  );
};

export default UserReceive;
