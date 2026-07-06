import { useState, useEffect } from "react";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  serverTimestamp,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "../../firebase/config";
import {
  formatXlm,
  defaultPolicy,
  type Policy,
  recalculateAndSyncTrustScore,
} from "../../services/aranovaWorkflow";
import {
  repayCredit,
  NETWORK_PASSPHRASE,
} from "../../services/sorobanService";
import CryptoJS from "crypto-js";
import { FreighterModule } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { xBullModule } from "@creit.tech/stellar-wallets-kit/modules/xbull";
import { LobstrModule } from "@creit.tech/stellar-wallets-kit/modules/lobstr";

const getSigningHandler = async (userData: any, networkPassphrase: string) => {
  if (userData.encryptedSecretKey) {
    const pin = prompt("Enter your 4-digit PIN to authorize this contract transaction:");
    if (!pin) throw new Error("Transaction signature cancelled.");
    try {
      const bytes = CryptoJS.AES.decrypt(userData.encryptedSecretKey, pin);
      const secret = bytes.toString(CryptoJS.enc.Utf8);
      if (!secret || !secret.startsWith("S")) throw new Error("Invalid PIN or corrupted key.");
      return { signWithSecret: secret };
    } catch (err) {
      alert("Failed to decrypt key. Please check your PIN.");
      throw err;
    }
  } else {
    const walletId = userData.network?.toLowerCase() || "freighter";
    let module: any;
    if (walletId.includes("xbull")) module = new xBullModule();
    else if (walletId.includes("lobstr")) module = new LobstrModule();
    else module = new FreighterModule();
    const isAvailable = await module.isAvailable();
    if (!isAvailable) throw new Error(`${walletId.toUpperCase()} wallet is not available/detected.`);
    return {
      signWithWallet: async (xdr: string) =>
        await module.signTransaction(xdr, { networkPassphrase, publicKey: userData.publicKey }),
    };
  }
};

interface DriverLoanSectionProps {
  userData: any;
  dark: boolean;
}

const DriverLoanSection: React.FC<DriverLoanSectionProps> = ({ userData, dark }) => {
  const [policy, setPolicy] = useState<Policy>(defaultPolicy);
  const [requestedAmount, setRequestedAmount] = useState("0");
  const [loans, setLoans] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  // Sync policy
  useEffect(() => {
    const policyUnsub = onSnapshot(
      doc(db, "app_config", "policy"),
      (snap) => { if (snap.exists()) setPolicy({ ...defaultPolicy, ...(snap.data() as any) }); },
      (err) => console.warn("Policy snapshot error:", err)
    );
    return () => policyUnsub();
  }, []);

  // Sync driver's LOANS only (type === "loan") with indexed query for fast load
  useEffect(() => {
    if (!userData?.uid) return;
    const loanQuery = query(
      collection(db, "fuel_requests"),
      where("driverId", "==", userData.uid),
      where("type", "==", "loan"),
      where("status", "in", ["pending", "approved", "awaiting_disbursal", "active"]),
      orderBy("createdAt", "desc"),
      limit(20)
    );
    const unsub = onSnapshot(
      loanQuery,
      (snapshot) => setLoans(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))),
      (err) => console.warn("Driver loan snapshot error:", err)
    );
    return unsub;
  }, [userData?.uid]);

  if (!userData) return null;

  const creditLimit = policy.maxApprovedAmount
    ? Math.min(Number(policy.maxApprovedAmount), Number(userData.trustScore || 0) * 2)
    : Number(userData.trustScore || 0) * 2;




  const handleRequestLoan = async () => {
    const value = Number(requestedAmount);
    if (!value || value <= 0) return alert("Enter a valid amount.");


    setBusy(true);
    try {
      await addDoc(collection(db, "fuel_requests"), {
        driverId: userData.uid,
        driverName: userData.displayName,
        driverPublicKey: userData.publicKey,
        coopId: "admin",
        type: "loan",
        amount: value,
        approvedAmount: value,
        status: "pending",
        createdAt: serverTimestamp(),
      });
      await recalculateAndSyncTrustScore(userData.uid);
      alert("Microloan request submitted to Admin!");
      setRequestedAmount("0");
    } catch (err: any) {
      alert(`Request failed: ${err.message || err}`);
    } finally {
      setBusy(false);
    }
  };

  const handleAcceptOffer = async (loan: any) => {
    if (!loan) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, "fuel_requests", loan.id), {
        status: "awaiting_disbursal",
        acceptedAt: serverTimestamp(),
        durationDays: Number(loan.durationMonths || 1) * 30,
      });
      alert("Loan offer accepted! Awaiting Admin disbursal to your Stellar wallet.");
    } catch (err: any) {
      alert(`Acceptance failed: ${err.message || err}`);
    } finally {
      setBusy(false);
    }
  };

  const handleRepay = async (loan: any) => {
    if (!loan) return;
    setBusy(true);
    try {
      const handler = await getSigningHandler(userData, NETWORK_PASSPHRASE);
      const txHash = await repayCredit(userData.publicKey, handler);
      // Admin Loans are paid back to the Admin Pool, NOT the cooperative.
      await updateDoc(doc(db, "fuel_requests", loan.id), {
        status: "repaid",
        repaidAt: serverTimestamp(),
        blockchainTxHash: txHash,
      });
      
      await addDoc(collection(db, "transactions"), {
        type: "repayment",
        from: userData.uid,
        to: "ADMIN_POOL",
        amount: Number(loan.amount),
        adminFee: 0.5,
        coopFee: 0,
        status: "completed",
        blockchainTxHash: txHash,
        createdAt: serverTimestamp(),
      });
      await recalculateAndSyncTrustScore(userData.uid);
      alert(`Repayment submitted on-chain!\nTx Hash: ${txHash}`);
    } catch (err: any) {
      alert(`Contract execution failed: ${err.message || err}`);
    } finally {
      setBusy(false);
    }
  };

  const cardStyle = dark ? "bg-[#141620] border-white/5 text-white" : "bg-white border-[#EAE6DF] text-gray-900";

  return (
    <div className="mt-8 pt-8 border-t border-gray-200 dark:border-white/10 space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-6 rounded-[28px] bg-gradient-to-r from-[#FF6B00]/10 via-[#FF8833]/5 to-transparent border border-[#FF6B00]/20">
        <div>
          <h1 className={`text-xl font-black ${dark ? 'text-white' : 'text-gray-900'}`}>Admin Microloans</h1>
          <p className="text-xs text-gray-500 mt-1">Apply for a microloan from the Admin pool, powered by Stellar Smart Contracts.</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
          </span>
          Credit Line Connected
        </div>
      </div>

      {/* Stats Bento */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className={`p-6 rounded-[24px] border shadow-sm flex flex-col justify-between ${cardStyle}`}>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Trust Score</p>
          <h3 className="text-2xl font-black mt-2 text-[#FF8833]">{Number(userData.trustScore || 0)} pts</h3>
          <span className="text-[10px] text-gray-500 mt-4">Updated daily based on compliance</span>
        </div>
        <div className={`p-6 rounded-[24px] border shadow-sm flex flex-col justify-between ${cardStyle}`}>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Loan Limit</p>
          <h3 className="text-2xl font-black mt-2 text-emerald-500">{formatXlm(creditLimit)} XLM</h3>
          <span className="text-[10px] text-gray-500 mt-4">Determined by active trust standing</span>
        </div>
      </div>

      {/* Apply + Status columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Apply Form */}
        <div className={`p-6 rounded-[28px] border shadow-sm space-y-6 ${cardStyle}`}>
          <div>
            <h3 className="text-base font-black">Request Microloan</h3>
            <p className="text-xs text-gray-500 mt-1">Loans are reviewed and disbursed by the Admin</p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-black mb-1.5 uppercase text-gray-400">Amount (XLM)</label>
              <input
                value={requestedAmount}
                onChange={(e) => setRequestedAmount(e.target.value)}
                type="number"
                placeholder="Enter XLM value"
                className={`w-full px-4 py-3 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-[#FF6B00] ${
                  dark ? 'bg-white/5 border-white/10 text-white placeholder-gray-500' : 'bg-gray-50 border-gray-200 text-gray-900'
                }`}
              />
              <p className="text-[10px] text-gray-500 mt-1">Your Trust Score Guideline Limit: <span className="text-emerald-500 font-bold">{formatXlm(creditLimit)} XLM</span> (You can request any amount; the Admin reviews and sets approvals dynamically.)</p>
            </div>
            <button
              onClick={handleRequestLoan}
              disabled={busy}
              className="w-full px-5 py-3.5 rounded-xl font-black text-xs uppercase tracking-wider text-white bg-[#FF6B00] hover:bg-[#E05E00] disabled:opacity-50 active:scale-95 transition-all shadow-md shadow-[#FF6B00]/10"
            >
              {busy ? "Submitting..." : "Submit Loan Request"}
            </button>
          </div>
        </div>

        {/* Active Loans List */}
        <div className={`p-6 rounded-[28px] border shadow-sm flex flex-col justify-between ${cardStyle}`}>
          <h3 className="text-base font-black mb-4">My Loan Status</h3>
          {loans.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <span className="text-3xl mb-2">🤝</span>
              <div className="font-extrabold text-sm text-gray-400">No Active Loans</div>
              <p className="text-xs text-gray-500 max-w-[220px] mt-1 mx-auto leading-relaxed">
                The Admin has not issued any loan offers to your account yet.
              </p>
            </div>
          ) : (
            <div className="space-y-4 max-h-[360px] overflow-y-auto pr-1">
              {loans.map((loan) => {
                const isPending = loan.status === "pending";
                const isApproved = loan.status === "approved";
                const isAwaiting = loan.status === "awaiting_disbursal";
                const isActive = loan.status === "active";
                let bg = "";
                if (isPending) bg = dark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200';
                else if (isApproved) bg = dark ? 'bg-blue-500/5 border-blue-500/20' : 'bg-blue-50/50 border-blue-200';
                else if (isAwaiting) bg = dark ? 'bg-purple-500/5 border-purple-500/20' : 'bg-purple-50/50 border-purple-200';
                else bg = dark ? 'bg-emerald-500/5 border-emerald-500/10' : 'bg-emerald-500/5 border-[#34D399]/20';

                return (
                  <div key={loan.id} className={`p-4 rounded-2xl border ${bg} space-y-3 text-xs`}>
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-gray-400">Amount:</span>
                      <span className={`font-black text-sm ${isPending ? 'text-amber-500' : isApproved ? 'text-blue-400' : isAwaiting ? 'text-purple-400' : 'text-emerald-400'}`}>
                        {formatXlm(Number(loan.approvedAmount || loan.amount))} XLM
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Status:</span>
                      <span className={`font-black uppercase tracking-wider ${isPending ? 'text-amber-500 animate-pulse' : isApproved ? 'text-blue-400 animate-pulse' : isAwaiting ? 'text-purple-400 animate-pulse' : 'text-emerald-400'}`}>
                        {isApproved ? "Offer Issued" : isAwaiting ? "Awaiting Disbursal" : loan.status}
                      </span>
                    </div>
                    {isApproved && (
                      <div className="space-y-2 border-t border-white/5 pt-2 mt-2">
                        {loan.monthlyRepayment ? (
                          <div className="text-xs text-amber-500 font-bold">
                            Repayment: {loan.monthlyRepayment} XLM/mo over {loan.durationMonths || 1} mo @ {loan.interestRate || 0}%
                          </div>
                        ) : null}
                        <button onClick={() => handleAcceptOffer(loan)} disabled={busy} className="w-full mt-2 px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-all">
                          {busy ? "Signing..." : "Accept Loan Offer"}
                        </button>
                      </div>
                    )}
                    {isAwaiting && (
                      <div className="text-[10px] text-purple-400 mt-2 font-semibold border-t border-white/5 pt-2">
                        {loan.monthlyRepayment ? (
                          <div className="text-xs text-purple-400 font-bold mb-2">
                            Repayment: {loan.monthlyRepayment} XLM/mo over {loan.durationMonths || 1} mo @ {loan.interestRate || 0}%
                          </div>
                        ) : null}
                        Offer accepted. Awaiting Admin on-chain disbursal.
                      </div>
                    )}
                    {isActive && (
                      <div className="space-y-2 border-t border-white/5 pt-2 mt-2">
                        {loan.monthlyRepayment ? (
                          <div className="text-xs text-emerald-500 font-bold">
                            Repayment: {loan.monthlyRepayment} XLM/mo over {loan.durationMonths || 1} mo @ {loan.interestRate || 0}%
                          </div>
                        ) : null}
                        <button onClick={() => handleRepay(loan)} disabled={busy} className="w-full mt-2 px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 active:scale-95 transition-all">
                          {busy ? "Repaying..." : "Repay Loan"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-[10px] text-gray-500 leading-relaxed font-semibold mt-4 text-center">
            Prompt repayment builds your trust score and increases future loan limits.
          </p>
        </div>

      </div>
    </div>
  );
};

export default DriverLoanSection;
