import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    addDoc,
    collection,
    doc,
    getDoc,
    getDocs,
    increment,
    onSnapshot,
    query,
    where,
    serverTimestamp,
    updateDoc,
} from "firebase/firestore";
import { auth, db } from "../../firebase/config";
import UserLayout, { useTheme } from "../../components/layout/UserLayout";
import LoadingWorkspace from "../../components/ui/LoadingWorkspace";
import {
    ensureUserProfile,
    maybeRunDailyTrustUpdate,
    formatXlm,
    queueBluetoothPayment,
    syncBluetoothQueue,
} from "../../services/aranovaWorkflow";
import CryptoJS from "crypto-js";
import { FreighterModule } from '@creit.tech/stellar-wallets-kit/modules/freighter';
import { xBullModule } from '@creit.tech/stellar-wallets-kit/modules/xbull';
import { LobstrModule } from '@creit.tech/stellar-wallets-kit/modules/lobstr';
import { NETWORK_PASSPHRASE, getLiveStellarBalance, submitStellarPayment, HORIZON_URL } from "../../services/sorobanService";
import { Html5Qrcode } from "html5-qrcode";
import { Horizon } from "@stellar/stellar-sdk";
import QRCode from "qrcode";

// Helper: resolve active signer credentials based on user profile type (native soft key vs freighter extension)
const getSigningHandler = async (userData: any, networkPassphrase: string) => {
    if (userData.encryptedSecretKey) {
        const pin = prompt("Enter your 4-digit PIN to authorize this contract transaction:");
        if (!pin) throw new Error("Transaction signature cancelled.");

        try {
            const bytes = CryptoJS.AES.decrypt(userData.encryptedSecretKey, pin);
            const secret = bytes.toString(CryptoJS.enc.Utf8);
            if (!secret || !secret.startsWith("S")) {
                throw new Error("Invalid PIN or corrupted key.");
            }
            return { signWithSecret: secret };
        } catch (err) {
            alert("Failed to decrypt key. Please check your PIN.");
            throw err;
        }
    } else {
        const walletId = userData.network?.toLowerCase() || "freighter";
        let module: any;
        if (walletId.includes("xbull")) {
            module = new xBullModule();
        } else if (walletId.includes("lobstr")) {
            module = new LobstrModule();
        } else {
            module = new FreighterModule();
        }

        const isAvailable = await module.isAvailable();
        if (!isAvailable) {
            throw new Error(`${walletId.toUpperCase()} wallet is not available/detected.`);
        }

        return {
            signWithWallet: async (xdr: string) => {
                return await module.signTransaction(xdr, {
                    networkPassphrase,
                    publicKey: userData.publicKey,
                });
            }
        };
    }
};

const OfflineQrCanvas: React.FC<{ text: string; size?: number }> = ({ text, size = 200 }) => {
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

    React.useEffect(() => {
        if (canvasRef.current && text) {
            QRCode.toCanvas(canvasRef.current, text, { width: size, margin: 1 }, (error) => {
                if (error) console.error("Error generating QR:", error);
            });
        }
    }, [text, size]);

    return (
        <div style={{ display: "flex", justifyContent: "center", margin: "16px auto" }}>
            <canvas ref={canvasRef} style={{ borderRadius: 8, maxWidth: "100%", height: "auto", background: "#fff", padding: 8 }} />
        </div>
    );
};

const syncReceivedOfflinePayments = async (uid: string) => {
    const key = `aranova_received_offline_${uid}`;
    const received = JSON.parse(localStorage.getItem(key) || "[]") as any[];
    if (received.length === 0) return;

    for (const item of received) {
        try {
            await addDoc(collection(db, "offline_payments"), {
                payerId: item.payerId,
                payerKey: item.payerKey,
                recipientId: uid,
                amount: Number(item.amount),
                nonce: item.nonce,
                channel: "offline_qr",
                status: "synced",
                createdAt: serverTimestamp(),
            });

            await updateDoc(doc(db, "users", item.payerId), { walletBalance: increment(-Number(item.amount)) });
            await updateDoc(doc(db, "users", uid), { walletBalance: increment(Number(item.amount)) });

            await addDoc(collection(db, "transactions"), {
                type: "offline_qr_settled",
                from: item.payerId,
                to: uid,
                amount: Number(item.amount),
                status: "completed",
                createdAt: serverTimestamp(),
            });
        } catch (err) {
            console.error("Failed to sync item:", item, err);
        }
    }

    localStorage.setItem(key, "[]");
};

const CommuterPanel: React.FC<{ userData: any; onRefresh: () => void }> = ({ userData, onRefresh }) => {
    const { dark } = useTheme();
    const [recipient, setRecipient] = useState("");
    const [amount, setAmount] = useState("0");
    const [busy, setBusy] = useState(false);
    const [offlineQueueLength, setOfflineQueueLength] = useState(0);

    // QR & Camera & Offline States
    const [scanning, setScanning] = useState(false);
    const [showReceiveModal, setShowReceiveModal] = useState(false);
    const [showPayModal, setShowPayModal] = useState(false);
    const [activeReceipt, setActiveReceipt] = useState<any>(null);
    const [scannedRecipient, setScannedRecipient] = useState<string | null>(null);
    const [recipientName, setRecipientName] = useState("");

    // Ref to track processed transaction hashes to prevent duplicates
    const processedTxsRef = React.useRef<Record<string, boolean>>({});
    const markTxProcessed = (txHash: string) => {
        if (!txHash) return false;
        if (processedTxsRef.current[txHash]) return true;
        processedTxsRef.current[txHash] = true;
        return false;
    };

    const availableCredit = useMemo(() => Math.max(25, Number(userData.trustScore || 0) * 2), [userData.trustScore]);

    const handleDownloadQr = async () => {
        try {
            const response = await fetch(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(userData.publicKey)}`);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `aranova-receive-qr-${userData.uid}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (e) {
            console.error("Failed to download QR code:", e);
            alert("Could not download QR code. Please try again.");
        }
    };

    const checkOfflineQueue = () => {
        const key = `aranova_offline_queue_${userData.uid}`;
        const queued = JSON.parse(localStorage.getItem(key) || "[]") as any[];

        const recKey = `aranova_received_offline_${userData.uid}`;
        const recQueued = JSON.parse(localStorage.getItem(recKey) || "[]") as any[];

        setOfflineQueueLength(queued.length + recQueued.length);
    };

    useEffect(() => {
        checkOfflineQueue();
    }, [userData.uid]);

    // Pull recent Horizon payments on mount to catch transactions that happened just before/during login
    useEffect(() => {
        if (!userData.publicKey) return;

        const checkRecentPayments = async () => {
            try {
                const horizon = new Horizon.Server(HORIZON_URL);
                const paymentsPage = await horizon.payments()
                    .forAccount(userData.publicKey)
                    .order("desc")
                    .limit(3)
                    .call();

                if (paymentsPage.records && paymentsPage.records.length > 0) {
                    for (const payment of paymentsPage.records) {
                        if (payment.type === "payment" && payment.asset_type === "native" && payment.to === userData.publicKey && payment.from !== userData.publicKey) {
                            const createdTime = new Date(payment.created_at).getTime();
                            const isVeryRecent = Date.now() - createdTime < 45000; // within 45 seconds

                            if (isVeryRecent) {
                                const txHash = payment.transaction_hash;
                                if (!markTxProcessed(txHash)) {
                                    setActiveReceipt({
                                        type: "Receive (On-Chain)",
                                        amount: Number(payment.amount),
                                        sender: payment.from,
                                        recipient: userData.publicKey,
                                        status: "Pay settled",
                                        txHash,
                                        timestamp: createdTime,
                                    });
                                    onRefresh();
                                    break; // Only trigger one receipt popup at launch
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn("Could not check recent payments on load:", e);
            }
        };

        const timer = setTimeout(checkRecentPayments, 1500);
        return () => clearTimeout(timer);
    }, [userData.publicKey, onRefresh]);

    useEffect(() => {
        if (!userData.uid) return;

        const destinations = [userData.uid];
        if (userData.publicKey) {
            destinations.push(userData.publicKey);
        }
        if (userData.email) {
            destinations.push(userData.email);
        }

        const transQuery = query(
            collection(db, "transactions"),
            where("to", "in", destinations)
        );

        let lastTxId = "";
        const unsub = onSnapshot(transQuery, (snap) => {
            if (snap.empty) return;
            const docs = [...snap.docs].sort((a, b) => {
                const aTime = a.data().createdAt?.toMillis() || 0;
                const bTime = b.data().createdAt?.toMillis() || 0;
                return bTime - aTime;
            });
            const latestDoc = docs[0];
            const data = latestDoc.data();
            const txHash = data.blockchainTxHash || latestDoc.id;

            if (lastTxId === "") {
                lastTxId = latestDoc.id;
                // If the app just loaded, but the transaction happened in the last 35 seconds, pop the receipt!
                const txTime = data.createdAt?.toMillis() || Date.now();
                const isVeryRecent = Date.now() - txTime < 35000;
                if (isVeryRecent && data.from !== userData.uid && !markTxProcessed(txHash)) {
                    setActiveReceipt({
                        type: "Receive (On-Chain)",
                        amount: Number(data.amount || 0),
                        sender: data.from,
                        recipient: userData.publicKey,
                        status: "Pay settled",
                        txHash: data.blockchainTxHash,
                        timestamp: txTime,
                    });
                    onRefresh();
                }
                return;
            }

            if (latestDoc.id !== lastTxId) {
                lastTxId = latestDoc.id;
                if (data.from !== userData.uid && !markTxProcessed(txHash)) {
                    setActiveReceipt({
                        type: "Receive (On-Chain)",
                        amount: Number(data.amount || 0),
                        sender: data.from,
                        recipient: userData.publicKey,
                        status: "Pay settled",
                        txHash: data.blockchainTxHash,
                        timestamp: data.createdAt?.toMillis() || Date.now(),
                    });
                    onRefresh();
                }
            }
        }, (err) => console.warn("Transaction listener warning:", err));

        // Stellar Horizon stream listener for external payments
        let closeHorizonStream = () => {};
        if (userData.publicKey) {
            const horizon = new Horizon.Server(HORIZON_URL);
            try {
                closeHorizonStream = horizon.payments()
                    .forAccount(userData.publicKey)
                    .cursor("now")
                    .stream({
                        onmessage: (payment: any) => {
                            if (payment.type === "payment" && payment.asset_type === "native" && payment.to === userData.publicKey && payment.from !== userData.publicKey) {
                                const txHash = payment.transaction_hash;
                                if (!markTxProcessed(txHash)) {
                                    setActiveReceipt({
                                        type: "Receive (On-Chain)",
                                        amount: Number(payment.amount),
                                        sender: payment.from,
                                        recipient: userData.publicKey,
                                        status: "Pay settled",
                                        txHash,
                                        timestamp: Date.now(),
                                    });
                                    onRefresh();
                                }
                            }
                        },
                        onerror: (err: any) => {
                            console.warn("Horizon payments stream warning:", err);
                        }
                    });
            } catch (err) {
                console.error("Stellar Horizon stream setup error:", err);
            }
        }

        return () => {
            unsub();
            closeHorizonStream();
        };
    }, [userData.uid, userData.publicKey, userData.email, onRefresh]);

    // Handle HTML5 QR Scanner
    useEffect(() => {
        let scanner: Html5Qrcode | null = null;
        if (scanning) {
            scanner = new Html5Qrcode("reader");
            scanner.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: { width: 250, height: 250 } },
                (decodedText) => {
                    handleScanSuccess(decodedText);
                    scanner?.stop().then(() => setScanning(false)).catch(() => undefined);
                },
                () => {
                    // silent ignore frame scan failure
                }
            ).catch((err) => {
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

    const handleScanSuccess = async (text: string) => {
        try {
            if (text.startsWith("{")) {
                const payload = JSON.parse(text);
                if (payload.type === "offline_pay") {
                    if (payload.recipient !== userData.publicKey && payload.recipient !== userData.uid && payload.recipient !== userData.email) {
                        return alert("This offline payment QR code is not destined for your account.");
                    }

                    const recKey = `aranova_received_offline_${userData.uid}`;
                    const received = JSON.parse(localStorage.getItem(recKey) || "[]");
                    if (received.some((r: any) => r.nonce === payload.nonce)) {
                        return alert("This payment payload has already been processed.");
                    }

                    received.push(payload);
                    localStorage.setItem(recKey, JSON.stringify(received));
                    checkOfflineQueue();

                    setActiveReceipt({
                        type: "Receive (Offline Captured)",
                        amount: Number(payload.amount),
                        sender: payload.payerKey || payload.payerId,
                        recipient: userData.publicKey,
                        status: navigator.onLine ? "Pay settled" : "Offline Queued",
                        nonce: payload.nonce,
                        timestamp: payload.timestamp,
                    });

                    if (navigator.onLine) {
                        await syncReceivedOfflinePayments(userData.uid);
                        checkOfflineQueue();
                        onRefresh();
                    }
                }
            } else {
                setScannedRecipient(text);
                setRecipientName("Loading recipient...");
                setRecipient(text);

                let resolvedName = text;
                const isKey = text.startsWith("G") && text.length === 56;
                try {
                    if (isKey) {
                        const qKey = query(collection(db, "users"), where("publicKey", "==", text));
                        const snap = await getDocs(qKey);
                        if (!snap.empty) {
                            resolvedName = snap.docs[0].data().displayName || snap.docs[0].data().coopName || text;
                        }
                    } else {
                        const snap = await getDoc(doc(db, "users", text));
                        if (snap.exists()) {
                            resolvedName = snap.data().displayName || snap.data().coopName || text;
                        }
                    }
                } catch (e) {
                    console.warn("Lookup failed:", e);
                }
                setRecipientName(resolvedName);
            }
        } catch (e) {
            console.error("Failed to parse QR code:", e);
            alert("Could not process QR content.");
        }
    };

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

            // Automatically queue Bluetooth synchronization for background broadcast
            queueBluetoothPayment(userData.uid, { recipient, amount: value, mode: "bluetooth" });
            addDoc(collection(db, "offline_payments"), {
                payerId: userData.uid,
                recipient,
                amount: value,
                channel: "bluetooth",
                status: "queued-offline",
                createdAt: serverTimestamp(),
            }).catch(() => undefined);

            checkOfflineQueue();

            setActiveReceipt({
                type: "Pay (Offline Captured)",
                amount: value,
                sender: userData.publicKey,
                recipient,
                status: "Offline Queued",
                nonce,
                timestamp: Date.now(),
                payload: payloadObj,
            });
            return;
        }

        setBusy(true);
        try {
            let destPublicKey = recipient;
            let destUid = "";

            const isStellarKey = recipient.startsWith("G") && recipient.length === 56;
            if (!isStellarKey) {
                const snap = await getDoc(doc(db, "users", recipient));
                if (snap.exists()) {
                    destPublicKey = snap.data().publicKey;
                    destUid = snap.id;
                } else {
                    const qEmail = query(collection(db, "users"), where("email", "==", recipient));
                    const qSnap = await getDocs(qEmail);
                    if (!qSnap.empty) {
                        destPublicKey = qSnap.docs[0].data().publicKey;
                        destUid = qSnap.docs[0].id;
                    } else {
                        throw new Error("Recipient public key, user ID, or email not found.");
                    }
                }
            } else {
                const qKey = query(collection(db, "users"), where("publicKey", "==", recipient));
                const qSnap = await getDocs(qKey);
                if (!qSnap.empty) {
                    destUid = qSnap.docs[0].id;
                }
            }

            if (!destPublicKey) {
                throw new Error("Could not resolve recipient's Stellar public key.");
            }

            const handler = await getSigningHandler(userData, NETWORK_PASSPHRASE);
            const txHash = await submitStellarPayment(userData.publicKey, destPublicKey, value.toFixed(7), handler);
            console.log("Real Stellar payment transaction successful:", txHash);

            await addDoc(collection(db, "transactions"), {
                type: "send",
                from: userData.uid,
                to: destUid || destPublicKey,
                amount: value,
                channel: "wallet",
                status: "completed",
                blockchainTxHash: txHash,
                createdAt: serverTimestamp(),
            });

            await updateDoc(doc(db, "users", userData.uid), {
                walletBalance: increment(-value),
                trustScore: Math.min(100, Number(userData.trustScore || 0) + 1),
                lastTrustUpdate: serverTimestamp(),
            });

            setActiveReceipt({
                type: "Pay (On-Chain)",
                amount: value,
                sender: userData.publicKey,
                recipient: destPublicKey,
                status: "Pay settled",
                txHash,
                timestamp: Date.now(),
            });
            onRefresh();
        } catch (err: any) {
            console.error(err);
            alert(`Payment transaction failed: ${err.message || err}`);
        } finally {
            setBusy(false);
        }
    };

    const handleSyncQueue = async () => {
        setBusy(true);
        try {
            await syncBluetoothQueue(userData.uid);
            await syncReceivedOfflinePayments(userData.uid);
            alert("Offline queues synced successfully!");
            checkOfflineQueue();
            onRefresh();
        } catch (err: any) {
            console.error(err);
            alert("Sync failed: " + err.message);
        } finally {
            setBusy(false);
        }
    };

    const role = userData?.role || "commuter";

    // Commuter Bento Layout (High-contrast Neon Yellow / Black)
    const renderCommuter = () => (
      <div className="space-y-6">
        {/* MOBILE VIEW */}
        <div className="lg:hidden space-y-6">
          <div className="grid grid-cols-2 gap-4">
            {/* Left Column: Wallet Balance Card */}
            <div className={`group relative overflow-hidden rounded-[24px] p-6 border shadow-lg flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-[#FFE600]/40 ${
              dark ? 'bg-gradient-to-br from-[#0E0F14] to-[#161822] border-white/5' : 'bg-gradient-to-br from-[#1E293B] to-[#0F172A]'
            }`}>
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#FFE600] opacity-[0.03] group-hover:opacity-[0.08] group-hover:scale-110 transition-all duration-500 rounded-full blur-2xl -mr-8 -mt-8 pointer-events-none"></div>
              <div className="relative z-10">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Wallet</span>
                <h1 className="text-xl sm:text-2xl font-black text-white mt-2">
                  {formatXlm(Number(userData.walletBalance || 0))}
                </h1>
              </div>
              <div className="text-[9px] text-gray-400 mt-2 font-bold uppercase relative z-10">XLM Balance</div>
            </div>

            {/* Right Column: Stacked Pay & Receive buttons */}
            <div className="grid grid-rows-2 gap-3">
              <button 
                onClick={() => setShowPayModal(true)} 
                className="flex items-center justify-center p-4 rounded-[20px] border border-[#FFE600]/20 bg-[#FFE600] text-black font-black text-xs uppercase tracking-wider shadow-md hover:-translate-y-0.5 hover:shadow-lg active:scale-95 transition-all gap-2"
              >
                💸 Pay
              </button>
              <button 
                onClick={() => setShowReceiveModal(true)} 
                className={`flex items-center justify-center p-4 rounded-[20px] border hover:-translate-y-0.5 hover:shadow-lg active:scale-95 transition-all gap-2 font-black text-xs uppercase tracking-wider shadow-md ${
                  dark ? 'border-white/10 bg-white/5 text-white hover:border-white/30' : 'border-gray-200 bg-gray-50 text-gray-800 hover:bg-gray-100 hover:border-gray-300'
                }`}
              >
                📥 Receive
              </button>
            </div>
          </div>

          {/* Below it: Withdraw Card */}
          <div className={`rounded-[24px] p-6 border shadow-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-[#FFE600]/30 ${dark ? 'bg-[#0E0F14] border-white/5' : 'bg-white border-[#E2E2DF]'}`}>
            <h3 className="text-sm font-black mb-1">Withdraw</h3>
            <p className="text-[10px] text-gray-400 mb-4">Withdraw to external Stellar exchange terminals.</p>
            <button 
              onClick={() => alert("Withdraw is reserved for future PDAX integration.")} 
              className={`w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider border active:scale-95 transition-all ${
                dark ? 'border-white/10 text-white hover:bg-white/10 hover:border-[#FFE600]/50' : 'border-gray-200 text-gray-800 hover:bg-gray-50 hover:border-[#FFE600]/50'
              }`}
            >
              Withdraw
            </button>
          </div>
        </div>

        {/* LAPTOP / DESKTOP VIEW */}
        <div className="hidden lg:block space-y-6">
          {/* Top Row: Wallet on Left, Pay & Receive on Right (Leveled same height) */}
          <div className="grid grid-cols-2 gap-6 items-stretch">
            {/* Left Column: Wallet Balance Card */}
            <div className="h-full flex flex-col">
              <div className={`group relative overflow-hidden rounded-[32px] p-8 flex flex-col justify-between flex-1 border shadow-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:border-[#FFE600]/40 ${
                dark ? 'bg-gradient-to-br from-[#0E0F14] to-[#161822] border-white/5' : 'bg-gradient-to-br from-[#1E293B] to-[#0F172A]'
              }`}>
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#FFE600] opacity-[0.03] group-hover:opacity-[0.08] group-hover:scale-110 transition-all duration-500 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">💳</span>
                      <span className={`text-[10px] font-black uppercase tracking-wider ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Wallet Balance</span>
                    </div>
                    <span className={`text-[9px] font-extrabold uppercase px-2.5 py-1 rounded bg-[#FFE600]/10 ${dark ? 'text-[#FFE600]' : 'text-[#8A7D00]'} border border-[#FFE600]/20`}>
                      Commuter Pass
                    </span>
                  </div>
                  
                  <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white mt-8 transition-transform duration-300 group-hover:scale-[1.02] origin-left">
                    {formatXlm(Number(userData.walletBalance || 0))} <span className="text-lg font-bold uppercase text-gray-400">XLM</span>
                  </h1>
                </div>

                <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between text-xs text-gray-400 relative z-10">
                  <span>Stellar Network Wallet</span>
                  <span className="font-bold flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    On-Chain Synchronized
                  </span>
                </div>
              </div>
            </div>

            {/* Right Column: Pay & Receive Card (Matching wallet height) */}
            <div className="h-full flex flex-col">
              <div className={`rounded-[32px] p-8 border shadow-xl flex-1 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:border-[#FFE600]/40 ${dark ? 'bg-[#0E0F14] border-white/5' : 'bg-white border-[#E2E2DF]'}`}>
                <div>
                  <h3 className="text-lg font-black mb-2">Pay & Receive</h3>
                  <p className="text-xs text-gray-400 mb-6">Initiate P2P payments or scan commuter fares</p>
                  
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="flex-1">
                        <input 
                          value={recipient} 
                          onChange={(e) => setRecipient(e.target.value)} 
                          placeholder="Recipient address, public key or email" 
                          className={`w-full ${dark ? 'bg-white/5 border-white/10 text-white placeholder-gray-500 hover:border-white/20' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 hover:border-gray-300'} px-4 py-3 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FFE600] transition-all`}
                        />
                      </div>
                      <button 
                        onClick={() => setScanning((s) => !s)} 
                        className={`px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-wider border flex items-center justify-center gap-2 whitespace-nowrap active:scale-95 hover:-translate-y-0.5 hover:shadow-md transition-all ${scanning ? 'bg-red-500/10 border-red-500/30 text-red-500 hover:bg-red-500/20' : (dark ? 'bg-white/5 border-white/10 text-white hover:bg-white/10' : 'bg-gray-100 border-gray-200 text-gray-800 hover:bg-gray-200')}`}
                      >
                        {scanning ? "Close Cam" : "📷 Scan QR"}
                      </button>
                    </div>
                    
                    <input 
                      value={amount} 
                      onChange={(e) => setAmount(e.target.value)} 
                      type="number" 
                      placeholder="Amount in XLM" 
                      className={`w-full ${dark ? 'bg-white/5 border-white/10 text-white placeholder-gray-500 hover:border-white/20' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 hover:border-gray-300'} px-4 py-3 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FFE600] transition-all`}
                    />
                  </div>

                  {scanning && (
                    <div className="mt-4 text-center">
                      <div id="reader" className="w-full max-w-[200px] h-[200px] mx-auto rounded-xl overflow-hidden border border-dashed border-[#FFE600]/40" />
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 mt-6">
                  <button 
                    onClick={handleSend} 
                    disabled={busy} 
                    className="px-6 py-3.5 rounded-xl font-black text-xs uppercase tracking-wider bg-[#FFE600] text-black hover:bg-[#E6CE00] hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-50 active:scale-95 transition-all"
                  >
                    Pay
                  </button>
                  <button 
                    onClick={() => setShowReceiveModal(true)} 
                    className={`px-5 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider border active:scale-95 hover:shadow-lg hover:-translate-y-0.5 transition-all ${dark ? 'border-white/10 text-white hover:bg-white/5 hover:border-white/30' : 'border-gray-200 text-gray-800 hover:bg-gray-50 hover:border-gray-300'}`}
                  >
                    Receive
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Row 2: Withdraw Card (Full width, placed below the main grid row) */}
          <div className={`rounded-[32px] p-8 border shadow-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:border-[#FFE600]/40 ${dark ? 'bg-[#0E0F14] border-white/5' : 'bg-white border-[#E2E2DF]'}`}>
            <h3 className="text-lg font-black mb-2">Withdraw</h3>
            <p className="text-xs text-gray-400 mb-4">
              Withdraw assets to external Stellar exchange terminals. PDAX banking gateway integrations are reserved.
            </p>
            <button 
              onClick={() => alert("Withdraw is reserved for future PDAX integration.")} 
              className={`w-full py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider border active:scale-95 hover:shadow-md hover:-translate-y-0.5 transition-all ${dark ? 'border-white/10 text-white hover:bg-white/5 hover:border-white/30' : 'border-gray-200 text-gray-800 hover:bg-gray-50 hover:border-gray-300'}`}
            >
              Withdraw
            </button>
          </div>
        </div>

        {/* Stats Row (Always visible below the main grid) */}
        <div className="grid grid-cols-2 gap-4">
          <div className={`group rounded-[24px] p-6 border shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-[#FFE600]/30 ${dark ? 'bg-[#0E0F14] border-white/5' : 'bg-white border-[#E2E2DF]'}`}>
            <div className="flex flex-col justify-between h-full">
              <div>
                <span className={`text-[10px] font-black uppercase tracking-wider transition-colors duration-300 ${dark ? 'group-hover:text-gray-300 text-gray-400' : 'group-hover:text-gray-700 text-gray-500'}`}>Locked Vault</span>
                <h2 className="text-xl sm:text-2xl font-black mt-2 transition-transform duration-300 group-hover:scale-105 origin-left">
                  {formatXlm(Number(userData.vaultBalance || 0))}
                </h2>
              </div>
              <a href="/user/vault" className={`mt-4 inline-flex items-center gap-1 text-[10px] font-black uppercase hover:underline ${dark ? 'text-[#FFE600]' : 'text-[#8A7D00]'}`}>
                Manage Vault &rarr;
              </a>
            </div>
          </div>

          <div className={`group rounded-[24px] p-6 border shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-[#FFE600]/30 ${dark ? 'bg-[#0E0F14] border-white/5' : 'bg-white border-[#E2E2DF]'}`}>
            <div className="flex flex-col justify-between h-full">
              <div>
                <span className={`text-[10px] font-black uppercase tracking-wider transition-colors duration-300 ${dark ? 'group-hover:text-gray-300 text-gray-400' : 'group-hover:text-gray-700 text-gray-500'}`}>Trust Score</span>
                <h2 className="text-xl sm:text-2xl font-black mt-2 transition-transform duration-300 group-hover:scale-105 origin-left">
                  {Number(userData.trustScore || 0)}/100
                </h2>
              </div>
              <p className="mt-4 text-[10px] text-gray-400 leading-relaxed font-semibold">
                Limit boost: <span className="text-emerald-500">{formatXlm(availableCredit)} XLM</span>
              </p>
            </div>
          </div>
        </div>

        {/* Financial Info Bento Card */}
        <div className={`rounded-[28px] p-6 border shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-[#FFE600]/30 ${dark ? 'bg-[#0E0F14] border-white/5' : 'bg-white border-[#E2E2DF]'}`}>
          <h3 className="text-sm font-black mb-2 uppercase tracking-wide text-gray-400">Aranova Transit Ledger</h3>
          <p className={`text-xs leading-relaxed ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
            Automatically secure transit payments on-chain. Maintain active savings lockups in your personal vault to continuously build trust standing and claim transaction discounts.
          </p>
        </div>
      </div>
    );

    // Driver Bento Layout (Sunset Orange / Obsidian Slate)
    const renderDriver = () => (
      <div className="space-y-6">
        {/* MOBILE VIEW */}
        <div className="lg:hidden space-y-6">
          <div className="grid grid-cols-2 gap-4">
            {/* Left Column: Wallet Balance Card */}
            <div className={`group relative overflow-hidden rounded-[24px] p-6 border shadow-lg flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-[#FF6B00]/40 ${
              dark ? 'bg-gradient-to-br from-[#141620] to-[#251A14] border-white/5' : 'bg-gradient-to-br from-[#2D231E] to-[#1C1512]'
            }`}>
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#FF6B00] opacity-[0.03] group-hover:opacity-[0.08] group-hover:scale-110 transition-all duration-500 rounded-full blur-2xl -mr-8 -mt-8 pointer-events-none"></div>
              <div className="relative z-10">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Wallet</span>
                <h1 className="text-xl sm:text-2xl font-black text-white mt-2">
                  {formatXlm(Number(userData.walletBalance || 0))}
                </h1>
              </div>
              <div className="text-[9px] text-gray-400 mt-2 font-bold uppercase relative z-10">XLM Balance</div>
            </div>

            {/* Right Column: Stacked Pay & Receive buttons */}
            <div className="grid grid-rows-2 gap-3">
              <button 
                onClick={() => setShowPayModal(true)} 
                className="flex items-center justify-center p-4 rounded-[20px] border border-[#FF6B00]/20 bg-[#FF6B00] text-white font-black text-xs uppercase tracking-wider shadow-md hover:-translate-y-0.5 hover:shadow-lg active:scale-95 transition-all gap-2"
              >
                💸 Pay
              </button>
              <button 
                onClick={() => setShowReceiveModal(true)} 
                className={`flex items-center justify-center p-4 rounded-[20px] border active:scale-95 hover:-translate-y-0.5 hover:shadow-lg transition-all gap-2 font-black text-xs uppercase tracking-wider shadow-md ${
                  dark ? 'border-white/10 bg-white/5 text-white hover:border-white/30' : 'border-gray-200 bg-gray-50 text-gray-800 hover:bg-gray-100 hover:border-gray-300'
                }`}
              >
                📥 Receive
              </button>
            </div>
          </div>

          {/* Below it: Withdraw Card */}
          <div className={`rounded-[24px] p-6 border shadow-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-[#FF6B00]/30 ${dark ? 'bg-[#141620] border-white/5' : 'bg-white border-[#EAE6DF]'}`}>
            <h3 className="text-sm font-black mb-1">Withdraw</h3>
            <p className="text-[10px] text-gray-400 mb-4">Withdraw to external Stellar exchange terminals.</p>
            <button 
              onClick={() => alert("Withdraw is reserved for future PDAX integration.")} 
              className={`w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider border active:scale-95 transition-all ${
                dark ? 'border-white/10 text-white hover:bg-white/10 hover:border-[#FF6B00]/50' : 'border-gray-200 text-gray-800 hover:bg-gray-50 hover:border-[#FF6B00]/50'
              }`}
            >
              Withdraw
            </button>
          </div>
        </div>

        {/* LAPTOP / DESKTOP VIEW */}
        <div className="hidden lg:block space-y-6">
          {/* Top Row: Wallet on Left, Pay & Receive on Right (Leveled same height) */}
          <div className="grid grid-cols-2 gap-6 items-stretch">
            {/* Left Column: Wallet Balance Card */}
            <div className="h-full flex flex-col">
              <div className={`group relative overflow-hidden rounded-[32px] p-8 flex flex-col justify-between border shadow-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:border-[#FF6B00]/40 ${
                dark ? 'bg-gradient-to-br from-[#141620] to-[#251A14] border-white/5' : 'bg-gradient-to-br from-[#2D231E] to-[#1C1512]'
              }`}>
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#FF6B00] opacity-[0.03] group-hover:opacity-[0.08] group-hover:scale-110 transition-all duration-500 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🛺</span>
                      <span className={`text-[10px] font-black uppercase tracking-wider ${dark ? 'text-gray-400' : 'text-gray-400'}`}>Wallet Balance</span>
                  </div>
                  <span className={`text-[9px] font-extrabold uppercase px-2.5 py-1 rounded bg-[#FF6B00]/10 ${dark ? 'text-[#FF8833]' : 'text-[#D45600]'} border border-[#FF6B00]/20`}>
                    Driver Wallet
                  </span>
                </div>
                
                <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white mt-8 transition-transform duration-300 group-hover:scale-[1.02] origin-left">
                  {formatXlm(Number(userData.walletBalance || 0))} <span className="text-lg font-bold uppercase text-gray-400">XLM</span>
                </h1>
              </div>

              <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between text-xs text-gray-400 relative z-10">
                <span>Stellar Network Wallet</span>
                <span className="font-bold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  On-Chain Synchronized
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: Pay & Receive Card (Matching wallet height) */}
          <div className="h-full flex flex-col">
            <div className={`rounded-[32px] p-8 border shadow-xl flex-1 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:border-[#FF6B00]/40 ${dark ? 'bg-[#141620] border-white/5' : 'bg-white border-[#EAE6DF]'}`}>
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div>
                    <h3 className="text-lg font-black">Pay & Receive</h3>
                    <p className="text-xs text-gray-400 mt-1">Scan commuter fares or send XLM</p>
                  </div>
                  <button 
                    onClick={() => setScanning((s) => !s)} 
                    className={`px-5 py-3.5 rounded-xl font-black text-xs uppercase tracking-wider text-white bg-[#FF6B00] hover:bg-[#E05E00] hover:shadow-lg hover:-translate-y-0.5 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-md shadow-[#FF6B00]/15`}
                  >
                    {scanning ? "Close Camera" : "📷 Scan QR"}
                  </button>
                </div>
                
                <div className="space-y-4">
                  <input 
                    value={recipient} 
                    onChange={(e) => setRecipient(e.target.value)} 
                    placeholder="Recipient address, public key or email" 
                    className={`w-full ${dark ? 'bg-white/5 border-white/10 text-white placeholder-gray-500 hover:border-white/20' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 hover:border-gray-300'} px-4 py-3 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF6B00] transition-all`}
                  />
                  
                  <input 
                    value={amount} 
                    onChange={(e) => setAmount(e.target.value)} 
                    type="number" 
                    placeholder="Amount in XLM" 
                    className={`w-full ${dark ? 'bg-white/5 border-white/10 text-white placeholder-gray-500 hover:border-white/20' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 hover:border-gray-300'} px-4 py-3 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF6B00] transition-all`}
                  />
                </div>

                {scanning && (
                  <div className="mt-4 text-center">
                    <div id="reader" className="w-full max-w-[200px] h-[200px] mx-auto rounded-xl overflow-hidden border border-dashed border-[#FF6B00]/40" />
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2 mt-6">
                <button 
                  onClick={handleSend} 
                  disabled={busy} 
                  className="px-6 py-3.5 rounded-xl font-black text-xs uppercase tracking-wider bg-black hover:opacity-90 hover:shadow-lg hover:-translate-y-0.5 dark:bg-white dark:text-black disabled:opacity-50 active:scale-95 transition-all"
                >
                  Pay
                </button>
                <button 
                  onClick={() => setShowReceiveModal(true)} 
                  className={`px-5 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider border active:scale-95 hover:shadow-lg hover:-translate-y-0.5 transition-all ${dark ? 'border-white/10 text-white hover:bg-white/5 hover:border-white/30' : 'border-gray-200 text-gray-800 hover:bg-gray-50 hover:border-gray-300'}`}
                >
                  Receive
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Row 2: Withdraw Card (Full width, placed below the main grid row) */}
        <div className={`rounded-[32px] p-8 border shadow-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:border-[#FF6B00]/40 ${dark ? 'bg-[#141620] border-white/5' : 'bg-white border-[#EAE6DF]'}`}>
          <h3 className="text-lg font-black mb-2">Withdraw</h3>
          <p className="text-xs text-gray-400 mb-4">
            Withdraw assets to external Stellar exchange terminals. PDAX banking gateway integrations are reserved.
          </p>
          <button 
            onClick={() => alert("Withdraw is reserved for future PDAX integration.")} 
            className={`w-full py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider border active:scale-95 hover:shadow-md hover:-translate-y-0.5 transition-all ${dark ? 'border-white/10 text-white hover:bg-white/5 hover:border-white/30' : 'border-gray-200 text-gray-800 hover:bg-gray-50 hover:border-gray-300'}`}
          >
            Withdraw
          </button>
        </div>
      </div>

        {/* Stats Row (Always visible below the main grid) */}
        <div className="grid grid-cols-2 gap-4">
          <div className={`group rounded-[24px] p-6 border shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-[#FF6B00]/30 ${dark ? 'bg-[#141620] border-white/5' : 'bg-white border-[#EAE6DF]'}`}>
            <div className="flex flex-col justify-between h-full">
              <div>
                <span className={`text-[10px] font-black uppercase tracking-wider transition-colors duration-300 ${dark ? 'group-hover:text-gray-300 text-gray-400' : 'group-hover:text-gray-700 text-gray-500'}`}>Locked Savings</span>
                <h2 className="text-xl sm:text-2xl font-black mt-2 transition-transform duration-300 group-hover:scale-105 origin-left">
                  {formatXlm(Number(userData.vaultBalance || 0))}
                </h2>
              </div>
              <a href="/user/vault" className={`mt-4 inline-flex items-center gap-1 text-[10px] font-black uppercase hover:underline ${dark ? 'text-[#FF8833]' : 'text-[#D45600]'}`}>
                View Vault &rarr;
              </a>
            </div>
          </div>

          <div className={`group rounded-[24px] p-6 border shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-[#FF6B00]/30 ${dark ? 'bg-[#141620] border-white/5' : 'bg-white border-[#EAE6DF]'}`}>
            <div className="flex flex-col justify-between h-full">
              <div>
                <span className={`text-[10px] font-black uppercase tracking-wider transition-colors duration-300 ${dark ? 'group-hover:text-gray-300 text-gray-400' : 'group-hover:text-gray-700 text-gray-500'}`}>Trust Standing</span>
                <h2 className="text-xl sm:text-2xl font-black mt-2 transition-transform duration-300 group-hover:scale-105 origin-left">
                  {Number(userData.trustScore || 0)}/100
                </h2>
              </div>
              <p className="mt-4 text-[10px] text-gray-400 leading-relaxed font-semibold">
                Credit cap: <span className="text-[#FF8833]">{formatXlm(availableCredit)} XLM</span>
              </p>
            </div>
          </div>
        </div>

        {/* Cooperative Fuel Credit Shortcuts Card */}
        <div className={`group rounded-[28px] p-6 border shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-[#FF6B00]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${dark ? 'bg-[#141620] border-white/5' : 'bg-white border-[#EAE6DF]'}`}>
          <div>
            <h3 className="text-sm font-black mb-1 uppercase tracking-wide text-gray-400">Cooperative Line of Credit</h3>
            <p className="text-xs text-gray-500 leading-relaxed font-semibold">
              Access limits, apply for fuel allowances, and execute smart contract repayments inside the Driver Panel.
            </p>
          </div>
          <a href="/user/loans" className={`px-4 py-2 rounded-xl text-xs font-black uppercase text-white bg-[#FF6B00] hover:bg-[#E05E00] hover:-translate-y-0.5 active:scale-95 transition-all shadow-md shadow-[#FF6B00]/10`}>
            Driver Loan Panel
          </a>
        </div>
      </div>
    );

    // Cooperative Bento Layout (Emerald Glassmorphism)
    const renderCooperative = () => (
      <div className="space-y-6">
        {/* MOBILE VIEW */}
        <div className="lg:hidden space-y-6">
          <div className="grid grid-cols-2 gap-4">
            {/* Left Column: Wallet Balance Card */}
            <div className={`group relative overflow-hidden rounded-[24px] p-6 border shadow-lg flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-[#10B981]/40 ${
              dark ? 'bg-gradient-to-br from-[#0A1128] to-[#0D1635] border-white/5' : 'bg-gradient-to-br from-[#064E3B] to-[#022C22]'
            }`}>
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#10B981] opacity-[0.03] group-hover:opacity-[0.08] group-hover:scale-110 transition-all duration-500 rounded-full blur-2xl -mr-8 -mt-8 pointer-events-none"></div>
              <div className="relative z-10">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Wallet</span>
                <h1 className="text-xl sm:text-2xl font-black text-white mt-2">
                  {formatXlm(Number(userData.walletBalance || 0))}
                </h1>
              </div>
              <div className="text-[9px] text-gray-400 mt-2 font-bold uppercase relative z-10">XLM Balance</div>
            </div>

            {/* Right Column: Stacked Pay & Receive buttons */}
            <div className="grid grid-rows-2 gap-3">
              <button 
                onClick={() => setShowPayModal(true)} 
                className="flex items-center justify-center p-4 rounded-[20px] border border-[#10B981]/20 bg-[#10B981] text-white font-black text-xs uppercase tracking-wider shadow-md hover:-translate-y-0.5 hover:shadow-lg active:scale-95 transition-all gap-2"
              >
                💸 Pay
              </button>
              <button 
                onClick={() => setShowReceiveModal(true)} 
                className={`flex items-center justify-center p-4 rounded-[20px] border active:scale-95 hover:-translate-y-0.5 hover:shadow-lg transition-all gap-2 font-black text-xs uppercase tracking-wider shadow-md ${
                  dark ? 'border-white/10 bg-white/5 text-white hover:border-white/30' : 'border-gray-200 bg-gray-50 text-gray-800 hover:bg-gray-100 hover:border-gray-300'
                }`}
              >
                📥 Receive
              </button>
            </div>
          </div>

          {/* Below it: Withdraw Card */}
          <div className={`rounded-[24px] p-6 border shadow-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-[#10B981]/30 ${dark ? 'bg-[#0A1128] border-white/5' : 'bg-white border-[#D5E2EC]'}`}>
            <h3 className="text-sm font-black mb-1">Withdraw</h3>
            <p className="text-[10px] text-gray-400 mb-4">Withdraw to external Stellar exchange terminals.</p>
            <button 
              onClick={() => alert("Withdraw is reserved for future PDAX integration.")} 
              className={`w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider border active:scale-95 transition-all ${
                dark ? 'border-white/10 text-white hover:bg-white/10 hover:border-[#10B981]/50' : 'border-gray-200 text-gray-800 hover:bg-gray-50 hover:border-[#10B981]/50'
              }`}
            >
              Withdraw
            </button>
          </div>
        </div>

        {/* LAPTOP / DESKTOP VIEW */}
        <div className="hidden lg:block space-y-6">
          {/* Top Row: Wallet on Left, Pay & Receive on Right (Leveled same height) */}
          <div className="grid grid-cols-2 gap-6 items-stretch">
            {/* Left Column: Entirely Wallet Balance Card */}
            <div className="h-full flex flex-col">
              <div className={`group relative overflow-hidden rounded-[32px] p-8 flex flex-col justify-between border shadow-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:border-[#10B981]/40 ${
                dark ? 'bg-gradient-to-br from-[#0A1128] to-[#0D1635] border-white/5' : 'bg-gradient-to-br from-[#064E3B] to-[#022C22]'
              }`}>
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#10B981] opacity-[0.03] group-hover:opacity-[0.08] group-hover:scale-110 transition-all duration-500 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🏢</span>
                      <span className={`text-[10px] font-black uppercase tracking-wider ${dark ? 'text-gray-400' : 'text-gray-400'}`}>Wallet Balance</span>
                    </div>
                    <span className={`text-[9px] font-extrabold uppercase px-2.5 py-1 rounded bg-[#10B981]/10 ${dark ? 'text-[#34D399]' : 'text-[#059669]'} border border-[#10B981]/20`}>
                      Corporate Treasury
                    </span>
                  </div>
                  
                  <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white mt-8 transition-transform duration-300 group-hover:scale-[1.02] origin-left">
                    {formatXlm(Number(userData.walletBalance || 0))} <span className="text-lg font-bold uppercase text-gray-400">XLM</span>
                  </h1>
                </div>

                <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between text-xs text-gray-400 relative z-10">
                  <span>Stellar Network Wallet</span>
                  <span className="font-bold flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    On-Chain Synchronized
                  </span>
                </div>
              </div>
            </div>

            {/* Right Column: Pay & Receive Card (Matching wallet height) */}
            <div className="h-full flex flex-col">
              <div className={`rounded-[32px] p-8 border shadow-xl flex-1 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:border-[#10B981]/40 ${dark ? 'bg-[#0A1128] border-white/5' : 'bg-white border-[#D5E2EC]'}`}>
                <div>
                  <h3 className="text-lg font-black mb-2">Pay & Receive</h3>
                  <p className="text-xs text-gray-400 mb-6">Disburse treasury funding or execute P2P transfers</p>
                  
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="flex-1">
                        <input 
                          value={recipient} 
                          onChange={(e) => setRecipient(e.target.value)} 
                          placeholder="Recipient address, public key or email" 
                          className={`w-full ${dark ? 'bg-white/5 border-white/10 text-white placeholder-gray-500 hover:border-white/20' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 hover:border-gray-300'} px-4 py-3 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#10B981] transition-all`}
                        />
                      </div>
                      <button 
                        onClick={() => setScanning((s) => !s)} 
                        className={`px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider border flex items-center justify-center gap-2 whitespace-nowrap active:scale-95 hover:-translate-y-0.5 hover:shadow-md transition-all ${scanning ? 'bg-red-500/10 border-red-500/30 text-red-500 hover:bg-red-500/20' : (dark ? 'bg-white/5 border-white/10 text-white hover:bg-white/10' : 'bg-gray-100 border-gray-200 text-gray-800 hover:bg-gray-200')}`}
                      >
                        {scanning ? "Close Cam" : "📷 Scan QR"}
                      </button>
                    </div>
                    
                    <input 
                      value={amount} 
                      onChange={(e) => setAmount(e.target.value)} 
                      type="number" 
                      placeholder="Amount in XLM" 
                      className={`w-full ${dark ? 'bg-white/5 border-white/10 text-white placeholder-gray-500 hover:border-white/20' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 hover:border-gray-300'} px-4 py-3 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#10B981] transition-all`}
                    />
                  </div>

                  {scanning && (
                    <div className="mt-4 text-center">
                      <div id="reader" className="w-full max-w-[200px] h-[200px] mx-auto rounded-xl overflow-hidden border border-dashed border-[#10B981]/40" />
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 mt-6">
                  <button 
                    onClick={handleSend} 
                    disabled={busy} 
                    className="px-6 py-3.5 rounded-xl font-black text-xs uppercase tracking-wider bg-[#10B981] text-white hover:bg-[#0E9F6E] hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-50 active:scale-95 transition-all"
                  >
                    Pay
                  </button>
                  <button 
                    onClick={() => setShowReceiveModal(true)} 
                    className={`px-5 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider border active:scale-95 hover:shadow-lg hover:-translate-y-0.5 transition-all ${dark ? 'border-white/10 text-white hover:bg-white/5 hover:border-white/30' : 'border-gray-200 text-gray-800 hover:bg-gray-50 hover:border-gray-300'}`}
                  >
                    Receive
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Row 2: Withdraw Card (Full width, placed below the main grid row) */}
          <div className={`rounded-[32px] p-8 border shadow-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:border-[#10B981]/40 ${dark ? 'bg-[#0A1128] border-white/5' : 'bg-white border-[#D5E2EC]'}`}>
            <h3 className="text-lg font-black mb-2">Withdraw</h3>
            <p className="text-xs text-gray-400 mb-4">
              Withdraw assets to external Stellar exchange terminals. PDAX banking gateway integrations are reserved.
            </p>
            <button 
              onClick={() => alert("Withdraw is reserved for future PDAX integration.")} 
              className={`w-full py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider border active:scale-95 hover:shadow-md hover:-translate-y-0.5 transition-all ${dark ? 'border-white/10 text-white hover:bg-white/5 hover:border-white/30' : 'border-gray-200 text-gray-800 hover:bg-gray-50 hover:border-gray-300'}`}
            >
              Withdraw
            </button>
          </div>
        </div>

        {/* Stats Row (Always visible below the main grid) */}
        <div className="grid grid-cols-2 gap-4">
          <div className={`group rounded-[24px] p-6 border shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-[#10B981]/30 ${dark ? 'bg-[#0A1128] border-white/5' : 'bg-white border-[#D5E2EC]'}`}>
            <div className="flex flex-col justify-between h-full">
              <div>
                <span className={`text-[10px] font-black uppercase tracking-wider transition-colors duration-300 ${dark ? 'group-hover:text-gray-300 text-gray-400' : 'group-hover:text-gray-700 text-gray-500'}`}>Reserve Lockups</span>
                <h2 className="text-xl sm:text-2xl font-black mt-2 transition-transform duration-300 group-hover:scale-105 origin-left">
                  {formatXlm(Number(userData.vaultBalance || 0))}
                </h2>
              </div>
              <a href="/user/vault" className={`mt-4 inline-flex items-center gap-1 text-[10px] font-black uppercase hover:underline ${dark ? 'text-[#34D399]' : 'text-[#059669]'}`}>
                Manage Vault &rarr;
              </a>
            </div>
          </div>

          <div className={`group rounded-[24px] p-6 border shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-[#10B981]/30 ${dark ? 'bg-[#0A1128] border-white/5' : 'bg-white border-[#D5E2EC]'}`}>
            <div className="flex flex-col justify-between h-full">
              <div>
                <span className={`text-[10px] font-black uppercase tracking-wider transition-colors duration-300 ${dark ? 'group-hover:text-gray-300 text-gray-400' : 'group-hover:text-gray-700 text-gray-500'}`}>Cooperative Trust</span>
                <h2 className="text-xl sm:text-2xl font-black mt-2 transition-transform duration-300 group-hover:scale-105 origin-left">
                  {Number(userData.trustScore || 0)}/100
                </h2>
              </div>
              <p className="mt-4 text-[10px] text-gray-500 leading-relaxed font-semibold">
                Reserves backing driver pools
              </p>
            </div>
          </div>
        </div>

        {/* Cooperative Fuel Allocation Shortcut Info */}
        <div className={`group rounded-[28px] p-6 border shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-[#10B981]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${dark ? 'bg-[#0A1128] border-white/5' : 'bg-white border-[#D5E2EC]'}`}>
          <div>
            <h3 className="text-sm font-black mb-1 uppercase tracking-wide text-gray-400">Decentralized Fuel Credit Allocation</h3>
            <p className="text-xs text-gray-500 leading-relaxed font-semibold">
              Disburse credits, manage pool reserves, and customize borrowing parameters under the Fuel Pool Manager.
            </p>
          </div>
          <a href="/user/coop-pool" className={`px-4 py-2 rounded-xl text-xs font-black uppercase text-white bg-[#10B981] hover:bg-[#0E9F6E] hover:-translate-y-0.5 active:scale-95 transition-all shadow-md shadow-[#10B981]/10`}>
            Manage Fuel Pool
          </a>
        </div>
      </div>
    );

    return (
        <div className="space-y-6">
            {/* Offline Sync Banner */}
            {offlineQueueLength > 0 && (
                <div className={`border rounded-[28px] p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-all duration-300 ${dark ? 'bg-blue-950/20 border-blue-900/30' : 'bg-blue-50 border-blue-100'}`}>
                    <div>
                        <span className={`text-sm font-extrabold tracking-wide uppercase flex items-center gap-2 ${dark ? 'text-blue-400' : 'text-blue-800'}`}>
                          📡 Offline Transactions Queued
                        </span>
                        <div className={`text-xs mt-1 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>You have {offlineQueueLength} payments waiting to sync. Connect to network to finalize on-chain.</div>
                    </div>
                    <button 
                      onClick={handleSyncQueue} 
                      disabled={busy || !navigator.onLine}
                      className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider disabled:opacity-50 transition-all ${
                        role === 'driver' 
                          ? 'bg-[#FF6B00] text-white hover:bg-[#E05E00]' 
                          : role === 'cooperative' 
                            ? 'bg-[#10B981] text-white hover:bg-[#0E9F6E]' 
                            : 'bg-black text-[#FFE600] dark:bg-[#FFE600] dark:text-black hover:opacity-90'
                      }`}
                    >
                      Sync Queue
                    </button>
                </div>
            )}

            {/* Role-based Bento layouts */}
            {role === "driver" ? renderDriver() : role === "cooperative" ? renderCooperative() : renderCommuter()}

            {/* Mobile PWA Pay Modal */}
            {showPayModal && (
                <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
                    <div className={`rounded-[32px] p-8 max-w-sm w-full border shadow-2xl transition-all ${dark ? 'bg-[#0E0F14] border-white/10 text-white' : 'bg-white border-gray-100 text-gray-900'}`}>
                        <h3 className="text-lg font-black mb-1">Pay</h3>
                        <p className="text-xs text-gray-400 mb-6">Transfer XLM or scan fare receiver codes</p>

                        <div className="space-y-4 mb-6">
                            <div className="flex gap-2">
                                <input 
                                    value={recipient} 
                                    onChange={(e) => setRecipient(e.target.value)} 
                                    placeholder="Recipient address or email" 
                                    className={`w-full ${dark ? 'bg-white/5 border-white/10 text-white placeholder-gray-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'} px-4 py-3 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-2 ${
                                        role === 'driver' ? 'focus:ring-[#FF6B00]' : role === 'cooperative' ? 'focus:ring-[#10B981]' : 'focus:ring-[#FFE600]'
                                    } transition-all`} 
                                />
                                <button 
                                    onClick={() => setScanning((s) => !s)} 
                                    className={`px-3 py-2 rounded-xl font-bold text-xs uppercase tracking-wider border flex items-center justify-center gap-1 active:scale-95 transition-all ${scanning ? 'bg-red-500/10 border-red-500/30 text-red-500' : (dark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-100 border-gray-200')}`}
                                >
                                    📷 {scanning ? "Close" : "Scan"}
                                </button>
                            </div>

                            <input 
                                value={amount} 
                                onChange={(e) => setAmount(e.target.value)} 
                                type="number" 
                                placeholder="Amount in XLM" 
                                className={`w-full ${dark ? 'bg-white/5 border-white/10 text-white placeholder-gray-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'} px-4 py-3 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-2 ${
                                    role === 'driver' ? 'focus:ring-[#FF6B00]' : role === 'cooperative' ? 'focus:ring-[#10B981]' : 'focus:ring-[#FFE600]'
                                } transition-all`} 
                            />
                        </div>

                        {scanning && (
                            <div className="mb-4 text-center">
                                <div id="reader" className="w-full max-w-[200px] h-[200px] mx-auto rounded-xl overflow-hidden border border-dashed border-[#10b981]" />
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button 
                              className={`flex-1 py-3.5 rounded-xl font-black text-xs uppercase tracking-wider text-white transition-all ${
                                role === 'driver' 
                                  ? 'bg-[#FF6B00] hover:bg-[#E05E00]' 
                                  : role === 'cooperative' 
                                    ? 'bg-[#10B981] hover:bg-[#0E9F6E]' 
                                    : 'bg-[#FFE600] text-black hover:bg-[#E6CE00]'
                              }`}
                              onClick={async () => {
                                if (!recipient || !amount || Number(amount) <= 0) return alert("Please enter valid recipient and amount.");
                                setShowPayModal(false);
                                await handleSend();
                              }} 
                              disabled={busy}
                            >
                                {busy ? "Paying..." : "Pay"}
                            </button>
                            <button 
                              className={`flex-1 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider border transition-all ${dark ? 'border-white/10 text-white hover:bg-white/5' : 'border-gray-200 text-gray-800 hover:bg-gray-50'}`}
                              onClick={() => {
                                setShowPayModal(false);
                                setScanning(false);
                              }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Receive QR Modal */}
            {showReceiveModal && (
                <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
                    <div className={`rounded-[32px] p-8 max-w-sm w-full text-center border shadow-2xl transition-all ${dark ? 'bg-[#0E0F14] border-white/10 text-white' : 'bg-white border-gray-100 text-gray-900'}`}>
                        <h3 className="text-xl font-black mb-4">Receive</h3>
                        <OfflineQrCanvas text={userData.publicKey || userData.uid || ""} size={200} />
                        <div className={`text-xs font-mono break-all px-4 py-2 rounded-xl mb-6 ${dark ? 'bg-white/5 text-gray-400' : 'bg-gray-50 text-gray-500'}`}>
                          {userData.publicKey}
                        </div>
                        <div className="flex gap-2">
                            <button 
                              className={`flex-1 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
                                role === 'driver'
                                  ? 'bg-[#FF6B00] text-white hover:bg-[#E05E00]'
                                  : role === 'cooperative'
                                    ? 'bg-[#10B981] text-white hover:bg-[#0E9F6E]'
                                    : 'bg-black text-[#FFE600] dark:bg-[#FFE600] dark:text-black hover:opacity-90'
                              }`} 
                              onClick={() => {
                                navigator.clipboard.writeText(userData.publicKey);
                                alert("Public key copied to clipboard!");
                              }}
                            >
                              Copy Key
                            </button>
                            <button 
                              className={`flex-1 py-3 rounded-xl font-bold text-xs uppercase tracking-wider border transition-all ${dark ? 'border-white/10 text-white hover:bg-white/5' : 'border-gray-200 text-gray-800 hover:bg-gray-50'}`}
                              onClick={handleDownloadQr}
                            >
                              Download
                            </button>
                            <button 
                              className={`flex-1 py-3 rounded-xl font-bold text-xs uppercase tracking-wider border transition-all ${dark ? 'border-white/10 text-white hover:bg-white/5' : 'border-gray-200 text-gray-800 hover:bg-gray-50'}`}
                              onClick={() => setShowReceiveModal(false)}
                            >
                              Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Payment Receipt / Confirmation Modal */}
            {activeReceipt && (
                <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
                    <div className={`rounded-[32px] p-8 max-w-md w-full border shadow-2xl transition-all ${dark ? 'bg-[#0E0F14] border-white/10 text-white' : 'bg-white border-gray-100 text-gray-900'}`}>
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center text-3xl font-bold mx-auto mb-4 shadow-lg shadow-emerald-500/20">✓</div>
                            <h3 className="text-xl font-black mb-1">Receipt</h3>
                            <div className="text-emerald-500 font-black text-3xl">{activeReceipt.amount} XLM</div>
                            <div className={`text-xs mt-1 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{activeReceipt.type}</div>
                        </div>

                        <div className={`divide-y text-xs border-y py-4 my-6 ${dark ? 'divide-white/5 border-white/5' : 'divide-gray-100 border-gray-100'}`}>
                            <div className="flex justify-between py-2.5">
                                <span className={dark ? 'text-gray-500' : 'text-gray-400'}>Status:</span>
                                <span className="font-extrabold text-emerald-500 uppercase tracking-wider">{activeReceipt.status}</span>
                            </div>
                            <div className="flex justify-between py-2.5 gap-4">
                                <span className={`shrink-0 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Sender:</span>
                                <span className="font-mono break-all text-right">{activeReceipt.sender.slice(0, 12)}...{activeReceipt.sender.slice(-12)}</span>
                            </div>
                            <div className="flex justify-between py-2.5 gap-4">
                                <span className={`shrink-0 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Recipient:</span>
                                <span className="font-mono break-all text-right">{activeReceipt.recipient.slice(0, 12)}...{activeReceipt.recipient.slice(-12)}</span>
                            </div>
                            <div className="flex justify-between py-2.5">
                                <span className={dark ? 'text-gray-500' : 'text-gray-400'}>Date/Time:</span>
                                <span className="font-semibold">{new Date(activeReceipt.timestamp).toLocaleString()}</span>
                            </div>
                            {activeReceipt.txHash && (
                                <div className="flex justify-between py-2.5 gap-4">
                                    <span className={`shrink-0 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Tx Hash:</span>
                                    <span className="font-mono break-all text-right text-[10px] text-gray-500">{activeReceipt.txHash.slice(0, 16)}...</span>
                                </div>
                            )}
                            {activeReceipt.nonce && (
                                <div className="flex justify-between py-2.5">
                                    <span className={dark ? 'text-gray-500' : 'text-gray-400'}>Offline Nonce:</span>
                                    <span className="font-mono">{activeReceipt.nonce}</span>
                                </div>
                            )}
                            {activeReceipt.payload && (
                                <div className="text-center pt-4 border-t border-dashed mt-2">
                                    <div className="text-xs font-bold text-amber-500 mb-2">⚠️ Offline Pay: Have driver scan this QR code:</div>
                                    <OfflineQrCanvas text={typeof activeReceipt.payload === "string" ? activeReceipt.payload : JSON.stringify(activeReceipt.payload)} size={180} />
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3">
                            <button 
                              className={`flex-1 py-3.5 rounded-xl font-black text-xs uppercase tracking-wider text-white transition-all ${
                                role === 'driver' 
                                  ? 'bg-[#FF6B00] hover:bg-[#E05E00]' 
                                  : role === 'cooperative' 
                                    ? 'bg-[#10B981] hover:bg-[#0E9F6E]' 
                                    : 'bg-black dark:bg-[#FFE600] dark:text-black hover:opacity-90'
                              }`} 
                              onClick={() => window.print()}
                            >
                              Print
                            </button>
                            <button 
                              className={`flex-1 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider border transition-all ${dark ? 'border-white/10 text-white hover:bg-white/5' : 'border-gray-200 text-gray-800 hover:bg-gray-50'}`} 
                              onClick={() => setActiveReceipt(null)}
                            >
                              Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Scanned Confirm Payment Modal */}
            {scannedRecipient && (
                <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
                    <div className={`rounded-[32px] p-8 max-w-sm w-full border shadow-2xl transition-all ${dark ? 'bg-[#0E0F14] border-white/10 text-white' : 'bg-white border-gray-100 text-gray-900'}`}>
                        <h3 className="text-xl font-black mb-4">Pay</h3>
                        
                        <div className="mb-4 text-xs">
                            <div className={dark ? 'text-gray-500' : 'text-gray-400'}>Recipient:</div>
                            <div className={`text-base font-extrabold mt-0.5 ${role === 'driver' ? 'text-[#FF8833]' : role === 'cooperative' ? 'text-[#34D399]' : 'text-[#8A7D00] dark:text-[#FFE600]'}`}>{recipientName}</div>
                            <div className="font-mono break-all text-gray-500 mt-1">{scannedRecipient}</div>
                        </div>

                        <div className="mb-6">
                            <label className="block text-xs font-bold mb-2 uppercase text-gray-400">Payment Amount (XLM):</label>
                            <input 
                                value={amount} 
                                onChange={(e) => setAmount(e.target.value)} 
                                type="number" 
                                placeholder="0.00" 
                                className={`w-full ${dark ? 'bg-white/5 border-white/10 text-white placeholder-gray-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'} px-4 py-3 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all`} 
                                autoFocus 
                            />
                        </div>

                        <div className="flex gap-3">
                            <button 
                              className={`flex-1 py-3.5 rounded-xl font-black text-xs uppercase tracking-wider text-white transition-all ${
                                role === 'driver' 
                                  ? 'bg-[#FF6B00] hover:bg-[#E05E00]' 
                                  : role === 'cooperative' 
                                    ? 'bg-[#10B981] hover:bg-[#0E9F6E]' 
                                    : 'bg-[#FFE600] text-black hover:bg-[#E6CE00]'
                              }`}
                              onClick={async () => {
                                if (!amount || Number(amount) <= 0) return alert("Please enter a valid amount.");
                                setScannedRecipient(null);
                                await handleSend();
                              }} 
                              disabled={busy}
                            >
                                {busy ? "Paying..." : "Pay"}
                            </button>
                            <button 
                              className={`flex-1 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider border transition-all ${dark ? 'border-white/10 text-white hover:bg-white/5' : 'border-gray-200 text-gray-800 hover:bg-gray-50'}`}
                              onClick={() => {
                                setScannedRecipient(null);
                                setRecipient("");
                                setAmount("0");
                              }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const UserDashboard: React.FC = () => {
    const [activeTab, setActiveTab] = useState("wallet");
    const [userData, setUserData] = useState<any>(null);
    const [authLoading, setAuthLoading] = useState(true);
    const navigate = useNavigate();

    const refreshUser = async (uid: string) => {
        const snap = await getDoc(doc(db, "users", uid));
        if (snap.exists()) {
            const data = snap.data() as any;
            let liveBalance = data.walletBalance;
            if (data.publicKey) {
                try {
                    const stellarBal = await getLiveStellarBalance(data.publicKey);
                    if (Number(stellarBal) !== Number(data.walletBalance)) {
                        await updateDoc(doc(db, "users", uid), { walletBalance: Number(stellarBal) });
                        liveBalance = Number(stellarBal);
                    }
                } catch (e) {
                    console.warn("Could not sync live Stellar balance:", e);
                }
            }
            setUserData({ uid, ...data, walletBalance: liveBalance });
        }
    };

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(async (user) => {
            if (!user) {
                navigate("/auth");
                return;
            }

            const profile = (await ensureUserProfile(user)) as any;
            if (profile.publicKey) {
                try {
                    const stellarBal = await getLiveStellarBalance(profile.publicKey);
                    if (Number(stellarBal) !== Number(profile.walletBalance)) {
                        await updateDoc(doc(db, "users", user.uid), { walletBalance: Number(stellarBal) });
                        profile.walletBalance = Number(stellarBal);
                    }
                } catch (e) {
                    console.warn("Could not sync initial live Stellar balance:", e);
                }
            }
            setUserData(profile);
            setAuthLoading(false);
            maybeRunDailyTrustUpdate(profile).catch(() => undefined);

            const userUnsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
                if (snap.exists()) setUserData({ uid: user.uid, ...snap.data() });
            }, (err) => console.warn("User profile snapshot error:", err));

            return () => userUnsub();
        });

        return () => unsubscribe();
    }, [navigate]);

    useEffect(() => {
        if (!userData?.uid) return;
        syncBluetoothQueue(userData.uid).catch(() => undefined);
        syncReceivedOfflinePayments(userData.uid).catch(() => undefined);
    }, [userData?.uid]);

    if (authLoading || !userData) return <LoadingWorkspace message="Loading Aranova workspace..." />;
    if (userData.approved === false) return <LoadingWorkspace message="Verification pending..." />;

    return (
        <UserLayout activeTab={activeTab} onTabChange={setActiveTab} userData={userData}>
            <CommuterPanel userData={userData} onRefresh={() => refreshUser(userData.uid)} />
        </UserLayout>
    );
};

export default UserDashboard;