import React, { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";
import UserLayout from "../../components/layout/UserLayout";
import LoadingWorkspace from "../../components/ui/LoadingWorkspace";
import { collection, query, where, onSnapshot, orderBy, limit, addDoc, serverTimestamp, doc, setDoc, updateDoc, increment } from "firebase/firestore";
import { db } from "../../firebase/config";
import { formatXlm } from "../../services/aranovaWorkflow";

/**
 * UserFuelCredit — Cooperative Fuel Credit view (Driver, read-only)
 *
 * Data source: fuel_requests (type: "fuel_credit") — the actual documents
 *   created by CoopPool.tsx when the coop allocates credit to this driver.
 * Disbursement history: transactions (type: "fuel_credit") — written by
 *   CoopPool.handleApprove() when the coop releases the credit on-chain.
 *
 * NO connection to Admin Loan system whatsoever.
 */
const UserFuelCredit: React.FC = () => {
  const { userData: contextUserData, loading: authLoading, currentUser } = useAuth();
  const userData = (() => {
    if (contextUserData) return contextUserData;
    // Use per-UID namespaced cache key to prevent cross-account leakage
    if (currentUser) {
      const cached = localStorage.getItem(`aranova_auth_profile_${currentUser.uid}`);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.uid === currentUser.uid) return parsed;
        } catch (e) {}
      }
    }
    return null;
  })();
  const { dark } = useTheme();

  // Active/pending fuel_credit allocations from the coop
  const [allocations, setAllocations] = useState<any[]>([]);
  // Disbursed transaction history (after coop approved on-chain)
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [coopProfile, setCoopProfile] = useState<any>(null);
  const [coopStats, setCoopStats] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  // NOTE: handleAutoAllocate REMOVED — it allowed drivers to self-approve credit with no
  // cooperative approval and no on-chain transaction. This was a critical security vulnerability.
  // Fuel credit is now requested via handleRequestCredit and approved by a cooperative manager
  // in the CoopPool page (which calls releaseCredit() on-chain).

  const [requestAmount, setRequestAmount] = useState<string>("");
  const [requestError, setRequestError] = useState<string>("");
  const [requestSuccess, setRequestSuccess] = useState<string>("");

  const handleRequestCredit = async () => {
    setRequestError("");
    setRequestSuccess("");

    const coopId = userData?.cooperativeId;
    if (!coopId) {
      setRequestError("You are not linked to a cooperative. Contact your cooperative manager.");
      return;
    }

    const value = parseFloat(requestAmount);
    if (isNaN(value) || value <= 0) {
      setRequestError("Enter a valid amount greater than 0.");
      return;
    }
    if (value > maxDisbursable) {
      setRequestError(`Cannot exceed available allocation: ${formatXlm(maxDisbursable)} XLM`);
      return;
    }
    if (value > coopPoolBalance) {
      setRequestError("The cooperative pool does not have sufficient funds.");
      return;
    }

    // Check for existing pending request
    const hasPending = allocations.some(a => a.status === "pending");
    if (hasPending) {
      setRequestError("You already have a pending fuel credit request. Wait for your cooperative manager to approve it.");
      return;
    }

    setBusy(true);
    try {
      // Create a PENDING request — must be approved by cooperative manager in CoopPool
      await addDoc(collection(db, "fuel_requests"), {
        driverId: userData.uid,
        driverName: userData.displayName || "Unknown Driver",
        driverPublicKey: userData.publicKey || "",
        coopId: coopId,
        type: "fuel_credit",
        amount: value,
        approvedAmount: null,
        status: "pending",  // Must be set to 'active' by cooperative manager in CoopPool
        createdAt: serverTimestamp(),
        disbursedAt: null,
        source: "driver_request",
      });
      setRequestSuccess(`Fuel credit request for ${formatXlm(value)} XLM submitted. Your cooperative manager will review and approve it.`);
      setRequestAmount("");
    } catch (err: any) {
      setRequestError("Error submitting request: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!userData?.uid) return;

    // Real-time listener for fuel_credit allocations (pending + active)
    const allocQ = query(
      collection(db, "fuel_requests"),
      where("driverId", "==", userData.uid),
      where("type", "==", "fuel_credit"),
      where("status", "in", ["pending", "active"]),
      orderBy("createdAt", "desc"),
      limit(10)
    );
    const unsubAlloc = onSnapshot(
      allocQ,
      (snap) => setAllocations(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      (err) => console.warn("Fuel credit allocation snapshot error:", err)
    );

    // One-time fetch for transaction history (released on-chain credits)
    const histQ = query(
      collection(db, "transactions"),
      where("to", "==", userData.uid),
      where("type", "==", "fuel_credit"),
      orderBy("createdAt", "desc"),
      limit(20)
    );
    const unsubHistory = onSnapshot(
      histQ,
      (snap) => {
        setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.warn("Fuel credit history snapshot error:", err);
        setLoading(false);
      }
    );

    const coopId = userData.cooperativeId || "";
    let unsubCoopProfile = () => {};
    let unsubCoopStats = () => {};

    if (coopId) {
      unsubCoopProfile = onSnapshot(doc(db, "users", coopId), (snap) => {
        if (snap.exists()) setCoopProfile(snap.data());
      });
      unsubCoopStats = onSnapshot(doc(db, "coop_stats", coopId), (snap) => {
        if (snap.exists()) setCoopStats(snap.data());
      });
    }

    return () => {
      unsubAlloc();
      unsubHistory();
      unsubCoopProfile();
      unsubCoopStats();
    };
  }, [userData?.uid, userData?.cooperativeId]);

  if (authLoading) return <LoadingWorkspace />;
  if (!userData) return <div className="p-8 text-center text-red-500">Authentication Error</div>;

  const totalActive = allocations
    .filter(a => a.status === "active")
    .reduce((sum, a) => sum + Number(a.approvedAmount || a.amount || 0), 0);

  // Apply a reasonable maximum cap to prevent unlimited credit from high trust scores
  const MAX_CREDIT_LIMIT = 500; // XLM — configurable
  const creditLimit = Math.min(MAX_CREDIT_LIMIT, Number(userData.trustScore || 0) * 2);
  const remainingLimit = Math.max(0, creditLimit - totalActive);



  const coopPoolBalance = Number(coopStats?.poolBalance || 0);
  const maxDisbursable = Math.min(remainingLimit, coopPoolBalance);

  const card = dark ? "bg-[#141620] border border-white/5" : "bg-white border border-gray-100";
  const muted = dark ? "text-gray-500" : "text-gray-400";

  return (
    <UserLayout userData={userData} activeTab="fuel-credit">
      <div className="max-w-xl mx-auto space-y-6 pb-24 animate-slide-up">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.history.back()}
            className={`p-2 rounded-full text-lg ${dark ? 'bg-white/10 text-white' : 'bg-black/5 text-black'}`}
          >
            ←
          </button>
          <div>
            <h1 className={`text-2xl font-black ${dark ? 'text-white' : 'text-gray-900'}`}>⛽ Fuel Credit</h1>
            <p className={`text-[10px] font-semibold ${muted}`}>Auto-allocated from your cooperative pool</p>
          </div>
        </div>

        {/* Cooperative Pool Details Card */}
        <div className={`p-6 rounded-[28px] shadow-sm ${card}`}>
          <div className="flex justify-between items-center mb-4">
            <span className="text-[10px] font-black uppercase tracking-wider text-[#10B981] bg-[#10B981]/10 px-3 py-1 rounded-full">
              🏢 Linked Cooperative
            </span>
            <span className={`text-sm font-bold ${dark ? 'text-gray-200' : 'text-gray-800'}`}>
              {coopProfile?.displayName || coopProfile?.coopName || "Connecting..."}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
            <div>
              <p className={`text-[9px] font-black uppercase tracking-wider ${muted}`}>Coop Pool Balance</p>
              <h2 className={`text-2xl font-black mt-1 ${dark ? 'text-white' : 'text-gray-900'}`}>
                {formatXlm(coopPoolBalance)} <span className="text-sm opacity-50 font-bold">XLM</span>
              </h2>
            </div>
            <div>
              <p className={`text-[9px] font-black uppercase tracking-wider ${muted}`}>Active Credit Limit</p>
              <h2 className="text-2xl font-black text-[#10B981] mt-1">
                {formatXlm(creditLimit)} <span className="text-sm opacity-50 font-bold">XLM</span>
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 mt-4 border-t border-white/5">
            <div>
              <p className={`text-[9px] font-black uppercase tracking-wider ${muted}`}>Used Credit</p>
              <h2 className={`text-xl font-bold mt-1 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
                {formatXlm(totalActive)} <span className="text-xs opacity-50">XLM</span>
              </h2>
            </div>
            <div>
              <p className={`text-[9px] font-black uppercase tracking-wider ${muted}`}>Remaining Allocation Ceiling</p>
              <h2 className="text-xl font-bold text-amber-500 mt-1">
                {formatXlm(remainingLimit)} <span className="text-xs opacity-50">XLM</span>
              </h2>
            </div>
          </div>
        </div>

        {/* Request Fuel Credit — requires cooperative manager approval */}
        <div className={`p-6 rounded-[28px] border ${dark ? 'border-[#10B981]/20 bg-[#10B981]/5' : 'border-emerald-200 bg-emerald-50/50'}`}>
          <h3 className={`text-base font-black mb-1.5 ${dark ? 'text-white' : 'text-gray-900'}`}>
            ⛽ Request Fuel Credit
          </h3>
          <p className={`text-xs mb-4 max-w-sm leading-relaxed ${muted}`}>
            Submit a fuel credit request to your cooperative manager. Once approved on-chain, funds will be credited to your wallet.
          </p>

          {requestError && (
            <div className="mb-3 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">
              {requestError}
            </div>
          )}
          {requestSuccess && (
            <div className="mb-3 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
              {requestSuccess}
            </div>
          )}

          <div className="flex gap-3">
            <input
              type="number"
              min="0.01"
              max={maxDisbursable}
              step="0.01"
              value={requestAmount}
              onChange={(e) => setRequestAmount(e.target.value)}
              placeholder={`Max: ${formatXlm(maxDisbursable)} XLM`}
              aria-label="Fuel credit request amount in XLM"
              className={`flex-1 px-4 py-3 rounded-xl text-sm font-semibold border outline-none ${
                dark
                  ? 'bg-white/5 border-white/10 text-white placeholder-gray-600'
                  : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'
              }`}
            />
            <button
              onClick={handleRequestCredit}
              disabled={busy || maxDisbursable <= 0 || !userData?.cooperativeId}
              aria-label="Submit fuel credit request"
              className={`px-5 py-3 rounded-xl text-sm font-black text-white transition-all ${
                busy || maxDisbursable <= 0 || !userData?.cooperativeId
                  ? 'bg-[#10B981]/20 text-[#10B981]/50 cursor-not-allowed'
                  : 'bg-[#10B981] hover:bg-emerald-600 active:scale-[0.98]'
              }`}
            >
              {busy ? "Sending..." : "Request"}
            </button>
          </div>

          {!userData?.cooperativeId && (
            <p className="mt-3 text-xs text-amber-500 font-semibold">
              ⚠️ You are not linked to a cooperative. Ask your cooperative manager to approve your membership.
            </p>
          )}
        </div>

        {/* How it works */}
        <div className={`p-5 rounded-[24px] border ${dark ? 'border-white/5 bg-transparent' : 'border-gray-100 bg-transparent'}`}>
          <p className={`text-[10px] font-black uppercase tracking-widest text-[#10B981] mb-2`}>How Fuel Credit Works</p>
          <ul className={`text-xs leading-relaxed space-y-1 font-semibold ${muted}`}>
            <li>• Submit a fuel credit request — your cooperative manager reviews and approves it</li>
            <li>• On approval, the cooperative releases credit on-chain via a smart contract transaction</li>
            <li>• Your credit limit is based on your Trust Score (Trust Score × 2, max {MAX_CREDIT_LIMIT} XLM)</li>
            <li>• Repay credit on time to maintain a high Trust Score and increase future limits</li>
          </ul>
        </div>

        {/* Active Allocations */}
        {allocations.length > 0 && (
          <div>
            <h3 className={`text-sm font-black mb-3 ${dark ? 'text-white' : 'text-gray-900'}`}>Current Allocations</h3>
            <div className={`rounded-[24px] overflow-hidden ${card}`}>
              {allocations.map((a, i) => (
                <div key={a.id} className={`p-4 flex justify-between items-center ${i !== allocations.length - 1 ? (dark ? 'border-b border-white/5' : 'border-b border-gray-100') : ''}`}>
                  <div>
                    <div className={`font-bold text-sm ${dark ? 'text-white' : 'text-gray-900'}`}>
                      {formatXlm(Number(a.approvedAmount || a.amount))} XLM
                    </div>
                    <div className={`text-[10px] mt-0.5 ${muted}`}>
                      {a.createdAt?.toDate?.()?.toLocaleDateString() || "Recently allocated"}
                    </div>
                  </div>
                  <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full ${
                    a.status === "active"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-amber-500/10 text-amber-400 animate-pulse"
                  }`}>
                    {a.status === "active" ? "✓ Released" : "⏳ Pending"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Disbursement History */}
        <div>
          <h3 className={`text-sm font-black mb-3 ${dark ? 'text-white' : 'text-gray-900'}`}>Disbursement History</h3>
          {loading ? (
            <div className="text-center p-8 opacity-50 font-bold text-sm">Loading ledger...</div>
          ) : history.length === 0 ? (
            <div className={`p-8 text-center rounded-[24px] ${dark ? 'bg-[#0E0F14]' : 'bg-gray-50'}`}>
              <div className="text-3xl mb-2">⛽</div>
              <p className={`text-xs font-semibold ${muted}`}>No fuel credit disbursements yet.</p>
              <p className={`text-[10px] mt-1 ${muted}`}>Your coop manager will allocate credit from the Fleet tab.</p>
            </div>
          ) : (
            <div className={`rounded-[24px] overflow-hidden ${card}`}>
              {history.map((tx, i) => (
                <div key={tx.id} className={`p-4 flex justify-between items-center ${i !== history.length - 1 ? (dark ? 'border-b border-white/5' : 'border-b border-gray-100') : ''}`}>
                  <div>
                    <div className={`font-bold text-sm ${dark ? 'text-white' : 'text-gray-900'}`}>Cooperative Disbursement</div>
                    <div className={`text-[10px] mt-0.5 ${muted}`}>
                      {tx.createdAt?.toDate?.()?.toLocaleDateString() || "Recent"}
                      {tx.blockchainTxHash && <span className="ml-2 font-mono opacity-60">{tx.blockchainTxHash.slice(0, 8)}…</span>}
                    </div>
                  </div>
                  <div className="font-black text-[#10B981]">+{formatXlm(tx.amount)} XLM</div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </UserLayout>
  );
};

export default UserFuelCredit;
