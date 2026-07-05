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
    setDoc,
} from "firebase/firestore";
import { auth, db } from "../../firebase/config";
import UserLayout from "../../components/layout/UserLayout";
import { useTheme } from "../../contexts/ThemeContext";
import { useAuth } from "../../contexts/AuthContext";
import LoadingWorkspace from "../../components/ui/LoadingWorkspace";
import {
    ensureUserProfile,
    maybeRunDailyTrustUpdate,
    formatXlm,
    queueBluetoothPayment,
    syncBluetoothQueue,
} from "../../services/aranovaWorkflow";
import CryptoJS from "crypto-js";
import { getLiveStellarBalance, payP2P, getVaultBalanceOnChain, HORIZON_URL } from "../../services/sorobanService";
import { Html5Qrcode } from "html5-qrcode";
import { Horizon } from "@stellar/stellar-sdk";
import QRCode from "qrcode";

const OfflineQrCanvas: React.FC<{ text: string; size?: number }> = ({ text, size = 200 }) => {
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
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

    const recSnap = await getDoc(doc(db, "users", uid));
    let vaultPct = 0;
    let preferredDays = 30;
    if (recSnap.exists()) {
        vaultPct = recSnap.data().vaultRoutingPct || 0;
        preferredDays = recSnap.data().vaultPreferredDays || 30;
    }

    for (const item of received) {
        try {
            const amount = Number(item.amount);
            const vault_portion = (amount * vaultPct) / 100;
            const wallet_portion = amount - vault_portion;

            await addDoc(collection(db, "offline_payments"), {
                payerId: item.payerId,
                payerKey: item.payerKey,
                recipientId: uid,
                amount: amount,
                nonce: item.nonce,
                channel: "offline_qr",
                status: "synced",
                createdAt: serverTimestamp(),
            });

            try {
                await updateDoc(doc(db, "users", item.payerId), { walletBalance: increment(-amount) });
            } catch (err) {
                console.warn("Could not decrement offline payer Firestore balance directly:", err);
            }

            await updateDoc(doc(db, "users", uid), { 
                walletBalance: increment(wallet_portion),
                vaultBalance: increment(vault_portion),
            });

            if (vault_portion > 0) {
                const calculatedMaturityDate = new Date(Date.now() + preferredDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
                const vaultId = `${uid}_vault_offline_${Date.now()}`;
                await setDoc(doc(db, "vaults", vaultId), {
                    ownerId: uid,
                    lockedAmount: vault_portion,
                    lockPercent: vaultPct,
                    lockDays: preferredDays,
                    maturityDate: calculatedMaturityDate,
                    status: "locked",
                    createdAt: serverTimestamp(),
                    isOfflineRouted: true,
                });
            }

            await addDoc(collection(db, "transactions"), {
                type: "offline_qr_settled",
                from: item.payerId,
                to: uid,
                amount: amount,
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
    const role = userData?.role || "commuter";
    
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

    // Custom PIN state
    const [showPinModal, setShowPinModal] = useState(false);
    const [pinDigits, setPinDigits] = useState("");
    const [pinError, setPinError] = useState("");
    const [pinPurpose, setPinPurpose] = useState("");
    const [pinCallback, setPinCallback] = useState<((secret: string) => void) | null>(null);

    // Processing breakdown loader state
    const [processingState, setProcessingState] = useState<string | null>(null);
    const [processingBreakdown, setProcessingBreakdown] = useState<{
        total: number;
        pct: number;
        vault: number;
        wallet: number;
    } | null>(null);

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
            const qrSize = 280;
            const cardW = 520;
            const cardH = 700;
            const canvas = document.createElement("canvas");
            canvas.width = cardW;
            canvas.height = cardH;
            const ctx = canvas.getContext("2d")!;

            // Role-specific palette
            const roleConfig = {
                commuter:    { bg: "#0E0F14", accent: "#FFE600", accentText: "#0B0C10", label: "Commuter Pass", icon: "💳" },
                driver:      { bg: "#14100A", accent: "#FF6B00", accentText: "#ffffff", label: "Driver Wallet",  icon: "🛺" },
                cooperative: { bg: "#080F14", accent: "#10B981", accentText: "#ffffff", label: "Coop Treasury", icon: "🏢" },
            };
            const cfg = roleConfig[role as keyof typeof roleConfig] || roleConfig.commuter;

            // Background
            ctx.fillStyle = cfg.bg;
            ctx.fillRect(0, 0, cardW, cardH);

            // Top accent bar
            ctx.fillStyle = cfg.accent;
            ctx.fillRect(0, 0, cardW, 8);

            // Glow orb
            const grad = ctx.createRadialGradient(cardW, 0, 10, cardW, 0, 300);
            grad.addColorStop(0, cfg.accent + "22");
            grad.addColorStop(1, "transparent");
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, cardW, cardH);

            // ARANOVA wordmark
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 18px 'Arial', sans-serif";
            ctx.fillText("ARANOVA", 36, 56);

            // Role badge
            const badgeX = cardW - 36 - ctx.measureText(cfg.label).width - 24;
            ctx.fillStyle = cfg.accent + "22";
            ctx.beginPath();
            ctx.roundRect(badgeX - 12, 36, ctx.measureText(cfg.label).width + 32, 28, 14);
            ctx.fill();
            ctx.fillStyle = cfg.accent;
            ctx.font = "bold 11px 'Arial', sans-serif";
            ctx.fillText(cfg.icon + " " + cfg.label, badgeX, 55);

            // Divider
            ctx.fillStyle = "rgba(255,255,255,0.06)";
            ctx.fillRect(36, 76, cardW - 72, 1);

            // User display name
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 32px 'Arial', sans-serif";
            const displayName = userData?.displayName || userData?.coopName || "Aranova User";
            ctx.fillText(displayName, 36, 128);

            // Generate QR onto an off-screen canvas first
            const qrCanvas = document.createElement("canvas");
            await QRCode.toCanvas(qrCanvas, userData.publicKey || userData.uid, { width: qrSize, margin: 2, color: { dark: "#000000", light: "#ffffff" } });

            // White rounded rect behind QR
            const qrX = (cardW - qrSize) / 2;
            const qrY = 160;
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.roundRect(qrX - 12, qrY - 12, qrSize + 24, qrSize + 24, 20);
            ctx.fill();
            ctx.drawImage(qrCanvas, qrX, qrY);

            // Accent line under QR
            ctx.fillStyle = cfg.accent;
            ctx.fillRect(qrX - 12, qrY + qrSize + 12, qrSize + 24, 3);

            // "Scan to pay me" label
            ctx.fillStyle = "rgba(255,255,255,0.5)";
            ctx.font = "13px 'Arial', sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("Scan to pay me on Aranova", cardW / 2, qrY + qrSize + 36);

            // Public key address (truncated)
            const pk = userData.publicKey || "";
            const pkDisplay = pk.length > 20 ? pk.slice(0, 20) + "..." + pk.slice(-20) : pk;
            ctx.fillStyle = "rgba(255,255,255,0.35)";
            ctx.font = "11px 'Courier New', monospace";
            ctx.fillText(pkDisplay, cardW / 2, qrY + qrSize + 58);

            // Bottom powered-by line
            ctx.fillStyle = cfg.accent;
            ctx.font = "bold 12px 'Arial', sans-serif";
            ctx.fillText("Powered by Aranova · Stellar Blockchain", cardW / 2, cardH - 28);

            ctx.textAlign = "left";

            canvas.toBlob((blob) => {
                if (!blob) return;
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `aranova-qr-${displayName.replace(/\s+/g, "_")}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, "image/png");
        } catch (e) {
            console.error("Failed to generate QR card:", e);
            alert("Could not generate QR card. Please try again.");
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

    // Pull recent Horizon payments on mount
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
                            const isVeryRecent = Date.now() - createdTime < 45000;

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
                                    break;
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

        const handleIncomingVaultSplit = async (data: any, txHash: string) => {
            if (data.vaultPortion && data.vaultPortion > 0) {
                try {
                    const lockDays = data.lockDays || 30;
                    const calculatedMaturityDate = new Date(Date.now() + lockDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
                    const vaultId = `${userData.uid}_vault_${Date.now()}`;
                    await setDoc(doc(db, "vaults", vaultId), {
                        ownerId: userData.uid,
                        lockedAmount: data.vaultPortion,
                        lockPercent: data.routingPct || 0,
                        lockDays: lockDays,
                        maturityDate: calculatedMaturityDate,
                        status: "locked",
                        txHash: txHash,
                        createdAt: serverTimestamp(),
                    });
                } catch (e) {
                    console.warn("Failed to create receiver vault document:", e);
                }
            }
        };

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
                const txTime = data.createdAt?.toMillis() || Date.now();
                const isVeryRecent = Date.now() - txTime < 35000;
                if (isVeryRecent && data.from !== userData.uid && !markTxProcessed(txHash)) {
                    handleIncomingVaultSplit(data, txHash);
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
                    handleIncomingVaultSplit(data, txHash);
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
                () => {}
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
            const wallet_portion = value - vault_portion;
            setProcessingBreakdown({
                total: value,
                pct: recipientVaultRoutingPct,
                vault: vault_portion,
                wallet: wallet_portion,
            });

            setPinPurpose(`Pay ${value.toFixed(2)} XLM to recipient`);
            setPinDigits("");
            setPinError("");
            setPinCallback(() => async (secret: string) => {
                setBusy(true);
                setProcessingState("Constructing Soroban payment payload...");
                try {
                    const handler = { signWithSecret: secret };
                    setProcessingState("Encoding variables & calculating slices...");

                    const amountStroops = BigInt(Math.round(value * 10_000_000));
                    const vaultPctBps = BigInt(recipientVaultRoutingPct * 100);
                    
                    setProcessingState("Simulating smart contract on-chain execution...");
                    const txHash = await payP2P(
                        userData.publicKey,
                        destPublicKey,
                        amountStroops,
                        vaultPctBps,
                        handler
                    );
                    
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
                    setProcessingBreakdown(null);
                    setProcessingState(null);
                }
            });
            setShowPinModal(true);
        } catch (err: any) {
            console.error(err);
            alert(`Payment setup failed: ${err.message || err}`);
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
            if (pinCallback) {
                pinCallback(secret);
            }
        } catch (err) {
            setPinError("Incorrect PIN. Decryption failed.");
            setPinDigits("");
        }
    };

    const handlePinKey = (num: string) => {
        setPinError("");
        if (pinDigits.length < 4) {
            setPinDigits(prev => prev + num);
        }
    };

    const handlePinBackspace = () => {
        setPinError("");
        setPinDigits(prev => prev.slice(0, -1));
    };

    const renderPinModal = () => (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-[99999] p-6">
            <div className={`rounded-[32px] p-8 max-w-sm w-full border shadow-2xl text-center ${
                dark ? 'bg-[#0E0F14] border-white/10 text-white' : 'bg-white border-gray-100 text-gray-900'
            }`}>
                <div className="mb-4">
                    <span className="text-3xl">🔑</span>
                    <h3 className="text-lg font-black mt-2">PIN Authorization</h3>
                    <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-wider font-extrabold">{pinPurpose}</p>
                </div>

                <div className="flex justify-center gap-4 my-6">
                    {[0, 1, 2, 3].map((idx) => (
                        <div
                            key={idx}
                            className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                                pinDigits.length > idx
                                    ? (role === 'driver' ? 'bg-[#FF6B00] border-transparent scale-110' : role === 'cooperative' ? 'bg-[#10B981] border-transparent scale-110' : 'bg-[#FFE600] border-transparent scale-110')
                                    : 'bg-transparent border-gray-400'
                            }`}
                        />
                    ))}
                </div>

                {pinError && <p className="text-red-505 text-xs font-black mb-4">{pinError}</p>}

                <div className="grid grid-cols-3 gap-3 max-w-[240px] mx-auto mb-6">
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                        <button
                            key={num}
                            type="button"
                            onClick={() => handlePinKey(num)}
                            className={`h-12 rounded-xl text-lg font-black transition-all active:scale-90 ${
                                dark ? 'bg-white/5 hover:bg-white/10 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
                            }`}
                        >
                            {num}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => setPinDigits("")}
                        className={`h-12 rounded-xl text-xs font-black text-red-500 transition-all active:scale-90 ${
                            dark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 text-gray-800'
                        }`}
                    >
                        Clear
                    </button>
                    <button
                        type="button"
                        onClick={() => handlePinKey("0")}
                        className={`h-12 rounded-xl text-lg font-black transition-all active:scale-90 ${
                            dark ? 'bg-white/5 hover:bg-white/10 text-white' : 'bg-gray-50 hover:bg-gray-100 text-gray-900'
                        }`}
                    >
                        0
                    </button>
                    <button
                        type="button"
                        onClick={handlePinBackspace}
                        className={`h-12 rounded-xl text-sm font-black text-gray-400 transition-all active:scale-90 ${
                            dark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100'
                        }`}
                    >
                        ⌫
                    </button>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={handlePinSubmit}
                        disabled={pinDigits.length < 4}
                        className={`flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all disabled:opacity-50 active:scale-95 ${
                            role === 'driver' ? 'bg-[#FF6B00] text-white' : role === 'cooperative' ? 'bg-[#10B981] text-white' : 'bg-[#FFE600] text-black'
                        }`}
                    >
                        Confirm
                    </button>
                    <button
                        onClick={() => {
                            setShowPinModal(false);
                            setPinCallback(null);
                        }}
                        className={`flex-1 py-3 rounded-xl font-bold text-xs uppercase tracking-wider border transition-all ${
                            dark ? 'border-white/10 text-white hover:bg-white/5' : 'border-gray-200'
                        }`}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );

    const renderProcessingOverlay = () => {
        if (!busy) return null;
        return (
            <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center z-[99999] p-6 text-center text-white">
                <div className="relative w-24 h-24 mb-8 flex items-center justify-center">
                    <div className={`absolute w-full h-full rounded-full border-4 border-t-transparent animate-spin ${
                        role === 'driver' ? 'border-[#FF6B00]' : role === 'cooperative' ? 'border-[#10B981]' : 'border-[#FFE600]'
                    }`} />
                    <span className="text-2xl animate-pulse">⚡</span>
                </div>

                <h3 className="text-xl font-black mb-1">On-Chain Transaction Processing</h3>
                <p className="text-xs text-gray-400 mb-6 uppercase tracking-wider font-bold">{processingState || "Broadcasting to Soroban RPC..."}</p>

                {processingBreakdown && (
                    <div className="w-full max-w-sm rounded-[24px] border border-white/5 bg-[#141620]/45 p-6 mb-8 space-y-4 shadow-xl">
                        <div className="flex justify-between items-center pb-3 border-b border-white/5">
                            <span className="text-xs font-bold text-gray-400 uppercase">Total Paid Amount</span>
                            <span className="text-base font-black">{processingBreakdown.total.toFixed(2)} XLM</span>
                        </div>

                        <div className="py-2 flex flex-col items-center gap-2">
                            <div className="text-[10px] uppercase font-black text-gray-400 bg-white/5 px-3 py-1 rounded-full">
                                Slicing Allocations ({processingBreakdown.pct}%)
                            </div>
                            <div className="w-0.5 h-6 bg-dashed border-l border-white/10" />
                            <div className="grid grid-cols-2 gap-4 w-full">
                                <div className="p-3 rounded-xl border border-white/5 bg-black/20 text-center relative overflow-hidden">
                                    <div className="absolute top-0 left-0 w-full h-0.5 bg-emerald-500 animate-pulse" />
                                    <span className="text-[9px] font-black uppercase text-emerald-400 block mb-1">Recipient Wallet</span>
                                    <span className="text-sm font-black">{processingBreakdown.wallet.toFixed(2)} XLM</span>
                                    <span className="text-[8px] text-gray-500 block mt-0.5 uppercase">Liquid Balance</span>
                                </div>
                                <div className="p-3 rounded-xl border border-white/5 bg-black/20 text-center relative overflow-hidden">
                                    <div className="absolute top-0 left-0 w-full h-0.5 bg-amber-400 animate-pulse" />
                                    <span className="text-[9px] font-black uppercase text-amber-400 block mb-1">Locked Vault</span>
                                    <span className="text-sm font-black">{processingBreakdown.vault.toFixed(2)} XLM</span>
                                    <span className="text-[8px] text-gray-550 block mt-0.5 uppercase">{processingBreakdown.pct}% Routed</span>
                                </div>
                            </div>
                        </div>

                        <div className="text-[10px] text-gray-500 leading-relaxed font-semibold">
                            Soroban smart contract is routing {processingBreakdown.pct}% directly into the recipient's locked personal vault.
                        </div>
                    </div>
                )}

                <div className="text-xs text-gray-550 animate-pulse">
                    Please do not navigate away. Awaiting Stellar ledger agreement...
                </div>
            </div>
        );
    };

    const renderCommuter = () => (
      <div className="space-y-6">
        <style>{`
          #reader {
            border: none !important;
          }
          #reader video {
            object-fit: cover !important;
            border-radius: 12px !important;
          }
          #reader__header_message {
            display: none !important;
          }
          #reader__dashboard_section_swaplink {
            display: none !important;
          }
          #reader__camera_selection {
            background: #1f2937 !important;
            color: #fff !important;
            border: 1px solid rgba(255,255,255,0.1) !important;
            border-radius: 8px !important;
            padding: 4px !important;
            font-size: 11px !important;
            margin-top: 8px !important;
            width: 100% !important;
          }
        `}</style>

        <div className="grid grid-cols-2 gap-6 items-stretch animate-slide-up">
          <div className="h-full flex flex-col">
            <div className={`relative overflow-hidden rounded-[32px] p-8 flex flex-col justify-between flex-1 border shadow-xl premium-card ${
              dark 
                ? 'bg-gradient-to-br from-[#0E0F14] to-[#161822] border-white/5 hover:border-[#FFE600]/30 hover:shadow-[#FFE600]/5' 
                : 'bg-gradient-to-br from-[#1E293B] to-[#0F172A] border-white/10 hover:border-[#FFE600]/25'
            }`}>
              <div className="absolute top-0 right-0 w-64 h-64 bg-[#FFE600] opacity-[0.03] rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">💳</span>
                    <span className={`text-[10px] font-black uppercase tracking-wider ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Wallet Balance</span>
                  </div>
                  <span className={`text-[9px] font-extrabold uppercase px-2.5 py-1 rounded bg-[#FFE600]/10 ${dark ? 'text-[#FFE600]' : 'text-[#8A7D00]'} border border-[#FFE600]/20 transition-all`}>
                    Commuter Pass
                  </span>
                </div>
                <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white mt-8">
                  {formatXlm(Number(userData.walletBalance || 0))} <span className="text-lg font-bold uppercase text-gray-400">XLM</span>
                </h1>
              </div>
              <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between text-xs text-gray-400">
                <span>Stellar Network Wallet</span>
                <span className="font-bold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  On-Chain Synchronized
                </span>
              </div>
            </div>
          </div>

          <div className="h-full flex flex-col">
            <div className={`rounded-[32px] p-8 border shadow-xl flex-1 flex flex-col justify-between transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl ${
              dark 
                ? 'bg-[#0E0F14] border-white/5 hover:border-[#FFE600]/30 hover:shadow-[#FFE600]/5' 
                : 'bg-white border-[#E2E2DF] hover:border-gray-300'
            }`}>
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
                        className={`w-full ${dark ? 'bg-white/5 border-white/10 text-white placeholder-gray-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'} px-4 py-3 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FFE600] hover:border-[#FFE600]/40 transition-all`}
                      />
                    </div>
                    <button 
                      onClick={() => setScanning((s) => !s)} 
                      className={`px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-wider border flex items-center justify-center gap-2 whitespace-nowrap active:scale-95 transition-all ${
                        scanning 
                          ? 'bg-red-500/10 border-red-500/30 text-red-500' 
                          : (dark ? 'bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-white/20' : 'bg-gray-100 border-gray-200 text-gray-800 hover:bg-gray-200')
                      }`}
                    >
                      {scanning ? "Close Cam" : "📷 Scan QR"}
                    </button>
                  </div>
                  <input 
                    value={amount} 
                    onChange={(e) => setAmount(e.target.value)} 
                    type="number" 
                    placeholder="Amount in XLM" 
                    className={`w-full ${dark ? 'bg-white/5 border-white/10 text-white placeholder-gray-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'} px-4 py-3 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FFE600] hover:border-[#FFE600]/40 transition-all`}
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
                  className="px-6 py-3.5 rounded-xl font-black text-xs uppercase tracking-wider bg-[#FFE600] text-black hover:bg-[#E6CE00] hover:shadow-lg hover:shadow-[#FFE600]/20 disabled:opacity-50 active:scale-95 transition-all"
                >
                  Pay
                </button>
                <button 
                  onClick={() => setShowReceiveModal(true)} 
                  className={`px-5 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider border active:scale-95 transition-all ${
                    dark ? 'border-white/10 text-white hover:bg-white/5 hover:border-white/20' : 'border-gray-200 text-gray-850 hover:bg-gray-100'
                  }`}
                >
                  Receive
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className={`rounded-[32px] p-8 border shadow-xl transition-all duration-505 hover:-translate-y-1 hover:shadow-2xl ${
          dark 
            ? 'bg-[#0E0F14] border-white/5 hover:border-[#FFE600]/30 hover:shadow-[#FFE600]/5' 
            : 'bg-white border-[#E2E2DF] hover:border-gray-300'
        }`}>
          <h3 className="text-lg font-black mb-2">Withdraw</h3>
          <p className="text-xs text-gray-400 mb-4">
            Withdraw assets to external Stellar exchange terminals. PDAX banking gateway integrations are reserved.
          </p>
          <button 
            onClick={() => alert("Withdraw is reserved for future PDAX integration.")} 
            className={`w-full py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider border active:scale-95 transition-all ${
              dark ? 'border-white/10 text-white hover:bg-white/5 hover:border-white/20' : 'border-gray-200 text-gray-800 hover:bg-gray-100'
            }`}
          >
            Withdraw
          </button>
        </div>

        {/* Bento stats row: Vault & Trust */}
        <div className="grid grid-cols-2 gap-6">
          <div className={`rounded-[28px] p-6 border shadow-xl transition-all duration-500 hover:-translate-y-0.5 hover:shadow-2xl ${
            dark ? 'bg-[#0E0F14] border-white/5 hover:border-[#FFE600]/20' : 'bg-white border-[#E2E2DF] hover:border-gray-300'
          }`}>
            <div className="flex flex-col justify-between h-full">
              <div>
                <span className={`text-[10px] font-black uppercase tracking-wider ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Locked Vault</span>
                <h2 className={`text-2xl font-black mt-2 ${dark ? 'text-white' : 'text-gray-900'}`}>
                  {formatXlm(Number(userData.vaultBalance || 0))} XLM
                </h2>
              </div>
              <a href="/user/vault" className={`mt-4 inline-flex items-center gap-1 text-[10px] font-black uppercase hover:underline ${dark ? 'text-[#FFE600]' : 'text-[#8A7D00]'}`}>
                Manage Vault &rarr;
              </a>
            </div>
          </div>

          <div className={`rounded-[28px] p-6 border shadow-xl transition-all duration-500 hover:-translate-y-0.5 hover:shadow-2xl ${
            dark ? 'bg-[#0E0F14] border-white/5 hover:border-[#FFE600]/20' : 'bg-white border-[#E2E2DF] hover:border-gray-300'
          }`}>
            <div className="flex flex-col justify-between h-full">
              <div>
                <span className={`text-[10px] font-black uppercase tracking-wider ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Trust Score</span>
                <h2 className={`text-2xl font-black mt-2 ${dark ? 'text-white' : 'text-gray-900'}`}>
                  {Number(userData.trustScore || 0)}/100
                </h2>
              </div>
              <p className="mt-4 text-[10px] text-gray-500 leading-relaxed font-semibold">
                Limit boost: <span className="text-emerald-500">{formatXlm(availableCredit)} XLM</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    );

    const renderDriver = () => (
      <div className="space-y-6">
        <style>{`
          #reader {
            border: none !important;
          }
          #reader video {
            object-fit: cover !important;
            border-radius: 12px !important;
          }
          #reader__header_message {
            display: none !important;
          }
          #reader__dashboard_section_swaplink {
            display: none !important;
          }
          #reader__camera_selection {
            background: #1f2937 !important;
            color: #fff !important;
            border: 1px solid rgba(255,255,255,0.1) !important;
            border-radius: 8px !important;
            padding: 4px !important;
            font-size: 11px !important;
            margin-top: 8px !important;
            width: 100% !important;
          }
        `}</style>

        <div className="grid grid-cols-2 gap-6 items-stretch animate-slide-up">
          <div className="h-full flex flex-col">
            <div className={`relative overflow-hidden rounded-[32px] p-8 flex flex-col justify-between border shadow-xl premium-card ${
              dark 
                ? 'bg-gradient-to-br from-[#141620] to-[#251A14] border-white/5 hover:border-[#FF6B00]/30 hover:shadow-[#FF6B00]/5' 
                : 'bg-gradient-to-br from-[#2D231E] to-[#1C1512] border-white/10 hover:border-[#FF6B00]/25'
            }`}>
              <div className="absolute top-0 right-0 w-64 h-64 bg-[#FF6B00] opacity-[0.03] rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🛺</span>
                    <span className={`text-[10px] font-black uppercase tracking-wider ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Wallet Balance</span>
                  </div>
                  <span className={`text-[9px] font-extrabold uppercase px-2.5 py-1 rounded bg-[#FF6B00]/10 ${dark ? 'text-[#FF8833]' : 'text-[#D45600]'} border border-[#FF6B00]/20`}>
                    Driver Wallet
                  </span>
                </div>
                <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white mt-8">
                  {formatXlm(Number(userData.walletBalance || 0))} <span className="text-lg font-bold uppercase text-gray-400">XLM</span>
                </h1>
              </div>
              <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between text-xs text-gray-400">
                <span>Stellar Network Wallet</span>
                <span className="font-bold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  On-Chain Synchronized
                </span>
              </div>
            </div>
          </div>

          <div className="h-full flex flex-col">
            <div className={`rounded-[32px] p-8 border shadow-xl flex-1 flex flex-col justify-between transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl ${
              dark 
                ? 'bg-[#141620] border-white/5 hover:border-[#FF6B00]/30 hover:shadow-[#FF6B00]/5' 
                : 'bg-white border-[#EAE6DF] hover:border-gray-300'
            }`}>
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div>
                    <h3 className="text-lg font-black">Pay & Receive</h3>
                    <p className="text-xs text-gray-400 mt-1">Scan commuter fares or send XLM</p>
                  </div>
                  <button 
                    onClick={() => setScanning((s) => !s)} 
                    className={`px-5 py-3.5 rounded-xl font-black text-xs uppercase tracking-wider text-white bg-[#FF6B00] hover:bg-[#E05E00] hover:shadow-md hover:shadow-[#FF6B00]/20 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-md`}
                  >
                    {scanning ? "Close Camera" : "📷 Scan QR"}
                  </button>
                </div>
                <div className="space-y-4">
                  <input 
                    value={recipient} 
                    onChange={(e) => setRecipient(e.target.value)} 
                    placeholder="Recipient address, public key or email" 
                    className={`w-full ${dark ? 'bg-white/5 border-white/10 text-white placeholder-gray-500' : 'bg-gray-55 border-gray-200 text-gray-900 placeholder-gray-400'} px-4 py-3 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF6B00] hover:border-[#FF6B00]/40 transition-all`}
                  />
                  <input 
                    value={amount} 
                    onChange={(e) => setAmount(e.target.value)} 
                    type="number" 
                    placeholder="Amount in XLM" 
                    className={`w-full ${dark ? 'bg-white/5 border-white/10 text-white placeholder-gray-500' : 'bg-gray-55 border-gray-200 text-gray-900 placeholder-gray-400'} px-4 py-3 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#FF6B00] hover:border-[#FF6B00]/40 transition-all`}
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
                  className="px-6 py-3.5 rounded-xl font-black text-xs uppercase tracking-wider bg-black hover:opacity-90 dark:bg-white dark:text-black hover:shadow-lg disabled:opacity-50 active:scale-95 transition-all"
                >
                  Pay
                </button>
                <button 
                  onClick={() => setShowReceiveModal(true)} 
                  className={`px-5 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider border active:scale-95 transition-all ${
                    dark ? 'border-white/10 text-white hover:bg-white/5 hover:border-white/20' : 'border-gray-200 text-gray-850 hover:bg-gray-100'
                  }`}
                >
                  Receive
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className={`rounded-[32px] p-8 border shadow-xl transition-all duration-505 hover:-translate-y-1 hover:shadow-2xl ${
          dark 
            ? 'bg-[#141620] border-white/5 hover:border-[#FF6B00]/30 hover:shadow-[#FF6B00]/5' 
            : 'bg-white border-[#EAE6DF] hover:border-gray-300'
        }`}>
          <h3 className="text-lg font-black mb-2">Withdraw</h3>
          <p className="text-xs text-gray-400 mb-4">
            Withdraw assets to external Stellar exchange terminals. PDAX banking gateway integrations are reserved.
          </p>
          <button 
            onClick={() => alert("Withdraw is reserved for future PDAX integration.")} 
            className={`w-full py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider border active:scale-95 transition-all ${
              dark ? 'border-white/10 text-white hover:bg-white/5 hover:border-white/20' : 'border-gray-200 text-gray-800 hover:bg-gray-100'
            }`}
          >
            Withdraw
          </button>
        </div>

        {/* Bento stats row: Vault & Trust */}
        <div className="grid grid-cols-2 gap-6">
          <div className={`rounded-[28px] p-6 border shadow-xl transition-all duration-505 hover:-translate-y-0.5 hover:shadow-2xl ${
            dark ? 'bg-[#141620] border-white/5 hover:border-[#FF6B00]/20' : 'bg-white border-[#EAE6DF] hover:border-gray-300'
          }`}>
            <div className="flex flex-col justify-between h-full">
              <div>
                <span className={`text-[10px] font-black uppercase tracking-wider ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Locked Vault</span>
                <h2 className={`text-2xl font-black mt-2 ${dark ? 'text-white' : 'text-gray-900'}`}>
                  {formatXlm(Number(userData.vaultBalance || 0))} XLM
                </h2>
              </div>
              <a href="/user/vault" className={`mt-4 inline-flex items-center gap-1 text-[10px] font-black uppercase hover:underline ${dark ? 'text-[#FF8833]' : 'text-[#D45600]'}`}>
                Manage Vault &rarr;
              </a>
            </div>
          </div>

          <div className={`rounded-[28px] p-6 border shadow-xl transition-all duration-505 hover:-translate-y-0.5 hover:shadow-2xl ${
            dark ? 'bg-[#141620] border-white/5 hover:border-[#FF6B00]/20' : 'bg-white border-[#EAE6DF] hover:border-gray-300'
          }`}>
            <div className="flex flex-col justify-between h-full">
              <div>
                <span className={`text-[10px] font-black uppercase tracking-wider ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Trust Score</span>
                <h2 className={`text-2xl font-black mt-2 ${dark ? 'text-white' : 'text-gray-900'}`}>
                  {Number(userData.trustScore || 0)}/100
                </h2>
              </div>
              <p className="mt-4 text-[10px] text-gray-500 leading-relaxed font-semibold">
                Limit boost: <span className="text-[#FF8833]">{formatXlm(availableCredit)} XLM</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    );

    const renderCooperative = () => (
      <div className="space-y-6">
        <style>{`
          #reader {
            border: none !important;
          }
          #reader video {
            object-fit: cover !important;
            border-radius: 12px !important;
          }
          #reader__header_message {
            display: none !important;
          }
          #reader__dashboard_section_swaplink {
            display: none !important;
          }
          #reader__camera_selection {
            background: #1f2937 !important;
            color: #fff !important;
            border: 1px solid rgba(255,255,255,0.1) !important;
            border-radius: 8px !important;
            padding: 4px !important;
            font-size: 11px !important;
            margin-top: 8px !important;
            width: 100% !important;
          }
        `}</style>

        <div className="grid grid-cols-2 gap-6 items-stretch animate-slide-up">
          <div className="h-full flex flex-col">
            <div className={`relative overflow-hidden rounded-[32px] p-8 flex flex-col justify-between border shadow-xl premium-card ${
              dark 
                ? 'bg-gradient-to-br from-[#0A1128] to-[#0D1635] border-white/5 hover:border-[#10B981]/30 hover:shadow-[#10B981]/5' 
                : 'bg-gradient-to-br from-[#064E3B] to-[#022C22] border-white/10 hover:border-[#10B981]/25'
            }`}>
              <div className="absolute top-0 right-0 w-64 h-64 bg-[#10B981] opacity-[0.03] rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🏢</span>
                    <span className={`text-[10px] font-black uppercase tracking-wider ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Wallet Balance</span>
                  </div>
                  <span className={`text-[9px] font-extrabold uppercase px-2.5 py-1 rounded bg-[#10B981]/10 ${dark ? 'text-[#34D399]' : 'text-[#059669]'} border border-[#10B981]/20`}>
                    Corporate Treasury
                  </span>
                </div>
                <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white mt-8">
                  {formatXlm(Number(userData.walletBalance || 0))} <span className="text-lg font-bold uppercase text-gray-400">XLM</span>
                </h1>
              </div>
              <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between text-xs text-gray-400">
                <span>Stellar Network Wallet</span>
                <span className="font-bold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  On-Chain Synchronized
                </span>
              </div>
            </div>
          </div>

          <div className="h-full flex flex-col">
            <div className={`rounded-[32px] p-8 border shadow-xl flex-1 flex flex-col justify-between transition-all duration-505 hover:-translate-y-1 hover:shadow-2xl ${
              dark 
                ? 'bg-[#0A1128] border-white/5 hover:border-[#10B981]/30 hover:shadow-[#10B981]/5' 
                : 'bg-white border-[#D5E2EC] hover:border-gray-300'
            }`}>
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
                        className={`w-full ${dark ? 'bg-white/5 border-white/10 text-white placeholder-gray-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'} px-4 py-3 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#10B981] hover:border-[#10B981]/40 transition-all`}
                      />
                    </div>
                    <button 
                      onClick={() => setScanning((s) => !s)} 
                      className={`px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider border flex items-center justify-center gap-2 whitespace-nowrap active:scale-95 transition-all ${
                        scanning 
                          ? 'bg-red-500/10 border-red-500/30 text-red-500' 
                          : (dark ? 'bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-white/20' : 'bg-gray-100 border-gray-200 text-gray-800 hover:bg-gray-200')
                      }`}
                    >
                      {scanning ? "Close Cam" : "📷 Scan QR"}
                    </button>
                  </div>
                  <input 
                    value={amount} 
                    onChange={(e) => setAmount(e.target.value)} 
                    type="number" 
                    placeholder="Amount in XLM" 
                    className={`w-full ${dark ? 'bg-white/5 border-white/10 text-white placeholder-gray-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'} px-4 py-3 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#10B981] hover:border-[#10B981]/40 transition-all`}
                  />
                </div>
                {scanning && (
                  <div className="mt-4 text-center">
                    <div id="reader" className="w-full max-w-[200px] h-[200px] mx-auto rounded-xl overflow-hidden border border-dashed border-[#10B981]/40" />
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2 pt-6 border-t border-dashed border-gray-200 dark:border-white/5 mt-6">
                <button 
                  onClick={handleSend} 
                  disabled={busy} 
                  className="px-6 py-3.5 rounded-xl font-black text-xs uppercase tracking-wider bg-[#10B981] text-white hover:bg-[#0E9F6E] hover:shadow-lg hover:shadow-[#10B981]/25 disabled:opacity-50 active:scale-95 transition-all"
                >
                  Pay
                </button>
                <button 
                  onClick={() => setShowReceiveModal(true)} 
                  className={`px-5 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider border active:scale-95 transition-all ${
                    dark ? 'border-white/10 text-white hover:bg-white/5 hover:border-white/20' : 'border-gray-200 text-gray-850 hover:bg-gray-100'
                  }`}
                >
                  Receive
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className={`rounded-[32px] p-8 border shadow-xl transition-all duration-505 hover:-translate-y-1 hover:shadow-2xl ${
          dark 
            ? 'bg-[#0A1128] border-white/5 hover:border-[#10B981]/30 hover:shadow-[#10B981]/5' 
            : 'bg-white border-[#D5E2EC] hover:border-gray-300'
        }`}>
          <h3 className="text-lg font-black mb-2">Withdraw</h3>
          <p className="text-xs text-gray-400 mb-4">
            Withdraw assets to external Stellar exchange terminals. PDAX banking gateway integrations are reserved.
          </p>
          <button 
            onClick={() => alert("Withdraw is reserved for future PDAX integration.")} 
            className={`w-full py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider border active:scale-95 transition-all ${
              dark ? 'border-white/10 text-white hover:bg-white/5 hover:border-white/20' : 'border-gray-200 text-gray-800 hover:bg-gray-100'
            }`}
          >
            Withdraw
          </button>
        </div>

        {/* Bento stats row: Vault & Trust */}
        <div className="grid grid-cols-2 gap-6">
          <div className={`rounded-[28px] p-6 border shadow-xl transition-all duration-505 hover:-translate-y-0.5 hover:shadow-2xl ${
            dark ? 'bg-[#0A1128] border-white/5 hover:border-[#10B981]/20' : 'bg-white border-[#D5E2EC] hover:border-gray-300'
          }`}>
            <div className="flex flex-col justify-between h-full">
              <div>
                <span className={`text-[10px] font-black uppercase tracking-wider ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Locked Vault</span>
                <h2 className={`text-2xl font-black mt-2 ${dark ? 'text-white' : 'text-gray-900'}`}>
                  {formatXlm(Number(userData.vaultBalance || 0))} XLM
                </h2>
              </div>
              <a href="/user/vault" className={`mt-4 inline-flex items-center gap-1 text-[10px] font-black uppercase hover:underline ${dark ? 'text-[#34D399]' : 'text-[#059669]'}`}>
                Manage Vault &rarr;
              </a>
            </div>
          </div>

          <div className={`rounded-[28px] p-6 border shadow-xl transition-all duration-505 hover:-translate-y-0.5 hover:shadow-2xl ${
            dark ? 'bg-[#0A1128] border-white/5 hover:border-[#10B981]/20' : 'bg-white border-[#D5E2EC] hover:border-gray-300'
          }`}>
            <div className="flex flex-col justify-between h-full">
              <div>
                <span className={`text-[10px] font-black uppercase tracking-wider ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Trust Score</span>
                <h2 className={`text-2xl font-black mt-2 ${dark ? 'text-white' : 'text-gray-900'}`}>
                  {Number(userData.trustScore || 0)}/100
                </h2>
              </div>
              <p className="mt-4 text-[10px] text-gray-400 leading-relaxed font-semibold">
                Limit boost: <span className="text-[#34D399]">{formatXlm(availableCredit)} XLM</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    );

    return (
        <div className="space-y-6">
            {/* Processing Loader */}
            {renderProcessingOverlay()}

            {/* PIN Keyboard Modal */}
            {showPinModal && renderPinModal()}

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

            {/* MOBILE VIEW */}
            <div className="lg:hidden space-y-6 animate-slide-up">
              {/* Role identity banner for mobile */}
              <div className={`rounded-[20px] px-4 py-3 flex items-center gap-3 border ${
                role === 'driver'
                  ? 'bg-[#FF6B00]/10 border-[#FF6B00]/20'
                  : role === 'cooperative'
                    ? 'bg-[#10B981]/10 border-[#10B981]/20'
                    : 'bg-[#FFE600]/10 border-[#FFE600]/20'
              }`}>
                <span className="text-2xl">{role === 'driver' ? '🛺' : role === 'cooperative' ? '🏢' : '💳'}</span>
                <div>
                  <div className={`text-[10px] font-black uppercase tracking-widest ${
                    role === 'driver' ? 'text-[#FF8833]' : role === 'cooperative' ? 'text-[#34D399]' : 'text-[#FFE600]'
                  }`}>{role === 'driver' ? 'Driver Wallet' : role === 'cooperative' ? 'Cooperative Treasury' : 'Commuter Pass'}</div>
                  <div className={`text-xs font-bold ${dark ? 'text-gray-300' : 'text-gray-700'}`}>{userData?.displayName || userData?.coopName}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className={`relative overflow-hidden rounded-[24px] p-6 border shadow-lg flex flex-col justify-between transition-all duration-300 ${
                  role === 'driver'
                    ? 'bg-gradient-to-br from-[#14100A] to-[#251A14] border-[#FF6B00]/20'
                    : role === 'cooperative'
                      ? 'bg-gradient-to-br from-[#080F14] to-[#0D1A1A] border-[#10B981]/20'
                      : 'bg-gradient-to-br from-[#0E0F14] to-[#161822] border-[#FFE600]/10'
                }`}>
                  <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-2xl -mr-8 -mt-8 pointer-events-none opacity-10 ${
                    role === 'driver' ? 'bg-[#FF6B00]' : role === 'cooperative' ? 'bg-[#10B981]' : 'bg-[#FFE600]'
                  }`} />
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Wallet</span>
                    <h1 className="text-xl sm:text-2xl font-black text-white mt-2">
                      {formatXlm(Number(userData.walletBalance || 0))}
                    </h1>
                  </div>
                  <div className={`text-[9px] mt-2 font-bold uppercase ${
                    role === 'driver' ? 'text-[#FF8833]' : role === 'cooperative' ? 'text-[#34D399]' : 'text-[#FFE600]'
                  }`}>XLM Balance</div>
                </div>

                <div className="grid grid-rows-2 gap-3">
                  <button 
                    onClick={() => setShowPayModal(true)} 
                    className={`flex items-center justify-center p-4 rounded-[20px] border active:scale-95 transition-all gap-2 font-black text-xs uppercase tracking-wider shadow-md ${
                        role === 'driver' 
                          ? 'border-[#FF6B00]/20 bg-[#FF6B00] text-white' 
                          : role === 'cooperative' 
                            ? 'border-[#10B981]/20 bg-[#10B981] text-white' 
                            : 'border-[#FFE600]/20 bg-[#FFE600] text-black'
                    }`}
                  >
                    💸 Pay
                  </button>
                  <button 
                    onClick={() => setShowReceiveModal(true)} 
                    className={`flex items-center justify-center p-4 rounded-[20px] border active:scale-95 transition-all gap-2 font-black text-xs uppercase tracking-wider shadow-md ${
                      dark ? 'border-white/10 bg-white/5 text-white' : 'border-gray-200 bg-gray-50 text-gray-800 hover:bg-gray-100'
                    }`}
                  >
                    📥 Receive
                  </button>
                </div>
              </div>

              <div className={`rounded-[24px] p-6 border shadow-md transition-all duration-300 ${dark ? 'bg-[#0E0F14] border-white/5' : 'bg-white border-[#E2E2DF]'}`}>
                <h3 className="text-sm font-black mb-1">Withdraw</h3>
                <p className="text-[10px] text-gray-400 mb-4">Withdraw to external Stellar exchange terminals.</p>
                <button 
                  onClick={() => alert("Withdraw is reserved for future PDAX integration.")} 
                  className={`w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider border active:scale-95 transition-all ${
                    dark ? 'border-white/10 text-white hover:bg-white/5' : 'border-gray-200 text-gray-800'
                  }`}
                >
                  Withdraw
                </button>
              </div>

              {/* Mobile Bento stats grid: Locked savings & Trust Delta */}
              <div className="grid grid-cols-2 gap-4">
                <div className={`rounded-[20px] p-4 border shadow-sm ${
                  role === 'driver'
                    ? (dark ? 'bg-[#14100A] border-[#FF6B00]/15' : 'bg-white border-[#EAE6DF]')
                    : role === 'cooperative'
                      ? (dark ? 'bg-[#080F14] border-[#10B981]/15' : 'bg-white border-[#D5E2EC]')
                      : (dark ? 'bg-[#0E0F14] border-[#FFE600]/10' : 'bg-white border-[#E2E2DF]')
                }`}>
                  <span className="text-[8px] font-black uppercase text-gray-400">🔒 Locked Vault</span>
                  <p className={`text-sm font-black mt-1 ${
                    role === 'driver' ? 'text-[#FF8833]' : role === 'cooperative' ? 'text-[#34D399]' : 'text-[#FFE600]'
                  }`}>{formatXlm(Number(userData.vaultBalance || 0))} XLM</p>
                </div>
                <div className={`rounded-[20px] p-4 border shadow-sm ${
                  role === 'driver'
                    ? (dark ? 'bg-[#14100A] border-[#FF6B00]/15' : 'bg-white border-[#EAE6DF]')
                    : role === 'cooperative'
                      ? (dark ? 'bg-[#080F14] border-[#10B981]/15' : 'bg-white border-[#D5E2EC]')
                      : (dark ? 'bg-[#0E0F14] border-[#FFE600]/10' : 'bg-white border-[#E2E2DF]')
                }`}>
                  <span className="text-[8px] font-black uppercase text-gray-400">⭐ Trust Score</span>
                  <p className="text-sm font-black mt-1 text-emerald-500">+{Number(userData.trustScore || 0)} pts</p>
                </div>
              </div>
            </div>

            {/* LAPTOP / DESKTOP VIEW */}
            <div className="hidden lg:block">
              {role === "driver" ? renderDriver() : role === "cooperative" ? renderCooperative() : renderCommuter()}
            </div>

            {/* Mobile PWA Pay Modal */}
            {showPayModal && (
                <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-[9999] p-6">
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
                              className={`flex-1 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider border transition-all ${dark ? 'border-white/10 text-white hover:bg-white/5' : 'border-gray-200 text-gray-855 hover:bg-gray-50'}`}
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
            {showReceiveModal && (() => {
                const rcfg = {
                    commuter:    { border: "border-[#FFE600]/30", badge: "bg-[#FFE600]/10 text-[#FFE600] border-[#FFE600]/20", btn: "bg-[#FFE600] text-black hover:bg-[#E6CE00]", label: "Commuter Pass", ring: "#FFE600", topBar: "bg-[#FFE600]" },
                    driver:      { border: "border-[#FF6B00]/30", badge: "bg-[#FF6B00]/10 text-[#FF6B00] border-[#FF6B00]/20", btn: "bg-[#FF6B00] text-white hover:bg-[#E05E00]", label: "Driver Wallet", ring: "#FF6B00", topBar: "bg-[#FF6B00]" },
                    cooperative: { border: "border-[#10B981]/30", badge: "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20", btn: "bg-[#10B981] text-white hover:bg-[#0E9F6E]", label: "Coop Treasury", ring: "#10B981", topBar: "bg-[#10B981]" },
                };
                const rc = rcfg[role as keyof typeof rcfg] || rcfg.commuter;
                return (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[9999] p-6">
                    <div className={`rounded-[32px] w-full max-w-sm text-center border-2 shadow-2xl overflow-hidden ${dark ? 'bg-[#0C0D12] text-white' : 'bg-white text-gray-900'} ${rc.border}`}>
                        {/* Role identity top bar */}
                        <div className={`h-1.5 w-full ${rc.topBar}`} />
                        <div className="p-8">
                            {/* Header row */}
                            <div className="flex items-center justify-between mb-5">
                                <div className="text-left">
                                    <h3 className="text-xl font-black">Receive Payment</h3>
                                    <p className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Share your address</p>
                                </div>
                                <span className={`text-[9px] font-extrabold uppercase px-2.5 py-1 rounded-full border ${rc.badge}`}>{rc.label}</span>
                            </div>

                            {/* QR Card preview */}
                            <div className={`rounded-[24px] p-5 mb-4 border ${dark ? 'bg-white/3 border-white/5' : 'bg-gray-50 border-gray-100'}`}>
                                <OfflineQrCanvas text={userData.publicKey || userData.uid || ""} size={200} />
                                <div className={`text-[9px] font-black uppercase tracking-wider mb-2 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
                                    {userData?.displayName || userData?.coopName || "Aranova User"}
                                </div>
                                <div className={`text-[10px] font-mono break-all px-3 py-2 rounded-xl ${dark ? 'bg-black/40 text-gray-400' : 'bg-white text-gray-500 border border-gray-100'}`}>
                                    {(userData.publicKey || "").slice(0, 16)}…{(userData.publicKey || "").slice(-16)}
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <button 
                                  className={`flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all active:scale-95 ${rc.btn}`}
                                  onClick={() => {
                                    navigator.clipboard.writeText(userData.publicKey);
                                    alert("Public key copied to clipboard!");
                                  }}
                                >
                                  Copy Key
                                </button>
                                <button 
                                  className={`flex-1 py-3 rounded-xl font-bold text-xs uppercase tracking-wider border transition-all active:scale-95 ${dark ? 'border-white/10 text-white hover:bg-white/5' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                                  onClick={handleDownloadQr}
                                >
                                  💾 Download
                                </button>
                                <button 
                                  className={`flex-1 py-3 rounded-xl font-bold text-xs uppercase tracking-wider border transition-all active:scale-95 ${dark ? 'border-white/10 text-white hover:bg-white/5' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                                  onClick={() => setShowReceiveModal(false)}
                                >
                                  Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                );
            })()}

            {/* Payment Receipt / Confirmation Modal */}
            {activeReceipt && (
                <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-[9999] p-6">
                    <div className={`rounded-[32px] p-8 max-w-md w-full border shadow-2xl transition-all ${dark ? 'bg-[#0E0F14] border-white/10 text-white' : 'bg-white border-gray-100 text-gray-900'}`}>
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center text-3xl font-bold mx-auto mb-4 shadow-lg shadow-emerald-500/20">✓</div>
                            <h3 className="text-xl font-black mb-1">Receipt</h3>
                            <div className="text-emerald-500 font-black text-3xl">{activeReceipt.amount} XLM</div>
                            <div className={`text-xs mt-1 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{activeReceipt.type}</div>
                        </div>

                        <div className={`divide-y text-xs border-y py-4 my-6 ${dark ? 'divide-white/5 border-white/5' : 'divide-gray-100 border-gray-200'}`}>
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
                                <span className={dark ? 'text-gray-500' : 'text-gray-500'}>Date/Time:</span>
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
                              className={`flex-1 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider text-white transition-all ${
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
                              className={`flex-1 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider border transition-all ${dark ? 'border-white/10 text-white hover:bg-white/5' : 'border-gray-200 text-gray-800'}`} 
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
                <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-[9999] p-6">
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
                              className={`flex-1 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider border transition-all ${dark ? 'border-white/10 text-white hover:bg-white/5' : 'border-gray-200 text-gray-850'}`}
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
    const { currentUser, userData: authUserData, loading: globalAuthLoading } = useAuth();
    const [userData, setUserData] = useState<any>(null);
    const [authLoading, setAuthLoading] = useState(true);
    const navigate = useNavigate();

    const refreshUser = async (uid: string) => {
        const snap = await getDoc(doc(db, "users", uid));
        if (snap.exists()) {
            const data = snap.data() as any;
            let liveBalance = data.walletBalance;
            let liveVault = data.vaultBalance;
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
                try {
                    const vaultBalBig = await getVaultBalanceOnChain(data.publicKey);
                    const onChainVault = Number(vaultBalBig) / 10_000_000;
                    if (onChainVault >= 0 && onChainVault !== Number(data.vaultBalance || 0)) {
                        await updateDoc(doc(db, "users", uid), { vaultBalance: onChainVault });
                        liveVault = onChainVault;
                    }
                } catch (e) {
                    console.warn("Could not sync live on-chain vault balance:", e);
                }
            }
            setUserData({ uid, ...data, walletBalance: liveBalance, vaultBalance: liveVault });
        }
    };

    useEffect(() => {
        if (globalAuthLoading) return;
        if (!currentUser) {
            navigate("/auth");
            return;
        }

        let isMounted = true;

        const initializeUser = async () => {
            let profile;
            try {
                profile = await ensureUserProfile(currentUser);
            } catch (err) {
                console.warn("Retrying profile initialization due to timing/permission constraint...", err);
                profile = authUserData || { uid: currentUser.uid, approved: true };
            }

            if (profile.publicKey) {
                try {
                    const stellarBal = await getLiveStellarBalance(profile.publicKey);
                    if (Number(stellarBal) !== Number(profile.walletBalance)) {
                        await updateDoc(doc(db, "users", currentUser.uid), { walletBalance: Number(stellarBal) });
                        profile.walletBalance = Number(stellarBal);
                    }
                } catch (e) {
                    console.warn("Could not sync initial live Stellar balance:", e);
                }
                try {
                    const vaultBalBig = await getVaultBalanceOnChain(profile.publicKey);
                    const onChainVault = Number(vaultBalBig) / 10_000_000;
                    if (onChainVault >= 0 && onChainVault !== Number(profile.vaultBalance || 0)) {
                        await updateDoc(doc(db, "users", currentUser.uid), { vaultBalance: onChainVault });
                        profile.vaultBalance = onChainVault;
                    }
                } catch (e) {
                    console.warn("Could not sync initial live on-chain vault balance:", e);
                }
            }

            if (isMounted) {
                setUserData(profile);
                setAuthLoading(false);
                maybeRunDailyTrustUpdate(profile).catch(() => undefined);
            }
        };

        initializeUser();

        const userUnsub = onSnapshot(doc(db, "users", currentUser.uid), (snap) => {
            if (snap.exists() && isMounted) {
                setUserData({ uid: currentUser.uid, ...snap.data() });
            }
        }, (err) => console.warn("User profile snapshot error:", err));

        return () => {
            isMounted = false;
            userUnsub();
        };
    }, [globalAuthLoading, currentUser, navigate, authUserData]);

    useEffect(() => {
        if (!userData?.uid) return;
        syncBluetoothQueue(userData.uid).catch(() => undefined);
        syncReceivedOfflinePayments(userData.uid).catch(() => undefined);
    }, [userData?.uid]);

    useEffect(() => {
        if (!userData?.publicKey) return;

        const syncLiveOnChainBalances = async () => {
            try {
                const stellarBal = await getLiveStellarBalance(userData.publicKey);
                const vaultBalBig = await getVaultBalanceOnChain(userData.publicKey);
                const onChainVault = Number(vaultBalBig) / 10_000_000;

                setUserData((prev: any) => {
                    if (!prev) return prev;
                    if (Number(stellarBal) !== Number(prev.walletBalance) || onChainVault !== Number(prev.vaultBalance)) {
                        updateDoc(doc(db, "users", prev.uid), {
                            walletBalance: Number(stellarBal),
                            vaultBalance: onChainVault
                        }).catch(() => undefined);
                        return { ...prev, walletBalance: Number(stellarBal), vaultBalance: onChainVault };
                    }
                    return prev;
                });
            } catch (e) {
                // Fail silently
            }
        };

        // Check on-chain balance every 15s to guarantee absolute data integrity
        const timer = setInterval(syncLiveOnChainBalances, 15000);
        return () => clearInterval(timer);
    }, [userData?.publicKey]);

    if (authLoading || !userData) return <LoadingWorkspace message="Loading Aranova workspace..." />;
    if (userData.approved === false) return <LoadingWorkspace message="Verification pending..." />;

    return (
        <UserLayout activeTab={activeTab} onTabChange={setActiveTab} userData={userData}>
            <CommuterPanel userData={userData} onRefresh={() => refreshUser(userData.uid)} />
        </UserLayout>
    );
};

export default UserDashboard;
