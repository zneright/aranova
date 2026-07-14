import { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import UserLayout from "../../components/layout/UserLayout";
import { useTheme } from "../../contexts/ThemeContext";
import LoadingWorkspace from "../../components/ui/LoadingWorkspace";
import {
  collection, doc, addDoc, setDoc, updateDoc,
  increment, serverTimestamp, query, where, onSnapshot,
} from "firebase/firestore";
import { db } from "../../firebase/config";
import {
  formatXlm, defaultPolicy, type Policy,
  parseTimestamp, dayMs, recalculateAndSyncTrustScore,
} from "../../services/aranovaWorkflow";
import {
  depositPool, releaseCredit, getPoolBalance,
  NETWORK_PASSPHRASE, getLiveStellarBalance,
} from "../../services/sorobanService";
import CryptoJS from "crypto-js";
import { FreighterModule } from "@creit.tech/stellar-wallets-kit/modules/freighter";

const getSigningHandler = async (userData: any, networkPassphrase: string) => {
  if (userData.encryptedSecretKey) {
    const pin = prompt("Enter your 4-digit PIN to authorize:");
    if (!pin) throw new Error("Cancelled.");
    const bytes = CryptoJS.AES.decrypt(userData.encryptedSecretKey, pin);
    const secret = bytes.toString(CryptoJS.enc.Utf8);
    if (!secret || !secret.startsWith("S")) throw new Error("Invalid PIN.");
    return { signWithSecret: secret };
  }
  const walletId = userData.walletType?.toLowerCase() || "freighter";
  let module: any;
  if (walletId.includes("freighter")) {
    module = new FreighterModule();
  } else {
    module = new FreighterModule();
  }

  let isAvailable = false;
  const win = window as any;
  if (win.freighterApi || win.stellar?.isFreighter) {
    isAvailable = true;
  } else {
    try {
      isAvailable = await module.isAvailable();
    } catch (e) {
      isAvailable = false;
    }
  }

  if (!isAvailable) throw new Error("Stellar Freighter Wallet is not available or disabled.");

  return {
    signWithWallet: async (xdr: string) =>
      await module.signTransaction(xdr, { networkPassphrase, publicKey: userData.publicKey }),
  };
};

// ── Trust Score Bar ──────────────────────────────────────────────────────────
const TrustBar = ({ score }: { score: number }) => {
  const color = score >= 80 ? "#10B981" : score <= 30 ? "#EF4444" : "#F59E0B";
  const percent = score > 0 && score % 100 === 0 ? 100 : score % 100;
  return (
    <div className="h-1 w-full rounded-full bg-white/5 overflow-hidden mt-2">
      <div style={{ width: `${percent}%`, background: color, height: "100%", borderRadius: 99, transition: "width 0.7s cubic-bezier(0.16,1,0.3,1)" }} />
    </div>
  );
};

// ── Tab Button ───────────────────────────────────────────────────────────────
const Tab = ({ label, active, onClick, badge, dark }: { label: string; active: boolean; onClick: () => void; badge?: number; dark: boolean }) => (
  <button
    onClick={onClick}
    className={`relative px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
      active
        ? "bg-[#10B981] text-white shadow-sm"
        : dark ? "text-gray-500 hover:text-gray-300 hover:bg-white/5" : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
    }`}
  >
    {label}
    {badge !== undefined && badge > 0 && (
      <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-black ${active ? "bg-white/20 text-white" : "bg-amber-500/20 text-amber-400"}`}>
        {badge}
      </span>
    )}
  </button>
);

// ── Main ─────────────────────────────────────────────────────────────────────
const CoopPool = () => {
  const { userData, loading: authLoading } = useAuth();
  const { dark } = useTheme();

  const [activeTab, setActiveTab] = useState<"requests" | "drivers" | "policy">("requests");
  const [depositAmount, setDepositAmount] = useState("0");
  const [requests, setRequests] = useState<any[]>([]);
  const [coopDrivers, setCoopDrivers] = useState<any[]>([]);
  const [policy, setPolicy] = useState<Policy>(defaultPolicy);
  const [stats, setStats] = useState<any>({ poolBalance: 0, totalDeposited: 0, totalReleased: 0, totalRepaid: 0 });
  const [busy, setBusy] = useState(false);
  const [driverBalances, setDriverBalances] = useState<{ [uid: string]: string }>({});

  useEffect(() => {
    coopDrivers.forEach((d) => {
      if (d.publicKey && driverBalances[d.uid] === undefined) {
        getLiveStellarBalance(d.publicKey).then((b) => setDriverBalances((p) => ({ ...p, [d.uid]: b }))).catch(() => undefined);
      }
    });
  }, [coopDrivers, driverBalances]);

  useEffect(() => {
    if (authLoading || !userData?.uid) return;
    const u1 = onSnapshot(doc(db, "coop_stats", userData.uid), (s) => { if (s.exists()) setStats((p: any) => ({ ...p, ...s.data() })); }, console.warn);
    if (userData?.publicKey) {
      getPoolBalance(userData.publicKey).then((b) => { if (b !== -1n) setStats((p: any) => ({ ...p, poolBalance: Number(b) / 1e7 })); }).catch(console.warn);
    }
    const u2 = onSnapshot(query(collection(db, "fuel_requests"), where("coopId", "==", userData.uid), where("type", "==", "fuel_credit")), (s) => setRequests(s.docs.map((d) => ({ id: d.id, ...d.data() }))), console.warn);
    // Fuel Credit policy is SEPARATE from Admin Loan policy — use its own config doc
    const u3 = onSnapshot(doc(db, "app_config", "fuel_credit_policy"), (s) => { if (s.exists()) setPolicy({ ...defaultPolicy, ...s.data() as any }); }, console.warn);
    const u4 = onSnapshot(query(collection(db, "users"), where("role", "==", "driver"), where("cooperativeId", "==", userData.uid)), (s) => setCoopDrivers(s.docs.map((d) => ({ id: d.id, ...d.data() }))), console.warn);
    return () => { u1(); u2(); u3(); u4(); };
  }, [authLoading, userData?.uid, userData?.publicKey]);

  if (authLoading || !userData) return <LoadingWorkspace message="Loading Pool…" />;

  const handleDeposit = async () => {
    const v = Number(depositAmount);
    if (!v || v <= 0) return alert("Enter a valid amount.");
    setBusy(true);
    try {
      const h = await getSigningHandler(userData, NETWORK_PASSPHRASE);
      const tx = await depositPool(userData.publicKey, BigInt(Math.floor(v * 1e7)), h);
      await setDoc(doc(db, "coop_stats", userData.uid), { poolBalance: increment(v), totalDeposited: increment(v) }, { merge: true });
      await addDoc(collection(db, "transactions"), { type: "pool_deposit", from: userData.uid, to: userData.uid, amount: v, status: "completed", blockchainTxHash: tx, createdAt: serverTimestamp() });
      setDepositAmount("0");
      alert(`Deposited!\nTx: ${tx}`);
    } catch (e: any) { alert(e.message || e); }
    finally { setBusy(false); }
  };

  const handleApprove = async (req: any) => {
    setBusy(true);
    try {
      const amt = Number(req.approvedAmount || req.amount);
      const h = await getSigningHandler(userData, NETWORK_PASSPHRASE);
      const tx = await releaseCredit(userData.publicKey, req.driverPublicKey, BigInt(Math.floor(amt * 1e7)), BigInt(Number(req.interestRate || 3) * 100), 1, h);
      await updateDoc(doc(db, "fuel_requests", req.id), { status: "active", approvedAt: serverTimestamp(), blockchainTxHash: tx });
      await recalculateAndSyncTrustScore(req.driverId);
      await setDoc(doc(db, "coop_stats", userData.uid), { poolBalance: increment(-amt), totalReleased: increment(amt), outstanding: increment(amt) }, { merge: true });
      // Log as type:"fuel_credit" so drivers can see this in UserFuelCredit transaction history
      await addDoc(collection(db, "transactions"), { type: "fuel_credit", from: userData.uid, to: req.driverId, driverPublicKey: req.driverPublicKey, coopId: userData.uid, amount: amt, status: "completed", blockchainTxHash: tx, createdAt: serverTimestamp() });
      alert(`Credit released!\nTx: ${tx}`);
    } catch (e: any) { alert(e.message || e); }
    finally { setBusy(false); }
  };

  const savePolicy = async () => {
    // Fuel Credit policy saves to its OWN config doc — never overwrites Admin Loan policy
    await setDoc(doc(db, "app_config", "fuel_credit_policy"), policy, { merge: true });
    alert("Fuel Credit policy saved.");
  };

  // Coop allocates fuel credit to a specific driver (creates the fuel_credit document)
  const handleAllocate = async (driver: any, amount: number) => {
    if (!amount || amount <= 0) return alert("Enter a valid allocation amount.");
    if (amount > Number(stats.poolBalance || 0)) return alert("Insufficient pool balance.");
    setBusy(true);
    try {
      await addDoc(collection(db, "fuel_requests"), {
        driverId: driver.uid,
        driverName: driver.displayName,
        driverPublicKey: driver.publicKey,
        coopId: userData.uid,
        type: "fuel_credit",       // ← Cooperative credit — NOT an admin loan
        amount,
        approvedAmount: amount,
        status: "pending",
        durationDays: 1,           // Fuel credits are daily by design
        createdAt: serverTimestamp(),
      });
      alert(`Fuel credit of ${amount} XLM queued for ${driver.displayName}. Approve it in the Applications tab.`);
    } catch (e: any) { alert(e.message || e); }
    finally { setBusy(false); }
  };

  const pending = requests.filter((r) => r.status === "pending");
  const overdue = requests.filter((r) => {
    const t = parseTimestamp(r.createdAt);
    return r.status === "active" && t && Date.now() - t.getTime() > Number(r.durationDays || policy.durationValue) * dayMs;
  });
  const outstanding = requests.filter((r) => r.status === "active").reduce((s, r) => s + Number(r.approvedAmount || r.amount || 0), 0);
  const vaultTotal = Number(userData.vaultBalance || 0) + coopDrivers.reduce((s, d) => s + Number(d.vaultBalance || 0), 0);

  const card = dark ? "bg-[#0A1128] border-white/5" : "bg-white border-[#D5E2EC]";
  const muted = dark ? "text-gray-500" : "text-gray-400";
  const heading = dark ? "text-white" : "text-gray-900";
  const input = `w-full px-4 py-3 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#10B981]/40 transition-all ${dark ? "bg-white/5 border-white/8 text-white placeholder-gray-400" : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-500"}`;
  const divider = dark ? "divide-white/5" : "divide-gray-100";

  return (
    <UserLayout activeTab="coop-pool" userData={userData}>
      <div className="max-w-4xl mx-auto space-y-6 animate-slide-up">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#10B981]/10 border border-[#10B981]/20 mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse inline-block" />
              <span className="text-[10px] font-black uppercase tracking-widest text-[#10B981]">🏢 Cooperative Treasury</span>
            </div>
            <h1 className={`text-2xl font-black tracking-tight ${heading}`}>Pool Dashboard</h1>
            <p className={`text-xs mt-0.5 ${muted}`}>DeFi credit management for your driver fleet</p>
          </div>
        </div>

        {/* ── Single Hero Stats Strip ───────────────────────────────────────── */}
        <div className={`rounded-[28px] border p-6 ${card}`}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 divide-x-0 sm:divide-x ${dark ? 'divide-white/5' : 'divide-gray-100'}">

            {/* Pool Balance — hero */}
            <div className="sm:col-span-1">
              <p className={`text-[10px] font-black uppercase tracking-widest ${muted}`}>Available Pool</p>
              <p className="text-3xl font-black text-[#10B981] mt-1 leading-none">
                {formatXlm(Number(stats.poolBalance || 0))}
              </p>
              <p className={`text-[10px] mt-1 ${muted}`}>XLM liquidity</p>
            </div>

            <div>
              <p className={`text-[10px] font-black uppercase tracking-widest ${muted}`}>Outstanding</p>
              <p className={`text-xl font-black mt-1 leading-none ${dark ? "text-white" : "text-gray-900"}`}>
                {formatXlm(outstanding)}
              </p>
              <p className={`text-[10px] mt-1 ${muted}`}>XLM active credit</p>
            </div>

            <div>
              <p className={`text-[10px] font-black uppercase tracking-widest ${muted}`}>Vault Reserve</p>
              <p className={`text-xl font-black mt-1 leading-none ${dark ? "text-white" : "text-gray-900"}`}>
                {formatXlm(vaultTotal)}
              </p>
              <p className={`text-[10px] mt-1 ${muted}`}>XLM locked savings</p>
            </div>

            <div>
              <p className={`text-[10px] font-black uppercase tracking-widest ${muted}`}>Overdue</p>
              <p className={`text-xl font-black mt-1 leading-none ${overdue.length > 0 ? "text-red-500" : dark ? "text-gray-600" : "text-gray-300"}`}>
                {overdue.length}
              </p>
              <p className={`text-[10px] mt-1 ${muted}`}>
                {overdue.length > 0 ? "lines past due" : "all compliant"}
              </p>
            </div>
          </div>

          {/* Quick deposit inline */}
          <div className={`mt-5 pt-5 border-t flex flex-col sm:flex-row items-end gap-3 ${dark ? "border-white/5" : "border-gray-100"}`}>
            <div className="flex-1 w-full">
              <label className={`block text-[9px] font-black uppercase tracking-widest mb-1.5 ${muted}`}>Add Liquidity (XLM)</label>
              <input value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} type="number" placeholder="Amount in XLM" className={input} />
            </div>
            <button onClick={handleDeposit} disabled={busy} className="shrink-0 px-5 py-3 rounded-xl font-black text-xs uppercase tracking-wider bg-[#10B981] text-white hover:bg-[#0E9F6E] disabled:opacity-50 active:scale-95 transition-all">
              {busy ? "…" : "Deposit"}
            </button>
          </div>
        </div>

        {/* ── Tabbed Right Panel ────────────────────────────────────────────── */}
        <div className={`rounded-[28px] border ${card} overflow-hidden`}>
          {/* Tab strip */}
          <div className={`flex items-center gap-1 p-3 border-b ${dark ? "border-white/5" : "border-gray-100"}`}>
            <Tab dark={dark} label="Applications" active={activeTab === "requests"} onClick={() => setActiveTab("requests")} badge={pending.length} />
            <Tab dark={dark} label="Fleet" active={activeTab === "drivers"} onClick={() => setActiveTab("drivers")} badge={coopDrivers.length} />
            <Tab dark={dark} label="Policy" active={activeTab === "policy"} onClick={() => setActiveTab("policy")} />
            {overdue.length > 0 && (
              <span className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-black uppercase">
                ⚠ {overdue.length} Overdue
              </span>
            )}
          </div>

          {/* ── Tab: Credit Applications ─────────────────────────────────── */}
          {activeTab === "requests" && (
            <div className="p-6">
              {/* Overdue alert strip — only when relevant */}
              {overdue.length > 0 && (
                <div className={`mb-5 px-4 py-3 rounded-[16px] border flex items-center gap-3 ${dark ? "bg-red-950/20 border-red-900/30" : "bg-red-50 border-red-100"}`}>
                  <span className="text-lg">⚠️</span>
                  <div>
                    <p className="text-xs font-black text-red-500">{overdue.length} overdue credit line{overdue.length !== 1 ? "s" : ""}</p>
                    <p className={`text-[10px] mt-0.5 ${muted}`}>Drivers past repayment deadline</p>
                  </div>
                  <div className="ml-auto flex flex-col gap-0.5">
                    {overdue.map((r) => (
                      <span key={r.id} className="text-[10px] font-bold text-red-400">{r.driverName} — {formatXlm(Number(r.approvedAmount || r.amount))} XLM</span>
                    ))}
                  </div>
                </div>
              )}

              {pending.length === 0 ? (
                <div className={`text-center py-12 ${muted}`}>
                  <p className="text-3xl mb-3">✓</p>
                  <p className="text-sm font-bold">No pending applications</p>
                  <p className="text-xs mt-1">Driver credit requests will appear here</p>
                </div>
              ) : (
                <div className={`divide-y ${divider}`}>
                  {pending.map((req) => (
                    <div key={req.id} className="flex items-center justify-between py-4 gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 shrink-0 rounded-full bg-[#FF6B00]/10 border border-[#FF6B00]/20 flex items-center justify-center text-sm font-black text-[#FF8833]">
                          {(req.driverName || "D").charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className={`font-black text-sm truncate ${heading}`}>{req.driverName}</p>
                          <p className={`text-[10px] mt-0.5 ${muted}`}>
                            <span className="text-[#34D399] font-bold">{formatXlm(Number(req.amount))} XLM</span>
                            {" · "}{req.durationValue} {req.durationUnit}
                            {" · "}{req.interestRate || 3}% p.a.
                          </p>
                        </div>
                      </div>
                      <button onClick={() => handleApprove(req)} disabled={busy} className="shrink-0 px-4 py-2 rounded-xl font-black text-xs uppercase bg-[#10B981] text-white hover:bg-[#0E9F6E] disabled:opacity-50 active:scale-95 transition-all">
                        Release
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "drivers" && (
            <div className="p-6">
              {coopDrivers.length === 0 ? (
                <div className={`text-center py-12 ${muted}`}>
                  <p className="text-3xl mb-3">🛺</p>
                  <p className="text-sm font-bold">No drivers registered</p>
                  <p className="text-xs mt-1">Drivers who join your cooperative will appear here</p>
                </div>
              ) : (
                <div className={`divide-y ${divider}`}>
                  {coopDrivers.map((d) => {
                    const score = d.trustScore || 0;
                    const bal = driverBalances[d.uid] !== undefined
                      ? `${formatXlm(Number(driverBalances[d.uid]))} XLM`
                      : `${formatXlm(Number(d.walletBalance || 0))} XLM`;
                    const scoreColor = score >= 80 ? "text-[#10B981]" : score <= 30 ? "text-red-500" : "text-amber-500";
                    return (
                      <div key={d.uid} className="py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 shrink-0 rounded-full bg-[#FF6B00]/10 border border-[#FF6B00]/20 flex items-center justify-center font-black text-[#FF8833]">
                              {(d.displayName || "D").charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className={`font-black text-sm truncate ${heading}`}>{d.displayName}</p>
                              <p className={`text-[10px] font-mono truncate mt-0.5 ${muted}`}>
                                {d.publicKey?.slice(0, 8)}…{d.publicKey?.slice(-8)}
                              </p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`font-black text-sm ${scoreColor}`}>{score} pts</p>
                            <p className={`text-[10px] ${muted}`}>⚡ {bal}</p>
                          </div>
                        </div>
                        <TrustBar score={score} />
                        {/* ⛽ Fuel Credit Allocation — Coop-only action, creates a fuel_credit doc */}
                        <div className="mt-3 flex items-center gap-2">
                          <input
                            type="number"
                            placeholder="XLM to allocate"
                            min="0"
                            className={`flex-1 px-3 py-2 rounded-xl border text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#10B981] ${dark ? 'bg-white/5 border-white/10 text-white placeholder-gray-400' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-500'}`}
                            id={`alloc-${d.uid}`}
                          />
                          <button
                            disabled={busy}
                            onClick={() => {
                              const el = document.getElementById(`alloc-${d.uid}`) as HTMLInputElement;
                              const v = Number(el?.value || 0);
                              handleAllocate(d, v);
                              if (el) el.value = "";
                            }}
                            className="shrink-0 px-3 py-2 rounded-xl font-black text-[10px] uppercase tracking-wider bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20 hover:bg-[#10B981]/20 active:scale-95 transition-all disabled:opacity-50"
                          >
                            ⛽ Allocate
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === "policy" && (
            <div className="p-6 space-y-5 max-w-sm">
              <div>
                <p className={`text-[10px] font-black uppercase tracking-widest mb-0.5 text-[#10B981]`}>⛽ Fuel Credit Policy</p>
                <p className={`text-[9px] ${muted} mb-4`}>This configures Cooperative Fuel Credit only. It has no effect on Admin Microloans.</p>
              </div>
              <div>
                <p className={`text-[9px] font-black uppercase tracking-widest mb-1.5 ${muted}`}>Max Daily Allocation (XLM)</p>
                <input value={policy.maxApprovedAmount} onChange={(e) => setPolicy({ ...policy, maxApprovedAmount: Number(e.target.value) })} type="number" className={input} />
              </div>
              <div>
                <p className={`text-[9px] font-black uppercase tracking-widest mb-1.5 ${muted}`}>Interest Rate (%)</p>
                <input value={policy.interestRate} onChange={(e) => setPolicy({ ...policy, interestRate: Number(e.target.value) })} type="number" className={input} />
              </div>
              <button onClick={savePolicy} className={`w-full py-3 rounded-xl font-black text-xs uppercase tracking-wider border transition-all active:scale-95 ${dark ? "border-[#10B981]/25 text-[#34D399] hover:bg-[#10B981]/5" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}>
                Save Fuel Credit Policy
              </button>
            </div>
          )}
        </div>

      </div>
    </UserLayout>
  );
};

export default CoopPool;
