import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    collection,
    doc,
    getDoc,
    increment,
    onSnapshot,
    query,
    where,
    serverTimestamp,
    updateDoc,
    setDoc,
    runTransaction,
} from "firebase/firestore";
import { db } from "../../firebase/config";
import UserLayout from "../../components/layout/UserLayout";
import { useTheme } from "../../contexts/ThemeContext";
import { useAuth } from "../../contexts/AuthContext";
import LoadingWorkspace from "../../components/ui/LoadingWorkspace";
import {
    ensureUserProfile,
    maybeRunDailyTrustUpdate,
    recalculateAndSyncTrustScore,
    formatXlm,
    syncBluetoothQueue,
} from "../../services/aranovaWorkflow";
import { getLiveStellarBalance, getVaultBalanceOnChain, HORIZON_URL } from "../../services/sorobanService";
import { Horizon } from "@stellar/stellar-sdk";


const syncReceivedOfflinePayments = async (uid: string) => {
    if (!navigator.onLine) return;

    // 1. Concurrency Lock
    const lockKey = `aranova_receive_sync_lock_${uid}`;
    const isLocked = localStorage.getItem(lockKey);
    if (isLocked) {
        const lockTime = Number(isLocked);
        if (Date.now() - lockTime < 10000) {
            console.warn("Received sync is already running in another tab.");
            return;
        }
    }
    localStorage.setItem(lockKey, Date.now().toString());

    const key = `aranova_received_offline_${uid}`;
    const received = JSON.parse(localStorage.getItem(key) || "[]") as any[];
    if (received.length === 0) {
        localStorage.removeItem(lockKey);
        return;
    }

    const recSnap = await getDoc(doc(db, "users", uid));
    let vaultPct = 0;
    let preferredDays = 30;
    if (recSnap.exists()) {
        vaultPct = recSnap.data().vaultRoutingPct || 0;
        preferredDays = recSnap.data().vaultPreferredDays || 30;
    }

    const failed: any[] = [];

    for (const item of received) {
        try {
            const amount = Number(item.amount);
            const vault_portion = (amount * vaultPct) / 100;
            const wallet_portion = amount - vault_portion;
            const txDocId = item.nonce || `receipt_${Date.now()}`;

            // 2. Global Nonce Deduplication and Balance Updates using a Firestore Transaction
            await runTransaction(db, async (transaction) => {
                const paymentRef = doc(db, "offline_payments", txDocId);
                const paymentDoc = await transaction.get(paymentRef);
                if (paymentDoc.exists()) {
                    throw new Error("This offline payment nonce has already been processed.");
                }

                const payerRef = doc(db, "users", item.payerId);
                const payerDoc = await transaction.get(payerRef);
                if (!payerDoc.exists()) {
                    throw new Error("Payer profile not found.");
                }
                const currentPayerBalance = Number(payerDoc.data().walletBalance || 0);
                if (currentPayerBalance < amount) {
                    throw new Error("Payer has insufficient balance on server.");
                }

                // Write payment log record
                transaction.set(paymentRef, {
                    payerId: item.payerId,
                    payerKey: item.payerKey,
                    recipientId: uid,
                    amount: amount,
                    nonce: item.nonce,
                    channel: "offline_qr",
                    status: "synced",
                    createdAt: serverTimestamp(),
                });

                // Decrement payer balance
                transaction.update(payerRef, {
                    walletBalance: increment(-amount)
                });

                // Credit recipient (driver) balance & vault
                const recipientRef = doc(db, "users", uid);
                transaction.update(recipientRef, {
                    walletBalance: increment(wallet_portion),
                    vaultBalance: increment(vault_portion),
                });
            });

            // Write vault lock record if vault portion is greater than 0
            if (vault_portion > 0) {
                const calculatedMaturityDate = new Date(Date.now() + preferredDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
                const vaultId = `${uid}_vault_offline_${txDocId}`;
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

            // Write final transaction ledger record
            await setDoc(doc(db, "transactions", `tx_${txDocId}`), {
                type: "offline_qr_settled",
                from: item.payerId,
                to: uid,
                amount: amount,
                status: "completed",
                createdAt: serverTimestamp(),
            });

        } catch (err: any) {
            console.error("Failed to sync item:", item, err);
            if (err.message !== "This offline payment nonce has already been processed.") {
                failed.push(item);
            }
        }
    }

    // 3. Partial Failure Recovery: rewrite failed payments back to the queue
    if (failed.length > 0) {
        localStorage.setItem(key, JSON.stringify(failed));
    } else {
        localStorage.removeItem(key);
    }

    localStorage.removeItem(lockKey);
};

const CommuterPanel: React.FC<{ userData: any; onRefresh: () => void }> = ({ userData, onRefresh }) => {
    const { dark } = useTheme();
    const { currentUser } = useAuth();
    const role = userData?.role || "commuter";
    
    const [busy, setBusy] = useState(false);
    const [offlineQueueLength, setOfflineQueueLength] = useState(0);
    const [bluetoothNotification, setBluetoothNotification] = useState<any | null>(null);
    const [outgoingQueue, setOutgoingQueue] = useState<any[]>([]);
    const [incomingQueue, setIncomingQueue] = useState<any[]>([]);
    const [showQueueDetails, setShowQueueDetails] = useState(false);

    // Simulated Bluetooth Low Energy (BLE) Broadcast receiver channel
    useEffect(() => {
        try {
            const bc = new BroadcastChannel("aranova_bluetooth_p2p");
            bc.onmessage = (msgEvent) => {
                const data = msgEvent.data;
                if (data && data.type === "offline_pay") {
                    const isRecipient = 
                        data.recipient === userData.publicKey || 
                        data.recipient === userData.uid || 
                        data.recipient === userData.email;
                    
                    if (isRecipient) {
                        setBluetoothNotification(data);
                    }
                }
            };
            return () => bc.close();
        } catch (e) {
            console.warn("BroadcastChannel Bluetooth BLE simulation not supported:", e);
        }
    }, [userData?.publicKey, userData?.uid, userData?.email]);

    const handleAcceptBluetoothPayment = async () => {
        if (!bluetoothNotification) return;
        try {
            const recKey = `aranova_received_offline_${userData.uid}`;
            const received = JSON.parse(localStorage.getItem(recKey) || "[]") as any[];
            
            if (received.some((r: any) => r.nonce === bluetoothNotification.nonce)) {
                alert("This payment has already been queued.");
                setBluetoothNotification(null);
                return;
            }

            // Generate receiver signature as double-signing proof
            let receiverSignature = "";
            try {
                const secret = localStorage.getItem(`aranova_wallet_secret_${userData.uid}`);
                if (secret) {
                    const { Keypair } = await import("@stellar/stellar-sdk");
                    const kp = Keypair.fromSecret(secret);
                    const sigBuf = kp.sign(Buffer.from(bluetoothNotification.signature || bluetoothNotification.nonce));
                    receiverSignature = sigBuf.toString("hex");
                }
            } catch (e) {
                console.warn("Receiver offline double-signing failed:", e);
            }

            const receipt = {
                ...bluetoothNotification,
                receiverKey: userData.publicKey || "",
                receiverSignature,
                doubleSigned: !!receiverSignature,
            };

            received.push(receipt);
            localStorage.setItem(recKey, JSON.stringify(received));
            checkOfflineQueue();
            alert(`Successfully received ${bluetoothNotification.amount} XLM from commuter ${bluetoothNotification.payerName} via Bluetooth! Double-signed receipt saved offline.`);
        } catch (err) {
            console.error(err);
        } finally {
            setBluetoothNotification(null);
        }
    };

    // Ref to track processed transaction hashes to prevent duplicates
    const processedTxsRef = React.useRef<Record<string, boolean>>({});
    const markTxProcessed = (txHash: string) => {
        if (!txHash) return false;
        if (processedTxsRef.current[txHash]) return true;
        processedTxsRef.current[txHash] = true;
        return false;
    };

    const availableCredit = useMemo(() => Math.max(25, Number(userData.trustScore || 0) * 2), [userData.trustScore]);

    const checkOfflineQueue = () => {
        const key = `aranova_offline_queue_${userData.uid}`;
        const queued = JSON.parse(localStorage.getItem(key) || "[]") as any[];

        const recKey = `aranova_received_offline_${userData.uid}`;
        const recQueued = JSON.parse(localStorage.getItem(recKey) || "[]") as any[];

        setOfflineQueueLength(queued.length + recQueued.length);
        setOutgoingQueue(queued);
        setIncomingQueue(recQueued);
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
        if (!currentUser) return; // Skip Firestore transactions listener in sandbox mode
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
                    onRefresh();
                }
                return;
            }

            if (latestDoc.id !== lastTxId) {
                lastTxId = latestDoc.id;
                if (data.from !== userData.uid && !markTxProcessed(txHash)) {
                    handleIncomingVaultSplit(data, txHash);
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
    }, [userData.uid, userData.publicKey, userData.email, onRefresh, currentUser]);

    const handleSyncQueue = async () => {
        if (!currentUser) {
            alert("⚠️ Offline syncing is disabled in Sandbox/Local Mode. Sign in with a real account to sync.");
            return;
        }
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


        const renderUnifiedDashboard = () => (
      <div className="space-y-6 animate-slide-up pb-24">
        {/* Role identity banner */}
        <div className={`rounded-[24px] px-5 py-4 flex items-center justify-between border shadow-sm ${
          role === 'driver'
            ? (dark ? 'bg-[#FF6B00]/10 border-[#FF6B00]/20' : 'bg-orange-50 border-orange-200')
            : role === 'cooperative'
              ? (dark ? 'bg-[#10B981]/10 border-[#10B981]/20' : 'bg-emerald-50 border-emerald-200')
              : (dark ? 'bg-[#FFE600]/10 border-[#FFE600]/20' : 'bg-yellow-50 border-yellow-200')
        }`}>
          <div className="flex items-center gap-4">
            <span className="text-3xl">{role === 'driver' ? '🛺' : role === 'cooperative' ? '🏢' : '💳'}</span>
            <div>
              <div className={`text-[10px] font-black uppercase tracking-widest ${
                role === 'driver' ? 'text-[#FF8833]' : role === 'cooperative' ? 'text-[#34D399]' : 'text-[#FFE600]'
              }`}>{role === 'driver' ? 'Driver Wallet' : role === 'cooperative' ? 'Cooperative Treasury' : 'Commuter Pass'}</div>
              <div className={`text-sm font-bold ${dark ? 'text-gray-200' : 'text-gray-800'}`}>{userData?.displayName || userData?.coopName}</div>
              {userData?.publicKey && (
                <div className="text-[9px] font-mono text-gray-400 mt-0.5 select-all break-all max-w-[200px]" title="Stellar Public Key">
                  {userData.publicKey}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Hero Balance Card */}
        <div className={`relative overflow-hidden rounded-[32px] p-8 border shadow-xl flex flex-col justify-between transition-all duration-300 ${
          role === 'driver'
            ? 'bg-gradient-to-br from-[#14100A] to-[#251A14] border-[#FF6B00]/20'
            : role === 'cooperative'
              ? 'bg-gradient-to-br from-[#080F14] to-[#0D1A1A] border-[#10B981]/20'
              : 'bg-gradient-to-br from-[#0E0F14] to-[#161822] border-[#FFE600]/10'
        }`}>
          <div className={`absolute top-0 right-0 w-48 h-48 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none opacity-[0.15] ${
            role === 'driver' ? 'bg-[#FF6B00]' : role === 'cooperative' ? 'bg-[#10B981]' : 'bg-[#FFE600]'
          }`} />
          <div>
            <span className="text-xs font-black uppercase tracking-widest text-gray-400">Available Balance</span>
            <h1 className="text-4xl sm:text-5xl font-black text-white mt-4 tracking-tight">
              {formatXlm(Number(userData.walletBalance || 0))} <span className="text-xl opacity-50">XLM</span>
            </h1>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-4">
          <button 
            onClick={() => window.location.href = '/user/send'} 
            className={`flex items-center justify-center py-5 rounded-[24px] border active:scale-95 transition-all gap-2 font-black text-sm uppercase tracking-wider shadow-md ${
                role === 'driver' 
                  ? 'border-[#FF6B00]/20 bg-[#FF6B00] text-white hover:bg-[#E05E00]' 
                  : role === 'cooperative' 
                    ? 'border-[#10B981]/20 bg-[#10B981] text-white hover:bg-[#0E9F6E]' 
                    : 'border-[#FFE600]/20 bg-[#FFE600] text-black hover:bg-[#E6CE00]'
            }`}
          >
            💸 Pay
          </button>
          <button 
            onClick={() => window.location.href = '/user/receive'} 
            className={`flex items-center justify-center py-5 rounded-[24px] border active:scale-95 transition-all gap-2 font-black text-sm uppercase tracking-wider shadow-md ${
              dark ? 'border-white/10 bg-white/5 text-white hover:bg-white/10' : 'border-gray-200 bg-gray-50 text-gray-800 hover:bg-gray-100'
            }`}
          >
            📥 Receive
          </button>
        </div>

        {/* Role-Specific Feature Cards */}
        {role === 'driver' && (
          <div className="grid grid-cols-2 gap-4 mt-6">
             {/* Fuel Credit — auto-disbursed by cooperative, tap to view details */}
             <button onClick={() => window.location.href = '/user/fuel-credit'} className={`block text-left rounded-[24px] p-5 border shadow-sm active:scale-95 transition-all ${dark ? 'bg-[#14100A] border-[#FF6B00]/15 hover:border-[#FF6B00]/40' : 'bg-white border-gray-200 hover:border-[#FF6B00]/40'}`}>
                <span className="text-2xl mb-2 block">⛽</span>
                <span className="text-[10px] font-black uppercase text-gray-400">Fuel Credit</span>
                <p className={`text-base font-black mt-1 ${dark ? 'text-white' : 'text-gray-900'}`}>{formatXlm(availableCredit)} XLM</p>
                <p className={`text-[9px] mt-1 font-semibold ${dark ? 'text-[#FF8833]' : 'text-[#FF6B00]'}`}>View details &rarr;</p>
             </button>
             <button onClick={() => window.location.href = '/user/loans'} className={`block text-left rounded-[24px] p-5 border shadow-sm active:scale-95 transition-all ${dark ? 'bg-[#14100A] border-[#FF6B00]/15 hover:border-[#FF6B00]/40' : 'bg-white border-gray-200 hover:border-[#FF6B00]/40'}`}>
                <span className="text-2xl mb-2 block">🤝</span>
                <span className="text-[10px] font-black uppercase text-gray-400">Microloans</span>
                <p className={`text-sm font-black mt-1 ${dark ? 'text-[#FF8833]' : 'text-[#FF6B00]'}`}>Manage &rarr;</p>
             </button>
          </div>
        )}

        {/* Bento stats grid: Locked savings & Trust Delta */}
        <div className="grid grid-cols-2 gap-4 mt-6">
          <div className={`rounded-[24px] p-5 border shadow-sm ${
            role === 'driver'
              ? (dark ? 'bg-[#14100A] border-[#FF6B00]/15' : 'bg-white border-gray-200')
              : role === 'cooperative'
                ? (dark ? 'bg-[#080F14] border-[#10B981]/15' : 'bg-white border-gray-200')
                : (dark ? 'bg-[#0E0F14] border-[#FFE600]/10' : 'bg-white border-gray-200')
          }`}>
            <span className="text-[10px] font-black uppercase text-gray-400">🔒 Vault Locked</span>
            <p className={`text-lg font-black mt-1 ${
              role === 'driver' ? 'text-[#FF8833]' : role === 'cooperative' ? 'text-[#34D399]' : 'text-[#FFE600]'
            }`}>{formatXlm(Number(userData.vaultBalance || 0))} XLM</p>
          </div>
          <div className={`rounded-[24px] p-5 border shadow-sm ${
            role === 'driver'
              ? (dark ? 'bg-[#14100A] border-[#FF6B00]/15' : 'bg-white border-gray-200')
              : role === 'cooperative'
                ? (dark ? 'bg-[#080F14] border-[#10B981]/15' : 'bg-white border-gray-200')
                : (dark ? 'bg-[#0E0F14] border-[#FFE600]/10' : 'bg-white border-gray-200')
          }`}>
            <span className="text-[10px] font-black uppercase text-gray-400">⭐ Trust Score</span>
            <p className="text-lg font-black mt-1 text-emerald-500">{Number(userData.trustScore || 0)} pts</p>
          </div>
        </div>

      </div>
    );

    // === MAIN COMMUTER PANEL RETURN ===
    return (
        <div className="space-y-6">
            {offlineQueueLength > 0 && (
                <div className={`border rounded-[28px] p-6 space-y-4 transition-all duration-300 ${dark ? 'bg-[#101424] border-white/10' : 'bg-white border-gray-150 shadow-sm'}`}>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                            <span className={`text-sm font-extrabold tracking-wide uppercase flex items-center gap-2 ${dark ? 'text-blue-400' : 'text-blue-800'}`}>
                              📡 Offline Transactions Queued
                            </span>
                            <div className={`text-xs mt-1 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                              {offlineQueueLength} payment{offlineQueueLength > 1 ? 's' : ''} queued locally.
                            </div>
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto">
                            <button
                              onClick={() => setShowQueueDetails(!showQueueDetails)}
                              className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider border transition-all ${
                                dark ? "border-white/10 text-gray-300 hover:bg-white/5" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                              }`}
                            >
                              {showQueueDetails ? "Hide Details" : "View Receipts"}
                            </button>
                            <button
                              onClick={handleSyncQueue}
                              disabled={busy || !navigator.onLine}
                              className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider disabled:opacity-50 transition-all ${
                                role === 'driver'
                                  ? 'bg-[#FF6B00] text-white hover:bg-[#E05E00]'
                                  : role === 'cooperative'
                                    ? 'bg-[#10B981] text-white hover:bg-[#0E9F6E]'
                                    : 'bg-black text-[#FFE600] hover:opacity-90'
                              }`}
                            >
                              Sync Queue
                            </button>
                        </div>
                    </div>

                    {showQueueDetails && (
                        <div className="space-y-3 pt-3 border-t border-dashed border-gray-200 dark:border-white/10 animate-fadeIn">
                            {/* Incoming Receipts (Scanned Offline Payments) */}
                            {incomingQueue.length > 0 && (
                                <div className="space-y-2">
                                    <div className="text-[10px] font-black uppercase tracking-wider text-green-500">📥 Received Offline (Pending Sync)</div>
                                    <div className="grid gap-2">
                                        {incomingQueue.map((item, idx) => (
                                            <div key={idx} className={`p-3 rounded-xl border flex justify-between items-center ${dark ? 'bg-black/30 border-white/5' : 'bg-gray-50 border-gray-150'}`}>
                                                <div className="text-left">
                                                    <div className="text-xs font-bold text-gray-800 dark:text-gray-200">From: {item.payerName || "Commuter"}</div>
                                                    <div className="text-[9px] text-gray-400 font-mono mt-0.5">Sig: {item.signature?.slice(0, 12)}...</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-xs font-black text-green-500">+{item.amount} XLM</div>
                                                    <div className="text-[9px] text-gray-400 mt-0.5">{item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : ""}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Outgoing Receipts (Waiting for Commuter Sync) */}
                            {outgoingQueue.length > 0 && (
                                <div className="space-y-2 pt-2">
                                    <div className="text-[10px] font-black uppercase tracking-wider text-amber-500">📤 Outgoing Payments (Pending Sync)</div>
                                    <div className="grid gap-2">
                                        {outgoingQueue.map((item, idx) => (
                                            <div key={idx} className={`p-3 rounded-xl border flex justify-between items-center ${dark ? 'bg-black/30 border-white/5' : 'bg-gray-50 border-gray-150'}`}>
                                                <div className="text-left">
                                                    <div className="text-xs font-bold text-gray-800 dark:text-gray-200">To: {item.recipient?.slice(0, 8)}...{item.recipient?.slice(-8)}</div>
                                                    <div className="text-[9px] text-gray-400 font-mono mt-0.5">Sig: {item.signature?.slice(0, 12)}...</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-xs font-black text-amber-500">-{item.amount} XLM</div>
                                                    <div className="text-[9px] text-gray-400 mt-0.5">{item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : ""}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
            {renderUnifiedDashboard()}

            {bluetoothNotification && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999] p-6">
                    <div className={`rounded-[32px] p-6 max-w-sm w-full border shadow-2xl text-center ${
                        dark ? "bg-[#0E0F14] border-white/10 text-white" : "bg-white border-gray-100 text-gray-900"
                    }`}>
                        <div className="relative w-16 h-16 mx-auto mb-4 flex items-center justify-center rounded-full bg-blue-500/10 text-blue-500">
                            <span className="text-2xl animate-pulse">📡</span>
                            <div className="absolute w-full h-full rounded-full border border-blue-500/30 animate-ping" />
                        </div>
                        <h3 className="text-lg font-black">Proximity BLE Broadcast</h3>
                        <p className="text-xs text-gray-500 mt-1">Commuter is beaming an offline payment to you.</p>

                        <div className={`p-4 my-6 rounded-2xl text-left text-xs space-y-2 ${
                            dark ? "bg-white/5 text-gray-300" : "bg-gray-50 text-gray-700"
                        }`}>
                            <div><strong>Payer:</strong> {bluetoothNotification.payerName}</div>
                            <div><strong>Amount:</strong> {bluetoothNotification.amount} XLM</div>
                            <div><strong>Nonce:</strong> {bluetoothNotification.nonce}</div>
                            <div><strong>Sig Hash:</strong> {bluetoothNotification.signature.slice(0, 16)}...</div>
                        </div>

                        <div className="flex gap-3">
                            <button 
                                onClick={handleAcceptBluetoothPayment} 
                                className="flex-1 py-3 rounded-xl font-black text-xs uppercase bg-blue-600 hover:bg-blue-500 text-white active:scale-95 transition-all"
                            >
                                Accept & Queue
                            </button>
                            <button 
                                onClick={() => setBluetoothNotification(null)} 
                                className={`flex-1 py-3 rounded-xl font-bold text-xs uppercase border ${
                                    dark ? "border-white/10 hover:bg-white/5" : "border-gray-200 hover:bg-gray-50"
                                }`}
                            >
                                Decline
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

}; // end CommuterPanel

const UserDashboard: React.FC = () => {
    const [activeTab, setActiveTab] = useState("wallet");
    const { currentUser, userData: authUserData, loading: globalAuthLoading } = useAuth();
    const [userData, setUserData] = useState<any>(null);
    const [authLoading, setAuthLoading] = useState(true);
    const navigate = useNavigate();

    const refreshUser = async (uid: string) => {
        if (!currentUser) {
            const cached = localStorage.getItem("aranova_auth_profile");
            if (cached) {
                const data = JSON.parse(cached);
                let liveBalance = data.walletBalance;
                let liveVault = data.vaultBalance;
                if (data.publicKey) {
                    try {
                        const stellarBal = await getLiveStellarBalance(data.publicKey);
                        liveBalance = Number(stellarBal);
                    } catch (e) {}
                    try {
                        const vaultBalBig = await getVaultBalanceOnChain(data.publicKey);
                        liveVault = Number(vaultBalBig) / 10_000_000;
                    } catch (e) {}
                }
                const updated = { ...data, walletBalance: liveBalance, vaultBalance: liveVault };
                localStorage.setItem("aranova_auth_profile", JSON.stringify(updated));
                
                const localUsers = JSON.parse(localStorage.getItem("aranova_local_users") || "{}");
                localUsers[uid] = updated;
                localStorage.setItem("aranova_local_users", JSON.stringify(localUsers));

                setUserData(updated);
            }
            return;
        }

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
        const localUser = localStorage.getItem("aranova_auth_user");
        if (!currentUser && !localUser) {
            navigate("/auth");
            return;
        }

        const activeUser = currentUser || (localUser ? JSON.parse(localUser) : null);
        if (!activeUser) return;

        let isMounted = true;

        const initializeUser = async () => {
            let profile;
            try {
                if (currentUser) {
                    profile = await ensureUserProfile(activeUser);
                } else {
                    const cached = localStorage.getItem("aranova_auth_profile");
                    profile = cached ? JSON.parse(cached) : { uid: activeUser.uid, approved: true };
                }
            } catch (err) {
                console.warn("Retrying profile initialization due to timing/permission constraint...", err);
                profile = authUserData || { uid: activeUser.uid, approved: true };
            }

            if (isMounted) {
                setUserData(profile);
                setAuthLoading(false);
            }

            if (profile.publicKey) {
                (async () => {
                    try {
                        const stellarBal = await getLiveStellarBalance(profile.publicKey);
                        if (Number(stellarBal) !== Number(profile.walletBalance)) {
                            if (currentUser) {
                                await updateDoc(doc(db, "users", activeUser.uid), { walletBalance: Number(stellarBal) });
                            } else {
                                const cached = localStorage.getItem("aranova_auth_profile");
                                if (cached) {
                                    const updated = { ...JSON.parse(cached), walletBalance: Number(stellarBal) };
                                    localStorage.setItem("aranova_auth_profile", JSON.stringify(updated));
                                    setUserData(updated);
                                    
                                    const localUsers = JSON.parse(localStorage.getItem("aranova_local_users") || "{}");
                                    localUsers[activeUser.uid] = updated;
                                    localStorage.setItem("aranova_local_users", JSON.stringify(localUsers));
                                }
                            }
                        }
                    } catch (e) {
                        console.warn("Could not sync initial live Stellar balance:", e);
                    }
                    try {
                        const vaultBalBig = await getVaultBalanceOnChain(profile.publicKey);
                        const onChainVault = Number(vaultBalBig) / 10_000_000;
                        if (onChainVault >= 0 && onChainVault !== Number(profile.vaultBalance || 0)) {
                            if (currentUser) {
                                await updateDoc(doc(db, "users", activeUser.uid), { vaultBalance: onChainVault });
                            } else {
                                const cached = localStorage.getItem("aranova_auth_profile");
                                if (cached) {
                                    const updated = { ...JSON.parse(cached), vaultBalance: onChainVault };
                                    localStorage.setItem("aranova_auth_profile", JSON.stringify(updated));
                                    setUserData(updated);
                                    
                                    const localUsers = JSON.parse(localStorage.getItem("aranova_local_users") || "{}");
                                    localUsers[activeUser.uid] = updated;
                                    localStorage.setItem("aranova_local_users", JSON.stringify(localUsers));
                                }
                            }
                        }
                    } catch (e) {
                        console.warn("Could not sync initial live on-chain vault balance:", e);
                    }
                })();
            }

            if (isMounted) {
                (async () => {
                    try {
                        if (currentUser) {
                            await maybeRunDailyTrustUpdate(profile);
                            await recalculateAndSyncTrustScore(activeUser.uid);
                        }
                    } catch (err) {
                        console.warn("Error updating trust score on load:", err);
                    }
                })();
            }
        };

        initializeUser();

        let userUnsub = () => {};
        if (currentUser) {
            userUnsub = onSnapshot(doc(db, "users", activeUser.uid), (snap) => {
                if (snap.exists() && isMounted) {
                    setUserData({ uid: activeUser.uid, ...snap.data() });
                }
            }, (err) => console.warn("User profile snapshot error:", err));
        }

        return () => {
            isMounted = false;
            userUnsub();
        };
    }, [globalAuthLoading, currentUser, navigate, authUserData]);

    useEffect(() => {
        if (!currentUser) return; // Skip automatic online syncing in sandbox mode
        if (!userData?.uid) return;
        
        const trySync = () => {
            syncBluetoothQueue(userData.uid).catch(() => undefined);
            syncReceivedOfflinePayments(userData.uid).catch(() => undefined);
        };
        
        trySync();
        
        window.addEventListener("online", trySync);
        return () => {
            window.removeEventListener("online", trySync);
        };
    }, [userData?.uid, currentUser]);

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
