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

const StatCard: React.FC<{ title: string; value: string; note?: string; dark: boolean }> = ({ title, value, note, dark }) => (
    <div style={{ background: dark ? "#08111f" : "#ffffff", border: `1px solid ${dark ? "#1f2937" : "#e5e7eb"}`, borderRadius: 18, padding: 16 }}>
        <div style={{ fontSize: 12, color: dark ? "#94a3b8" : "#64748b", marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 20, fontWeight: 800 }}>{value}</div>
        {note && <div style={{ marginTop: 6, fontSize: 12, color: dark ? "#64748b" : "#94a3b8" }}>{note}</div>}
    </div>
);

const PrimaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { dark: boolean; ghost?: boolean }> = ({ dark, ghost, style, ...props }) => (
    <button
        {...props}
        style={{
            border: "none",
            borderRadius: 999,
            padding: "12px 16px",
            fontWeight: 800,
            cursor: props.disabled ? "not-allowed" : "pointer",
            background: ghost ? (dark ? "#1f2937" : "#e2e8f0") : (dark ? "#10b981" : "#0f766e"),
            color: ghost ? (dark ? "#f8fafc" : "#111827") : "#ffffff",
            ...style,
        }}
    />
);

const inputStyle = (dark: boolean) => ({
    width: "100%",
    border: `1px solid ${dark ? "#334155" : "#cbd5e1"}`,
    borderRadius: 14,
    padding: "12px 14px",
    background: dark ? "#0f172a" : "#ffffff",
    color: dark ? "#f8fafc" : "#111827",
    outline: "none",
});

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

    useEffect(() => {
        checkOfflineQueue();
    }, [userData.uid]);

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

        // Stellar Horizon stream listener for external payments (e.g. Lobstr, Freighter)
        let closeHorizonStream = () => {};
        if (userData.publicKey) {
            const horizon = new Horizon.Server(HORIZON_URL);
            let initialMessage = true;
            try {
                closeHorizonStream = horizon.payments()
                    .forAccount(userData.publicKey)
                    .cursor("now")
                    .stream({
                        onmessage: (payment: any) => {
                            if (initialMessage) {
                                initialMessage = false;
                                return;
                            }
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
                type: "Offline Send (Queued via Bluetooth & QR)",
                amount: value,
                sender: userData.publicKey,
                recipient,
                status: "Queued Offline",
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
                type: "Send payment (Sent)",
                amount: value,
                sender: userData.publicKey,
                recipient: destPublicKey,
                status: "Settled On-Chain",
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

    return (
        <div style={{ display: "grid", gap: 16 }}>
            {/* Offline Sync Banner */}
            {offlineQueueLength > 0 && (
                <div style={{ background: dark ? "#1e3a8a33" : "#eff6ff", border: `1px solid ${dark ? "#1e40af4d" : "#bfdbfe"}`, borderRadius: 18, padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                        <span style={{ fontSize: 13, fontWeight: 800, color: dark ? "#60a5fa" : "#1d4ed8" }}>📡 Offline Transactions Queued</span>
                        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>You have {offlineQueueLength} payments waiting to sync.</div>
                    </div>
                    <PrimaryButton dark={dark} onClick={handleSyncQueue} disabled={busy || !navigator.onLine}>
                        Sync Queue
                    </PrimaryButton>
                </div>
            )}

            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                <StatCard dark={dark} title="Wallet Balance" value={`${formatXlm(Number(userData.walletBalance || 0))} XLM`} note="Send, receive, withdraw" />
                <StatCard dark={dark} title="Vault Balance" value={`${formatXlm(Number(userData.vaultBalance || 0))} XLM`} note="View/Lock on Vault tab" />
                <StatCard dark={dark} title="Trust Score" value={`${Number(userData.trustScore || 0)}/100`} note={`Credit ceiling ${formatXlm(availableCredit)} XLM`} />
            </div>

            <div style={{ background: dark ? "#08111f" : "#ffffff", borderRadius: 22, padding: 20, border: `1px solid ${dark ? "#1f2937" : "#e5e7eb"}` }}>
                <h3 style={{ marginTop: 0 }}>Wallet Actions</h3>
                <div style={{ display: "grid", gap: 12 }}>
                    <div style={{ display: "flex", gap: 8 }}>
                        <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Recipient address, public key or email" style={{ ...inputStyle(dark), flex: 1 }} />
                        <PrimaryButton dark={dark} ghost onClick={() => setScanning((s) => !s)} style={{ flexShrink: 0 }}>
                            {scanning ? "Close Cam" : "📷 Scan QR"}
                        </PrimaryButton>
                    </div>
                    <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" placeholder="Amount in XLM" style={inputStyle(dark)} />
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <PrimaryButton dark={dark} onClick={handleSend} disabled={busy}>Send</PrimaryButton>
                        <PrimaryButton dark={dark} ghost onClick={() => setShowReceiveModal(true)}>Receive</PrimaryButton>
                        <PrimaryButton dark={dark} ghost onClick={() => alert("Withdraw is reserved for future PDAX integration.")}>Withdraw</PrimaryButton>
                    </div>
                </div>
            </div>

            {/* QR Code Scanner Overlay */}
            {scanning && (
                <div style={{ background: dark ? "#08111f" : "#ffffff", borderRadius: 22, padding: 20, border: `1px solid ${dark ? "#1f2937" : "#e5e7eb"}`, textAlign: "center" }}>
                    <h4 style={{ marginTop: 0, marginBottom: 12 }}>Scanning QR Code...</h4>
                    <div id="reader" style={{ width: "100%", maxWidth: 300, height: 300, margin: "0 auto", borderRadius: 14, overflow: "hidden", border: "1px dashed #10b981" }} />
                </div>
            )}

            {/* Receive QR Modal */}
            {showReceiveModal && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
                    <div style={{ background: dark ? "#111827" : "#ffffff", color: dark ? "#f8fafc" : "#111827", borderRadius: 24, padding: 24, maxWidth: 320, width: "90%", textAlign: "center" }}>
                        <h3 style={{ marginTop: 0 }}>Receive Payment</h3>
                        <OfflineQrCanvas text={userData.publicKey || userData.uid || ""} size={200} />
                        <div style={{ fontSize: 12, wordBreak: "break-all", opacity: 0.8, marginBottom: 16 }}>{userData.publicKey}</div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <PrimaryButton dark={dark} style={{ flex: "1 1 auto", fontSize: 12, padding: "8px 12px" }} onClick={() => {
                                navigator.clipboard.writeText(userData.publicKey);
                                alert("Public key copied to clipboard!");
                            }}>Copy Key</PrimaryButton>
                            <PrimaryButton dark={dark} style={{ flex: "1 1 auto", fontSize: 12, padding: "8px 12px" }} onClick={handleDownloadQr}>Download</PrimaryButton>
                            <PrimaryButton dark={dark} ghost style={{ flex: "1 1 auto", fontSize: 12, padding: "8px 12px" }} onClick={() => setShowReceiveModal(false)}>Close</PrimaryButton>
                        </div>
                    </div>
                </div>
            )}

            {/* Payment Receipt / Confirmation Modal */}
            {activeReceipt && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
                    <div style={{ background: dark ? "#111827" : "#ffffff", color: dark ? "#f8fafc" : "#111827", borderRadius: 24, padding: 24, maxWidth: 380, width: "90%", border: `1px solid ${dark ? "#1f2937" : "#e5e7eb"}`, textAlign: "left" }}>
                        <div style={{ textAlign: "center", marginBottom: 20 }}>
                            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#10b981", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 12px" }}>✓</div>
                            <h3 style={{ marginTop: 0, marginBottom: 4 }}>Transaction Receipt</h3>
                            <div style={{ color: "#10b981", fontWeight: 800, fontSize: 24 }}>{activeReceipt.amount} XLM</div>
                            <div style={{ fontSize: 12, opacity: 0.6 }}>{activeReceipt.type}</div>
                        </div>

                        <div style={{ display: "grid", gap: 12, fontSize: 13, borderTop: `1px solid ${dark ? "#1f2937" : "#e5e7eb"}`, borderBottom: `1px solid ${dark ? "#1f2937" : "#e5e7eb"}`, padding: "16px 0", marginBottom: 20 }}>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ opacity: 0.6 }}>Status:</span>
                                <span style={{ fontWeight: 700, color: "#10b981" }}>{activeReceipt.status}</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                <span style={{ opacity: 0.6, flexShrink: 0 }}>Sender:</span>
                                <span style={{ wordBreak: "break-all", textAlign: "right" }}>{activeReceipt.sender.slice(0, 10)}...{activeReceipt.sender.slice(-10)}</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                <span style={{ opacity: 0.6, flexShrink: 0 }}>Recipient:</span>
                                <span style={{ wordBreak: "break-all", textAlign: "right" }}>{activeReceipt.recipient.slice(0, 10)}...{activeReceipt.recipient.slice(-10)}</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ opacity: 0.6 }}>Date/Time:</span>
                                <span>{new Date(activeReceipt.timestamp).toLocaleString()}</span>
                            </div>
                            {activeReceipt.txHash && (
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                    <span style={{ opacity: 0.6, flexShrink: 0 }}>Tx Hash:</span>
                                    <span style={{ wordBreak: "break-all", fontSize: 11, textAlign: "right" }}>{activeReceipt.txHash.slice(0, 12)}...</span>
                                </div>
                            )}
                            {activeReceipt.nonce && (
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <span style={{ opacity: 0.6 }}>Offline Nonce:</span>
                                    <span>{activeReceipt.nonce}</span>
                                </div>
                            )}
                            {activeReceipt.payload && (
                                <div style={{ textAlign: "center", marginTop: 12, borderTop: `1px solid ${dark ? "#334155" : "#cbd5e1"}`, paddingTop: 12 }}>
                                    <div style={{ fontSize: 11, color: "#eab308", marginBottom: 6, fontWeight: 700 }}>⚠️ Offline Pay: Have driver scan this QR code:</div>
                                    <OfflineQrCanvas text={typeof activeReceipt.payload === "string" ? activeReceipt.payload : JSON.stringify(activeReceipt.payload)} size={180} />
                                </div>
                            )}
                        </div>

                        <div style={{ display: "flex", gap: 10 }}>
                            <PrimaryButton dark={dark} style={{ flex: 1 }} onClick={() => window.print()}>Print Receipt</PrimaryButton>
                            <PrimaryButton dark={dark} ghost style={{ flex: 1 }} onClick={() => setActiveReceipt(null)}>Close</PrimaryButton>
                        </div>
                    </div>
                </div>
            )}

            {/* Scanned Confirm Payment Modal */}
            {scannedRecipient && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
                    <div style={{ background: dark ? "#111827" : "#ffffff", color: dark ? "#f8fafc" : "#111827", borderRadius: 24, padding: 24, maxWidth: 360, width: "90%", border: `1px solid ${dark ? "#1f2937" : "#e5e7eb"}`, textAlign: "left" }}>
                        <h3 style={{ marginTop: 0 }}>Confirm Payment</h3>
                        
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 11, opacity: 0.6, textTransform: "uppercase", fontWeight: 700 }}>Recipient:</div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: "#4F8EF7" }}>{recipientName}</div>
                            <div style={{ fontSize: 11, wordBreak: "break-all", opacity: 0.6 }}>{scannedRecipient}</div>
                        </div>

                        <div style={{ marginBottom: 20 }}>
                            <label style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, display: "block" }}>Payment Amount (XLM):</label>
                            <input 
                                value={amount} 
                                onChange={(e) => setAmount(e.target.value)} 
                                type="number" 
                                placeholder="0.00" 
                                style={inputStyle(dark)} 
                                autoFocus 
                            />
                        </div>

                        <div style={{ display: "flex", gap: 10 }}>
                            <PrimaryButton dark={dark} style={{ flex: 1 }} onClick={async () => {
                                if (!amount || Number(amount) <= 0) return alert("Please enter a valid amount.");
                                setScannedRecipient(null);
                                await handleSend();
                            }} disabled={busy}>
                                {busy ? "Sending..." : "Send Payment"}
                            </PrimaryButton>
                            <PrimaryButton dark={dark} ghost style={{ flex: 1 }} onClick={() => {
                                setScannedRecipient(null);
                                setRecipient("");
                                setAmount("");
                            }}>
                                Cancel
                            </PrimaryButton>
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
