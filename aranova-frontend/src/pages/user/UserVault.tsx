import { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import UserLayout, { useTheme } from "../../components/layout/UserLayout";
import LoadingWorkspace from "../../components/ui/LoadingWorkspace";
import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  increment,
  serverTimestamp,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { scoreDeltaForVault, dayMs, formatXlm } from "../../services/aranovaWorkflow";

const UserVault = () => {
  const { userData, loading: authLoading } = useAuth();
  const { dark } = useTheme();

  // State
  const [vaults, setVaults] = useState<any[]>([]);
  const [lockPercent, setLockPercent] = useState("25");
  const [lockDays, setLockDays] = useState("30");
  const [busy, setBusy] = useState(false);
  const [showLockForm, setShowLockForm] = useState(false);

  // Subscribe to user vaults
  useEffect(() => {
    if (authLoading || !userData?.uid) return;

    const q = query(
      collection(db, "vaults"),
      where("ownerId", "==", userData.uid)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      setVaults(list);
    }, (err) => console.warn("User vaults snapshot error:", err));

    return () => unsub();
  }, [userData, authLoading]);

  if (authLoading || !userData) {
    return <LoadingWorkspace message="Syncing vault cryptographic allocations..." dark={dark} />;
  }

  const walletBalance = Number(userData.walletBalance || 0);
  const vaultBalance = Number(userData.vaultBalance || 0);

  // Form calculated values
  const percentVal = Number(lockPercent) || 0;
  const daysVal = Number(lockDays) || 0;
  const calculatedLockAmount = (walletBalance * percentVal) / 100;
  const calculatedMaturityDate = new Date(Date.now() + daysVal * dayMs).toISOString().slice(0, 10);

  // Lock Funds Handler
  const handleLockFunds = async (e: React.FormEvent) => {
    e.preventDefault();
    if (calculatedLockAmount <= 0) return alert("Select a valid percentage and balance to lock.");
    if (calculatedLockAmount > walletBalance) return alert("Insufficient wallet balance.");
    if (daysVal <= 0) return alert("Select a valid duration.");

    setBusy(true);
    try {
      const vaultId = `${userData.uid}_vault_${Date.now()}`;
      await setDoc(doc(db, "vaults", vaultId), {
        ownerId: userData.uid,
        lockedAmount: calculatedLockAmount,
        lockPercent: percentVal,
        lockDays: daysVal,
        maturityDate: calculatedMaturityDate,
        status: "locked",
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "users", userData.uid), {
        walletBalance: increment(-calculatedLockAmount),
        vaultBalance: increment(calculatedLockAmount),
        trustScore: Math.min(100, Number(userData.trustScore || 0) + scoreDeltaForVault(calculatedLockAmount, daysVal)),
        lastTrustUpdate: serverTimestamp(),
      });

      await addDoc(collection(db, "transactions"), {
        type: "vault_lock",
        from: userData.uid,
        to: "vault",
        amount: calculatedLockAmount,
        status: "completed",
        createdAt: serverTimestamp(),
      });

      alert(`Successfully locked ${formatXlm(calculatedLockAmount)} XLM in your Personal Vault!`);
      setShowLockForm(false);
    } catch (err: any) {
      console.error(err);
      alert("Failed to lock funds: " + (err.message || err));
    } finally {
      setBusy(false);
    }
  };

  // Redeem Matured Vault Handler
  const handleRedeem = async (vault: any) => {
    setBusy(true);
    try {
      const redeemAmount = Number(vault.lockedAmount || 0);

      // Update vault status to redeemed
      await updateDoc(doc(db, "vaults", vault.id), {
        status: "redeemed",
        redeemedAt: serverTimestamp(),
      });

      // Update user document
      await updateDoc(doc(db, "users", userData.uid), {
        walletBalance: increment(redeemAmount),
        vaultBalance: increment(-redeemAmount),
        trustScore: Math.min(100, Number(userData.trustScore || 0) + 2), // +2 trust for successful maturity redemption
        lastTrustUpdate: serverTimestamp(),
      });

      // Log transaction
      await addDoc(collection(db, "transactions"), {
        type: "vault_redeem",
        from: "vault",
        to: userData.uid,
        amount: redeemAmount,
        status: "completed",
        createdAt: serverTimestamp(),
      });

      alert(`Successfully redeemed ${formatXlm(redeemAmount)} XLM back to your wallet!`);
    } catch (err: any) {
      console.error(err);
      alert("Failed to redeem vault: " + (err.message || err));
    } finally {
      setBusy(false);
    }
  };

  // Check if a vault is matured
  const isMatured = (maturityDateStr: string) => {
    if (!maturityDateStr) return false;
    const maturity = new Date(maturityDateStr);
    return Date.now() >= maturity.getTime();
  };

  return (
    <UserLayout activeTab="vault" userData={userData}>
      <div className={`max-w-5xl mx-auto space-y-6 transition-colors duration-200 ${dark ? 'text-gray-100' : 'text-gray-900'}`}>

        {/* Header Area */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2 md:mb-6">
          <h1 className="text-2xl font-black hidden sm:block">My Cryptographic Vault</h1>
          <div className={`rounded-full px-4 py-2 flex items-center gap-2 shadow-sm w-max ${dark ? 'bg-blue-950/40 border border-blue-900/30' : 'bg-blue-50 border border-blue-100'}`}>
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-600"></span>
            </span>
            <span className={`text-xs font-bold tracking-wide uppercase ${dark ? 'text-blue-300' : 'text-blue-800'}`}>
              Bluetooth Ready (Offline Mode)
            </span>
          </div>
        </div>

        {/* Responsive Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">

            {/* Vault Hero Card */}
            <div className="bg-gradient-to-br from-[#10B981] to-[#047857] rounded-[2rem] p-6 sm:p-10 text-white shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-white opacity-10 rounded-full blur-3xl -mr-10 -mt-10"></div>

              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">🔒</span>
                <p className="text-emerald-100 text-sm font-semibold opacity-90">
                  Total Locked Savings
                </p>
              </div>

              <div className="flex items-baseline gap-2 mb-8 sm:mb-12 relative z-10">
                <h2 className="text-5xl md:text-6xl font-black tracking-tight">{formatXlm(vaultBalance)}</h2>
                <span className="text-xl font-bold text-emerald-100 mb-1">XLM</span>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 relative z-10">
                <button
                  onClick={() => setShowLockForm(!showLockForm)}
                  className="flex-1 bg-white text-emerald-700 py-4 rounded-2xl font-black text-sm shadow-lg hover:bg-gray-50 active:scale-95 transition-all"
                >
                  {showLockForm ? "Cancel Locking" : "+ Lock Funds"}
                </button>
              </div>
            </div>

            {/* Lock Funds Interactive Form */}
            {showLockForm && (
              <div className={`p-6 rounded-3xl border shadow-md space-y-4 ${dark ? 'bg-[#111827] border-white/10' : 'bg-white border-[#E5E7EB]'}`}>
                <h3 className="text-lg font-black">Configure Vault Lock</h3>
                <form onSubmit={handleLockFunds} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold mb-1.5 uppercase text-gray-400">Lock Percentage ({percentVal}%)</label>
                      <select
                        value={lockPercent}
                        onChange={(e) => setLockPercent(e.target.value)}
                        className={`w-full p-3 rounded-xl border font-semibold ${dark ? 'bg-[#1f2937] border-white/10 text-white' : 'bg-gray-50 border-gray-200'}`}
                      >
                        <option value="25">25% of Wallet Balance</option>
                        <option value="50">50% of Wallet Balance</option>
                        <option value="75">75% of Wallet Balance</option>
                        <option value="100">100% of Wallet Balance</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold mb-1.5 uppercase text-gray-400">Lock Duration ({daysVal} Days)</label>
                      <select
                        value={lockDays}
                        onChange={(e) => setLockDays(e.target.value)}
                        className={`w-full p-3 rounded-xl border font-semibold ${dark ? 'bg-[#1f2937] border-white/10 text-white' : 'bg-gray-50 border-gray-200'}`}
                      >
                        <option value="7">7 Days (Short-term)</option>
                        <option value="30">30 Days (Medium-term)</option>
                        <option value="90">90 Days (Long-term)</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-between items-center p-3 rounded-xl text-sm font-semibold bg-emerald-500/10 text-emerald-400">
                    <span>Estimated Lock Amount:</span>
                    <span className="font-bold">{formatXlm(calculatedLockAmount)} XLM</span>
                  </div>

                  <div className="flex justify-between items-center p-3 rounded-xl text-sm font-semibold bg-blue-500/10 text-blue-400">
                    <span>Maturity Date:</span>
                    <span className="font-bold">{calculatedMaturityDate}</span>
                  </div>

                  <button
                    type="submit"
                    disabled={busy || calculatedLockAmount <= 0}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl transition-all disabled:opacity-50"
                  >
                    {busy ? "Locking..." : "Confirm & Authorize Lock"}
                  </button>
                </form>
              </div>
            )}

            {/* Side-by-side Vault Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className={`p-6 sm:p-8 rounded-3xl border shadow-sm flex flex-col items-center justify-center gap-2 text-center ${dark ? 'bg-[#111827] border-white/10' : 'bg-white border-[#E5E7EB]'}`}>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Available Wallet Balance</p>
                <h3 className="text-3xl font-black text-blue-500">{formatXlm(walletBalance)} XLM</h3>
                <p className="text-[11px] font-semibold text-gray-500">For standard transfers & everyday payments</p>
              </div>

              <div className={`p-6 sm:p-8 rounded-3xl border shadow-sm flex flex-col items-center justify-center gap-2 text-center ${dark ? 'bg-[#111827] border-white/10' : 'bg-white border-[#E5E7EB]'}`}>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Trust Score multiplier</p>
                <h3 className="text-3xl font-black text-green-500">+{vaults.filter(v => v.status === "locked").reduce((acc, v) => acc + scoreDeltaForVault(v.lockedAmount, v.lockDays), 0)} pts</h3>
                <p className="text-[11px] font-semibold text-gray-500">Currently contributing to borrow limit boost</p>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Credit Score Impact Card */}
            <div className={`border rounded-3xl p-6 shadow-sm relative overflow-hidden flex flex-col justify-center ${dark ? 'bg-[#111827] border-white/10' : 'bg-white border-[#E5E7EB]'}`}>
              <div className="absolute left-0 top-0 bottom-0 w-2 bg-emerald-500"></div>
              <h3 className="text-sm font-black mb-4">Trust Score Impact</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1.5">
                    <span className="text-gray-400">Lock Health multiplier</span>
                    <span className="text-emerald-500">{userData.trustScore}/100</span>
                  </div>
                  <div className={`w-full rounded-full h-2 ${dark ? 'bg-gray-800' : 'bg-gray-100'}`}>
                    <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${userData.trustScore}%` }}></div>
                  </div>
                </div>
                <p className="text-xs font-semibold text-gray-400 leading-relaxed">
                  Your locked savings vault is an unalterable representation of creditworthiness. Redemptions at maturity boost your trust score, while overdue credit lines may automatically liquidate vault assets.
                </p>
              </div>
            </div>

            {/* Active Locks List */}
            <div className={`border rounded-3xl p-6 shadow-sm flex-1 ${dark ? 'bg-[#111827] border-white/10' : 'bg-white border-[#E5E7EB]'}`}>
              <div className="flex justify-between items-end mb-6">
                <h3 className="font-black text-lg">Active & Historical Locks</h3>
              </div>

              <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                {vaults.length === 0 ? (
                  <p className="text-xs font-bold text-gray-500 text-center py-8">No vault records found.</p>
                ) : (
                  vaults.map((vault) => {
                    const matured = isMatured(vault.maturityDate);
                    return (
                      <div key={vault.id} className={`p-4 rounded-2xl border ${dark ? 'bg-[#1f2937] border-white/5' : 'bg-gray-50 border-gray-100'}`}>
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <p className="font-black text-sm">{formatXlm(vault.lockedAmount)} XLM</p>
                            <p className="text-[10px] font-bold text-gray-400 mt-0.5 uppercase tracking-wide">
                              {vault.lockDays}-Day Lock
                            </p>
                          </div>
                          <span className={`text-[10px] font-black px-2 py-1 rounded-md uppercase tracking-wider ${
                            vault.status === "redeemed"
                              ? "bg-blue-500/10 text-blue-400"
                              : vault.status === "liquidated"
                              ? "bg-red-500/10 text-red-400"
                              : matured
                              ? "bg-emerald-500/10 text-emerald-400"
                              : "bg-amber-500/10 text-amber-400"
                          }`}>
                            {vault.status === "locked" && matured ? "Matured" : vault.status}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs font-semibold text-gray-400">
                          <span>📅 Maturity: {vault.maturityDate}</span>
                          {vault.status === "locked" && matured && (
                            <button
                              onClick={() => handleRedeem(vault)}
                              disabled={busy}
                              className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold active:scale-95 transition-transform"
                            >
                              Redeem
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </UserLayout>
  );
};

export default UserVault;