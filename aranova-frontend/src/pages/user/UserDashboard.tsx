import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    addDoc,
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
    
    const [busy, setBusy] = useState(false);
    const [offlineQueueLength, setOfflineQueueLength] = useState(0);

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
    }, [userData.uid, userData.publicKey, userData.email, onRefresh]);

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
                <div className={`border rounded-[28px] p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-all duration-300 ${dark ? 'bg-blue-950/20 border-blue-900/30' : 'bg-blue-50 border-blue-100'}`}>
                    <div>
                        <span className={`text-sm font-extrabold tracking-wide uppercase flex items-center gap-2 ${dark ? 'text-blue-400' : 'text-blue-800'}`}>
                          📡 Offline Transactions Queued
                        </span>
                        <div className={`text-xs mt-1 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>You have {offlineQueueLength} payments waiting to sync.</div>
                    </div>
                    <button
                      onClick={handleSyncQueue}
                      disabled={busy || !navigator.onLine}
                      className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider disabled:opacity-50 transition-all ${
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
            )}
            {renderUnifiedDashboard()}
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

            if (isMounted) {
                setUserData(profile);
                setAuthLoading(false);
            }

            if (profile.publicKey) {
                (async () => {
                    try {
                        const stellarBal = await getLiveStellarBalance(profile.publicKey);
                        if (Number(stellarBal) !== Number(profile.walletBalance)) {
                            await updateDoc(doc(db, "users", currentUser.uid), { walletBalance: Number(stellarBal) });
                        }
                    } catch (e) {
                        console.warn("Could not sync initial live Stellar balance:", e);
                    }
                    try {
                        const vaultBalBig = await getVaultBalanceOnChain(profile.publicKey);
                        const onChainVault = Number(vaultBalBig) / 10_000_000;
                        if (onChainVault >= 0 && onChainVault !== Number(profile.vaultBalance || 0)) {
                            await updateDoc(doc(db, "users", currentUser.uid), { vaultBalance: onChainVault });
                        }
                    } catch (e) {
                        console.warn("Could not sync initial live on-chain vault balance:", e);
                    }
                })();
            }

            if (isMounted) {
                (async () => {
                    try {
                        await maybeRunDailyTrustUpdate(profile);
                        await recalculateAndSyncTrustScore(currentUser.uid);
                    } catch (err) {
                        console.warn("Error updating trust score on load:", err);
                    }
                })();
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
