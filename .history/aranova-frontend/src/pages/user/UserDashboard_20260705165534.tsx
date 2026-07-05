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
    serverTimestamp,
    updateDoc,
    where,
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

// Helper: resolve active signer credentials
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
            QRCode.toCanvas(canvasRef.current, text, { width: size, margin: 2, color: { dark: '#000000', light: '#FFFFFF' } }, (error) => {
                if (error) console.error("Error generating QR:", error);
            });
        }
    }, [text, size]);

    return (
        <div style={{ display: "flex", justifyContent: "center", margin: "16px auto" }}>
            <canvas ref={canvasRef} style={{ borderRadius: 16, maxWidth: "100%", height: "auto", background: "#fff", padding: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }} />
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
    const [amount, setAmount] = useState("");
    const [busy, setBusy] = useState(false);
    const [offlineQueueLength, setOfflineQueueLength] = useState(0);

    // QR & Camera & Offline States
    const [scanning, setScanning] = useState(false);
    const [showReceiveModal, setShowReceiveModal] = useState(false);
    const [activeReceipt, setActiveReceipt] = useState<any>(null);
    const [scannedRecipient, setScannedRecipient] = useState<string | null>(null);
    const [recipientName, setRecipientName] = useState("");

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

    useEffect(() => { checkOfflineQueue(); }, [userData.uid]);

    useEffect(() => {
        if (!userData.uid) return;

        const destinations = [userData.uid];
        if (userData.publicKey) destinations.push(userData.publicKey);
        if (userData.email) destinations.push(userData.email);

        const transQuery = query(collection(db, "transactions"), where("to", "in", destinations));

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

            if (lastTxId === "") {
                lastTxId = latestDoc.id;
                return;
            }

            if (latestDoc.id !== lastTxId) {
                lastTxId = latestDoc.id;
                if (data.from !== userData.uid) {
                    setActiveReceipt({
                        type: "Payment Received (On-Chain)",
                        amount: Number(data.amount || 0),
                        sender: data.from,
                        recipient: userData.publicKey,
                        status: "Settled On-Chain",
                        txHash: data.blockchainTxHash,
                        timestamp: data.createdAt?.toMillis() || Date.now(),
                    });
                    onRefresh();
                }
            }
        }, (err) => console.warn("Transaction listener warning:", err));

        let closeHorizonStream = () => { };
        if (userData.publicKey) {
            const horizon = new Horizon.Server(HORIZON_URL);
            let initialMessage = true;
            try {
                closeHorizonStream = horizon.payments()
                    .forAccount(userData.publicKey)
                    .cursor("now")
                    .stream({
                        onmessage: (payment: any) => {
                            if (initialMessage) { initialMessage = false; return; }
                            if (payment.type === "payment" && payment.asset_type === "native" && payment.to === userData.publicKey && payment.from !== userData.publicKey) {
                                setActiveReceipt({
                                    type: "Payment Received (Stellar Ledger)",
                                    amount: Number(payment.amount),
                                    sender: payment.from,
                                    recipient: userData.publicKey,
                                    status: "Settled On-Chain",
                                    txHash: payment.transaction_hash,
                                    timestamp: Date.now(),
                                });
                                onRefresh();
                            }
                        },
                        onerror: (err: any) => { console.warn("Horizon payments stream warning:", err); }
                    });
            } catch (err) { console.error("Stellar Horizon stream setup error:", err); }
        }
        return () => { unsub(); closeHorizonStream(); };
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
                () => { /* silent ignore frame scan failure */ }
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
                        type: "Offline QR Scan (Received)",
                        amount: Number(payload.amount),
                        sender: payload.payerKey || payload.payerId,
                        recipient: userData.publicKey,
                        status: navigator.onLine ? "Settled On-Chain" : "Queued Offline",
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
                        if (!snap.empty) { resolvedName = snap.docs[0].data().displayName || snap.docs[0].data().coopName || text; }
                    } else {
                        const snap = await getDoc(doc(db, "users", text));
                        if (snap.exists()) { resolvedName = snap.data().displayName || snap.data().coopName || text; }
                    }
                } catch (e) { console.warn("Lookup failed:", e); }
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
                type: "offline_pay", payerId: userData.uid, payerKey: userData.publicKey,
                recipient, amount: value, nonce, timestamp: Date.now(),
            };

            const key = `aranova_offline_queue_${userData.uid}`;
            const queued = JSON.parse(localStorage.getItem(key) || "[]");
            queued.push(payloadObj);
            localStorage.setItem(key, JSON.stringify(queued));

            queueBluetoothPayment(userData.uid, { recipient, amount: value, mode: "bluetooth" });
            addDoc(collection(db, "offline_payments"), {
                payerId: userData.uid, recipient, amount: value, channel: "bluetooth",
                status: "queued-offline", createdAt: serverTimestamp(),
            }).catch(() => undefined);

            checkOfflineQueue();
            setActiveReceipt({
                type: "Offline Send (Queued via Bluetooth & QR)", amount: value,
                sender: userData.publicKey, recipient, status: "Queued Offline",
                nonce, timestamp: Date.now(), payload: payloadObj,
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
                if (!qSnap.empty) destUid = qSnap.docs[0].id;
            }

            if (!destPublicKey) throw new Error("Could not resolve recipient's Stellar public key.");

            const handler = await getSigningHandler(userData, NETWORK_PASSPHRASE);
            const txHash = await submitStellarPayment(userData.publicKey, destPublicKey, value.toFixed(7), handler);

            await addDoc(collection(db, "transactions"), {
                type: "send", from: userData.uid, to: destUid || destPublicKey, amount: value,
                channel: "wallet", status: "completed", blockchainTxHash: txHash, createdAt: serverTimestamp(),
            });

            await updateDoc(doc(db, "users", userData.uid), {
                walletBalance: increment(-value),
                trustScore: Math.min(100, Number(userData.trustScore || 0) + 1),
                lastTrustUpdate: serverTimestamp(),
            });

            setActiveReceipt({
                type: "Send payment (Sent)", amount: value, sender: userData.publicKey,
                recipient: destPublicKey, status: "Settled On-Chain", txHash, timestamp: Date.now(),
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

    return (
        <>
            {/* INJECT UI STYLES FOR BENTO GRID & ANIMATIONS */}
            <style>{`
        .bento-grid { display: grid; gap: 20px; grid-template-columns: 1fr; margin-bottom: 24px; }
        @media (min-width: 768px) { .bento-grid { grid-template-columns: repeat(3, 1fr); } }
        
        .bento-hero { grid-column: span 1; display: flex; flex-direction: column; justify-content: center; }
        @media (min-width: 768px) { .bento-hero { grid-column: span 3; } }
        @media (min-width: 1024px) { .bento-hero { grid-column: span 1; } } /* Adjusted for richer desktop UI */
        
        .card-surface { 
          background: ${dark ? "#11131C" : "#FFFFFF"}; 
          border: 1px solid ${dark ? "#24283B" : "#E5E7EB"}; 
          border-radius: 24px; 
          padding: 24px; 
          box-shadow: ${dark ? "0 10px 30px -10px rgba(0,0,0,0.5)" : "0 4px 20px -2px rgba(0,0,0,0.03)"}; 
          transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .card-surface:hover { transform: translateY(-2px); box-shadow: ${dark ? "0 15px 35px -10px rgba(0,0,0,0.6)" : "0 12px 30px -4px rgba(0,0,0,0.06)"}; }
        
        .card-hero-surface { 
          background: linear-gradient(145deg, ${dark ? "#1E293B, #0F172A" : "#3B82F6, #1D4ED8"}); 
          color: #FFFFFF; 
          border: none;
        }
        
        .btn-modern { 
          border: none; border-radius: 16px; padding: 14px 20px; font-weight: 700; font-size: 15px;
          cursor: pointer; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); 
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .btn-modern:active { transform: scale(0.97); }
        .btn-modern:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
        
        .btn-primary { background: ${dark ? "#3B82F6" : "#2563EB"}; color: #FFF; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2); }
        .btn-primary:hover:not(:disabled) { background: ${dark ? "#60A5FA" : "#1D4ED8"}; box-shadow: 0 6px 16px rgba(37, 99, 235, 0.3); }
        
        .btn-ghost { background: ${dark ? "rgba(255,255,255,0.05)" : "#F1F5F9"}; color: ${dark ? "#F8FAFC" : "#0F172A"}; }
        .btn-ghost:hover:not(:disabled) { background: ${dark ? "rgba(255,255,255,0.1)" : "#E2E8F0"}; }
        
        .input-modern { 
          width: 100%; border: 1px solid ${dark ? "#334155" : "#E2E8F0"}; border-radius: 16px; 
          padding: 16px 20px; font-size: 15px; background: ${dark ? "#0F172A" : "#F8FAFC"}; 
          color: ${dark ? "#F8FAFC" : "#0F172A"}; transition: all 0.2s; outline: none; 
        }
        .input-modern:focus { border-color: ${dark ? "#3B82F6" : "#2563EB"}; box-shadow: 0 0 0 4px ${dark ? "rgba(59, 130, 246, 0.15)" : "rgba(37, 99, 235, 0.15)"}; background: ${dark ? "#1E293B" : "#FFFFFF"}; }
        
        .modal-overlay { position: fixed; inset: 0; background: ${dark ? "rgba(0,0,0,0.8)" : "rgba(15, 23, 42, 0.6)"}; backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 9999; animation: fade 0.2s ease-out forwards; padding: 16px; }
        .modal-content { background: ${dark ? "#11131C" : "#FFFFFF"}; color: ${dark ? "#F8FAFC" : "#0F172A"}; border-radius: 32px; padding: 32px; width: 100%; max-width: 420px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; border: 1px solid ${dark ? "#24283B" : "transparent"}; }
        
        @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(24px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>

            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

                {/* Offline Sync Banner */}
                {offlineQueueLength > 0 && (
                    <div style={{ background: dark ? "rgba(59, 130, 246, 0.1)" : "#EFF6FF", border: `1px solid ${dark ? "rgba(59, 130, 246, 0.2)" : "#BFDBFE"}`, borderRadius: 20, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
                        <div>
                            <div style={{ fontSize: 14, fontWeight: 800, color: dark ? "#60A5FA" : "#1D4ED8", display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 18 }}>📡</span> Offline Transactions Queued
                            </div>
                            <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4, color: dark ? "#94A3B8" : "#475569" }}>You have {offlineQueueLength} payments waiting to securely sync.</div>
                        </div>
                        <button className="btn-modern btn-primary" onClick={handleSyncQueue} disabled={busy || !navigator.onLine} style={{ padding: "10px 16px", fontSize: 14 }}>
                            Sync Queue
                        </button>
                    </div>
                )}

                {/* Bento Grid Stats */}
                <div className="bento-grid">
                    {/* Main Wallet Hero Card */}
                    <div className="card-surface card-hero-surface bento-hero">
                        <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.8, textTransform: "uppercase", letterSpacing: "0.5px" }}>Available Balance</div>
                        <div style={{ fontSize: 40, fontWeight: 800, marginTop: 8, marginBottom: 4, letterSpacing: "-1px" }}>{formatXlm(Number(userData.walletBalance || 0))} XLM</div>
                        <div style={{ fontSize: 13, opacity: 0.7 }}>Ready to send & receive</div>
                    </div>

                    <div className="card-surface">
                        <div style={{ fontSize: 13, fontWeight: 700, color: dark ? "#94A3B8" : "#64748B", textTransform: "uppercase", letterSpacing: "0.5px" }}>Vault Staked</div>
                        <div style={{ fontSize: 28, fontWeight: 800, marginTop: 12, marginBottom: 4 }}>{formatXlm(Number(userData.vaultBalance || 0))} XLM</div>
                        <div style={{ fontSize: 13, color: dark ? "#64748B" : "#94A3B8" }}>Earning yield via Soroban</div>
                    </div>

                    <div className="card-surface">
                        <div style={{ fontSize: 13, fontWeight: 700, color: dark ? "#94A3B8" : "#64748B", textTransform: "uppercase", letterSpacing: "0.5px" }}>Trust Score</div>
                        <div style={{ fontSize: 28, fontWeight: 800, marginTop: 12, marginBottom: 4, color: dark ? "#34D399" : "#059669" }}>{Number(userData.trustScore || 0)} <span style={{ fontSize: 16, opacity: 0.5 }}>/100</span></div>
                        <div style={{ fontSize: 13, color: dark ? "#64748B" : "#94A3B8" }}>Max credit: {formatXlm(availableCredit)} XLM</div>
                    </div>
                </div>

                {/* Action Center Container */}
                <div className="card-surface" style={{ padding: 32 }}>
                    <h3 style={{ marginTop: 0, marginBottom: 24, fontSize: 20, fontWeight: 800 }}>Quick Actions</h3>

                    <div style={{ display: "grid", gap: 20 }}>
                        {/* Input Row */}
                        <div style={{ display: "flex", gap: 12, flexDirection: "column", '@media(min-width: 768px)': { flexDirection: "row" } } as any}>
                            <div style={{ flex: 1, position: "relative" }}>
                                <input
                                    className="input-modern"
                                    value={recipient}
                                    onChange={(e) => setRecipient(e.target.value)}
                                    placeholder="Recipient (Key, Email, ID)"
                                />
                            </div>
                            <div style={{ flex: 1 }}>
                                <input
                                    className="input-modern"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    type="number"
                                    placeholder="Amount in XLM"
                                />
                            </div>
                        </div>

                        {/* Action Buttons Row */}
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
                            <button className="btn-modern btn-primary" style={{ flex: "1 1 120px" }} onClick={handleSend} disabled={busy}>
                                {busy ? "Processing..." : "Send XLM"}
                            </button>
                            <button className="btn-modern btn-ghost" style={{ flex: "1 1 120px" }} onClick={() => setShowReceiveModal(true)}>
                                Receive
                            </button>
                            <button className="btn-modern btn-ghost" style={{ flex: "1 1 120px" }} onClick={() => setScanning((s) => !s)}>
                                {scanning ? "Close Scanner" : "📷 Scan QR"}
                            </button>
                            <button className="btn-modern btn-ghost" style={{ flex: "1 1 120px", opacity: 0.6 }} onClick={() => alert("Withdraw is reserved for future PDAX integration.")}>
                                Withdraw
                            </button>
                        </div>
                    </div>
                </div>

                {/* QR Code Scanner Inline Viewer */}
                {scanning && (
                    <div className="card-surface" style={{ textAlign: "center", padding: 32, animation: "fade 0.3s" }}>
                        <h4 style={{ marginTop: 0, marginBottom: 16, fontSize: 18 }}>Scan to Pay / Receive</h4>
                        <div id="reader" style={{ width: "100%", maxWidth: 360, height: 360, margin: "0 auto", borderRadius: 24, overflow: "hidden", border: `2px dashed ${dark ? "#3B82F6" : "#2563EB"}`, padding: 8 }} />
                    </div>
                )}

                {/* ── MODALS ────────────────────────────────────────────────────────── */}

                {/* Receive QR Modal */}
                {showReceiveModal && (
                    <div className="modal-overlay" onClick={() => setShowReceiveModal(false)}>
                        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ textAlign: "center" }}>
                            <h3 style={{ marginTop: 0, fontSize: 22, fontWeight: 800 }}>Receive Payment</h3>
                            <p style={{ fontSize: 14, color: dark ? "#94A3B8" : "#64748B", marginTop: 4 }}>Scan this QR code to securely send XLM to this account.</p>

                            <div style={{ background: dark ? "#FFFFFF" : "#F8FAFC", borderRadius: 24, padding: 24, display: "inline-block", margin: "24px 0" }}>
                                <OfflineQrCanvas text={userData.publicKey || userData.uid || ""} size={220} />
                            </div>

                            <div style={{ background: dark ? "rgba(255,255,255,0.05)" : "#F1F5F9", padding: "12px 16px", borderRadius: 12, marginBottom: 24 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: dark ? "#64748B" : "#94A3B8", marginBottom: 4 }}>Public Key</div>
                                <div style={{ fontSize: 13, wordBreak: "break-all", fontFamily: "monospace", opacity: 0.9 }}>{userData.publicKey}</div>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                <button className="btn-modern btn-ghost" onClick={() => { navigator.clipboard.writeText(userData.publicKey); alert("Copied to clipboard!"); }}>Copy Key</button>
                                <button className="btn-modern btn-ghost" onClick={handleDownloadQr}>Save Image</button>
                                <button className="btn-modern btn-primary" style={{ gridColumn: "span 2" }} onClick={() => setShowReceiveModal(false)}>Done</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Receipt Modal */}
                {activeReceipt && (
                    <div className="modal-overlay">
                        <div className="modal-content">
                            <div style={{ textAlign: "center", marginBottom: 28 }}>
                                <div style={{ width: 64, height: 64, borderRadius: "50%", background: dark ? "rgba(16, 185, 129, 0.15)" : "#ECFDF5", color: dark ? "#34D399" : "#10B981", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                </div>
                                <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 22, fontWeight: 800 }}>Transaction Success</h3>
                                <div style={{ color: dark ? "#34D399" : "#059669", fontWeight: 900, fontSize: 36, letterSpacing: "-1px" }}>{activeReceipt.amount} XLM</div>
                                <div style={{ fontSize: 14, color: dark ? "#94A3B8" : "#64748B", marginTop: 4 }}>{activeReceipt.type}</div>
                            </div>

                            <div style={{ background: dark ? "rgba(255,255,255,0.03)" : "#F8FAFC", borderRadius: 20, padding: 20, marginBottom: 28, display: "flex", flexDirection: "column", gap: 16 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <span style={{ fontSize: 13, color: dark ? "#94A3B8" : "#64748B", fontWeight: 600 }}>Status</span>
                                    <span style={{ fontWeight: 700, color: dark ? "#34D399" : "#10B981", fontSize: 14, background: dark ? "rgba(16,185,129,0.1)" : "#D1FAE5", padding: "4px 10px", borderRadius: 8 }}>{activeReceipt.status}</span>
                                </div>
                                <div style={{ height: 1, background: dark ? "#24283B" : "#E2E8F0" }} />

                                <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                                    <span style={{ fontSize: 13, color: dark ? "#94A3B8" : "#64748B", fontWeight: 600, flexShrink: 0 }}>From</span>
                                    <span style={{ fontFamily: "monospace", fontSize: 13, wordBreak: "break-all", textAlign: "right" }}>{activeReceipt.sender.slice(0, 12)}...{activeReceipt.sender.slice(-8)}</span>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                                    <span style={{ fontSize: 13, color: dark ? "#94A3B8" : "#64748B", fontWeight: 600, flexShrink: 0 }}>To</span>
                                    <span style={{ fontFamily: "monospace", fontSize: 13, wordBreak: "break-all", textAlign: "right" }}>{activeReceipt.recipient.slice(0, 12)}...{activeReceipt.recipient.slice(-8)}</span>
                                </div>

                                <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                                    <span style={{ fontSize: 13, color: dark ? "#94A3B8" : "#64748B", fontWeight: 600 }}>Time</span>
                                    <span style={{ fontSize: 13, fontWeight: 500 }}>{new Date(activeReceipt.timestamp).toLocaleString()}</span>
                                </div>

                                {activeReceipt.txHash && (
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                                        <span style={{ fontSize: 13, color: dark ? "#94A3B8" : "#64748B", fontWeight: 600, flexShrink: 0 }}>Network Hash</span>
                                        <span style={{ fontFamily: "monospace", fontSize: 12, wordBreak: "break-all", textAlign: "right", color: dark ? "#60A5FA" : "#2563EB" }}>{activeReceipt.txHash.slice(0, 16)}...</span>
                                    </div>
                                )}
                                {activeReceipt.nonce && (
                                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                                        <span style={{ fontSize: 13, color: dark ? "#94A3B8" : "#64748B", fontWeight: 600 }}>Offline ID</span>
                                        <span style={{ fontFamily: "monospace", fontSize: 13 }}>{activeReceipt.nonce}</span>
                                    </div>
                                )}
                            </div>

                            {activeReceipt.payload && (
                                <div style={{ textAlign: "center", marginBottom: 28 }}>
                                    <div style={{ fontSize: 13, color: "#F59E0B", marginBottom: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(245, 158, 11, 0.1)", padding: "6px 12px", borderRadius: 8 }}>
                                        ⚠️ Offline Sync Required: Scan this with receiving device
                                    </div>
                                    <div style={{ background: "#FFF", display: "inline-block", padding: 8, borderRadius: 16 }}>
                                        <OfflineQrCanvas text={typeof activeReceipt.payload === "string" ? activeReceipt.payload : JSON.stringify(activeReceipt.payload)} size={160} />
                                    </div>
                                </div>
                            )}

                            <div style={{ display: "flex", gap: 12 }}>
                                <button className="btn-modern btn-ghost" style={{ flex: 1 }} onClick={() => window.print()}>Save PDF</button>
                                <button className="btn-modern btn-primary" style={{ flex: 1 }} onClick={() => setActiveReceipt(null)}>Done</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Confirm Scanned Payment Modal */}
                {scannedRecipient && (
                    <div className="modal-overlay">
                        <div className="modal-content">
                            <h3 style={{ marginTop: 0, marginBottom: 24, fontSize: 22, fontWeight: 800 }}>Confirm Transfer</h3>

                            <div style={{ background: dark ? "rgba(255,255,255,0.03)" : "#F8FAFC", borderRadius: 20, padding: 20, marginBottom: 24 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: dark ? "#94A3B8" : "#64748B", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>Sending to</div>
                                <div style={{ fontSize: 18, fontWeight: 800, color: dark ? "#60A5FA" : "#2563EB", marginBottom: 4 }}>{recipientName}</div>
                                <div style={{ fontSize: 12, fontFamily: "monospace", color: dark ? "#64748B" : "#94A3B8", wordBreak: "break-all" }}>{scannedRecipient}</div>
                            </div>

                            <div style={{ marginBottom: 32 }}>
                                <label style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, display: "block" }}>Amount (XLM)</label>
                                <input
                                    className="input-modern"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    type="number"
                                    placeholder="0.00"
                                    style={{ fontSize: 24, fontWeight: 800, padding: "20px 24px", textAlign: "center" }}
                                    autoFocus
                                />
                            </div>

                            <div style={{ display: "flex", gap: 12 }}>
                                <button className="btn-modern btn-ghost" style={{ flex: 1 }} onClick={() => {
                                    setScannedRecipient(null);
                                    setRecipient("");
                                    setAmount("");
                                }}>
                                    Cancel
                                </button>
                                <button className="btn-modern btn-primary" style={{ flex: 1 }} onClick={async () => {
                                    if (!amount || Number(amount) <= 0) return alert("Please enter a valid amount.");
                                    setScannedRecipient(null);
                                    await handleSend();
                                }} disabled={busy}>
                                    {busy ? "Processing..." : "Confirm Pay"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </>
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
                } catch (e) { console.warn("Could not sync live Stellar balance:", e); }
            }
            setUserData({ uid, ...data, walletBalance: liveBalance });
        }
    };

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(async (user) => {
            if (!user) { navigate("/auth"); return; }
            const profile = (await ensureUserProfile(user)) as any;
            if (profile.publicKey) {
                try {
                    const stellarBal = await getLiveStellarBalance(profile.publicKey);
                    if (Number(stellarBal) !== Number(profile.walletBalance)) {
                        await updateDoc(doc(db, "users", user.uid), { walletBalance: Number(stellarBal) });
                        profile.walletBalance = Number(stellarBal);
                    }
                } catch (e) { console.warn("Could not sync initial live Stellar balance:", e); }
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