import { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import UserLayout from "../../components/layout/UserLayout";
import { useTheme } from "../../contexts/ThemeContext";
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
import {
  formatXlm,
  defaultPolicy,
  type Policy,
  toDurationDays,
} from "../../services/aranovaWorkflow";
import {
  getLoanRecord,
  repayCredit,
  NETWORK_PASSPHRASE,
} from "../../services/sorobanService";
import CryptoJS from "crypto-js";
import { FreighterModule } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { xBullModule } from "@creit.tech/stellar-wallets-kit/modules/xbull";
import { LobstrModule } from "@creit.tech/stellar-wallets-kit/modules/lobstr";

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
      },
    };
  }
};

const DriverLoans = () => {
  const { userData, loading: authLoading } = useAuth();
  const { dark } = useTheme();

  const [policy, setPolicy] = useState<Policy>(defaultPolicy);
  const [requestedAmount, setRequestedAmount] = useState("0");
  const [activeLoan, setActiveLoan] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  // Sync policy
  useEffect(() => {
    const policyUnsub = onSnapshot(
      doc(db, "app_config", "policy"),
      (snap) => {
        if (snap.exists()) setPolicy({ ...defaultPolicy, ...(snap.data() as any) });
      },
      (err) => console.warn("Dashboard app policy snapshot error:", err)
    );
    return () => policyUnsub();
  }, []);

  // Sync active loans
  useEffect(() => {
    if (authLoading || !userData?.uid) return;

    const loanQuery = query(
      collection(db, "fuel_requests"),
      where("driverId", "==", userData.uid),
      where("status", "in", ["pending", "active"])
    );
    const unsub = onSnapshot(
      loanQuery,
      (snapshot) => {
        setActiveLoan(snapshot.empty ? null : { id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
      },
      (err) => console.warn("Driver active loan snapshot error:", err)
    );

    if (userData?.publicKey) {
      getLoanRecord(userData.publicKey)
        .then((onChainLoan) => {
          if (onChainLoan) {
            console.log("On-chain verified loan record exists:", onChainLoan);
          }
        })
        .catch((err) => {
          console.warn("Failed to check on-chain loan record:", err);
        });
    }

    return unsub;
  }, [authLoading, userData?.uid, userData?.publicKey]);

  if (authLoading || !userData) return <LoadingWorkspace message="Loading Driver Credit Panel..." />;

  const creditLimit = Math.min(Number(policy.maxApprovedAmount || 100), Number(userData.trustScore || 0) * 2);

  const handleRequestCredit = async () => {
    const value = Number(requestedAmount);
    if (!value || value <= 0) return alert("Enter a valid amount.");
    if (value > creditLimit) {
      return alert(
        `Amount exceeds your personalized limit of ${creditLimit} XLM (calculated from your trust score of ${userData.trustScore}/100).`
      );
    }

    setBusy(true);
    try {
      await addDoc(collection(db, "fuel_requests"), {
        driverId: userData.uid,
        driverName: userData.displayName,
        driverPublicKey: userData.publicKey,
        coopId: userData.cooperativeId || "unknown-coop",
        amount: value,
        approvedAmount: Math.min(value, creditLimit),
        interestRate: Number(policy.interestRate || 3),
        durationValue: Number(policy.durationValue || 30),
        durationUnit: policy.durationUnit,
        durationDays: toDurationDays(Number(policy.durationValue || 30), policy.durationUnit),
        status: "pending",
        createdAt: serverTimestamp(),
      });
      alert("Credit request submitted successfully to cooperative!");
      setRequestedAmount("0");
    } finally {
      setBusy(false);
    }
  };

  const handleRepay = async () => {
    if (!activeLoan) return;
    setBusy(true);
    try {
      // Live on-chain Soroban contract invocation
      const handler = await getSigningHandler(userData, NETWORK_PASSPHRASE);
      const txHash = await repayCredit(userData.publicKey, handler);
      console.log("Soroban Transaction Completed. Hash:", txHash);

      await updateDoc(doc(db, "fuel_requests", activeLoan.id), {
        status: "repaid",
        repaidAt: serverTimestamp(),
        blockchainTxHash: txHash,
      });
      await setDoc(
        doc(db, "coop_stats", activeLoan.coopId),
        {
          poolBalance: increment(Number(activeLoan.amount)),
          totalRepaid: increment(Number(activeLoan.amount)),
          outstanding: increment(-Number(activeLoan.amount)),
        },
        { merge: true }
      );
      await addDoc(collection(db, "transactions"), {
        type: "repayment",
        from: userData.uid,
        to: activeLoan.coopId,
        amount: Number(activeLoan.amount),
        adminFee: 0.2,
        coopFee: 0.3,
        status: "completed",
        blockchainTxHash: txHash,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "users", userData.uid), {
        trustScore: Math.min(100, Number(userData.trustScore || 0) + 4),
        lastTrustUpdate: serverTimestamp(),
      });
      alert(`Repayment submitted on-chain and recorded locally!\nTx Hash: ${txHash}`);
    } catch (err: any) {
      console.error(err);
      alert(`Contract execution failed: ${err.message || err}`);
    } finally {
      setBusy(false);
    }
  };

  const cardStyle = dark ? "bg-[#141620] border-white/5 text-white" : "bg-white border-[#EAE6DF] text-gray-900";

  return (
    <UserLayout activeTab="loans" userData={userData}>
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className={`text-2xl font-black ${dark ? 'text-white' : 'text-gray-900'}`}>Driver Credit Portal</h1>
            <p className={`text-xs mt-1 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Request fuel credit loans and manage Soroban repayments</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border px-4 py-2 bg-amber-500/10 border-amber-500/20 text-[#FF8833] text-xs font-black uppercase tracking-wider">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            Credit Line Connected
          </div>
        </div>

        {/* Primary Stats Bento Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className={`p-6 rounded-[24px] border shadow-sm flex flex-col justify-between ${cardStyle}`}>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Trust Score</p>
              <h3 className="text-2xl font-black mt-2 text-[#FF8833]">{Number(userData.trustScore || 0)} / 100</h3>
            </div>
            <span className="text-[10px] text-gray-500 mt-4">Updated daily based on compliance</span>
          </div>

          <div className={`p-6 rounded-[24px] border shadow-sm flex flex-col justify-between ${cardStyle}`}>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Personal Credit Limit</p>
              <h3 className="text-2xl font-black mt-2 text-emerald-500">{formatXlm(creditLimit)} XLM</h3>
            </div>
            <span className="text-[10px] text-gray-500 mt-4">Determined by active trust standing</span>
          </div>

          <div className={`p-6 rounded-[24px] border shadow-sm flex flex-col justify-between ${cardStyle}`}>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Standard Repayment Term</p>
              <h3 className="text-2xl font-black mt-2 text-gray-300">
                {Number(policy.durationValue || 30)} {policy.durationUnit}
              </h3>
            </div>
            <span className="text-[10px] text-gray-500 mt-4">Cooperative loan policy configuration</span>
          </div>
        </div>

        {/* Sub Layout columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Left Column: Apply Form */}
          <div className={`p-6 rounded-[28px] border shadow-sm space-y-6 ${cardStyle}`}>
            <div>
              <h3 className="text-base font-black">Request Fuel Credit</h3>
              <p className="text-xs text-gray-500 mt-1">Submit a credit request directly to your cooperative</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black mb-1.5 uppercase text-gray-400">Request Amount (XLM)</label>
                <input
                  value={requestedAmount}
                  onChange={(e) => setRequestedAmount(e.target.value)}
                  type="number"
                  placeholder="Enter XLM value"
                  className={`w-full px-4 py-3 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-[#FF6B00] ${
                    dark ? 'bg-white/5 border-white/10 text-white placeholder-gray-500' : 'bg-gray-50 border-gray-200 text-gray-900'
                  }`}
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <button
                  onClick={handleRequestCredit}
                  disabled={busy}
                  className="flex-1 px-5 py-3.5 rounded-xl font-black text-xs uppercase tracking-wider text-white bg-[#FF6B00] hover:bg-[#E05E00] disabled:opacity-50 active:scale-95 transition-all shadow-md shadow-[#FF6B00]/10"
                >
                  Request Credit
                </button>
                <button
                  onClick={() => alert("Bluetooth receive is handled by the cooperative matching service.")}
                  className={`px-4 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider border active:scale-95 transition-all ${
                    dark ? 'border-white/10 text-white hover:bg-white/5' : 'border-gray-200 text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  Bluetooth Receive
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Active Credit state */}
          <div className={`p-6 rounded-[28px] border shadow-sm flex flex-col justify-between ${cardStyle}`}>
            <div>
              <h3 className="text-base font-black mb-4">Current Credit Status</h3>
              
              {!activeLoan ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <span className="text-3xl mb-2">🚗</span>
                  <div className="font-extrabold text-sm text-gray-400">No Active Loan or Request</div>
                  <p className="text-xs text-gray-500 max-w-[220px] mt-1 mx-auto leading-relaxed">
                    Submit a credit request on the left to gain fuel allocation limits.
                  </p>
                </div>
              ) : activeLoan.status === "pending" ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <span className="text-3xl mb-2 animate-pulse">⏳</span>
                  <div className="font-extrabold text-sm text-amber-500 uppercase tracking-wider">Approval Pending</div>
                  <p className="text-xs text-gray-500 max-w-[220px] mt-1 mx-auto leading-relaxed">
                    Your request of {formatXlm(Number(activeLoan.amount))} XLM is awaiting approval from your cooperative.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className={`p-4 rounded-2xl border bg-emerald-500/5 ${dark ? 'border-emerald-500/10' : 'border-emerald-500/20'} space-y-3 text-xs`}>
                    <div className="flex justify-between font-semibold">
                      <span className="text-gray-400">Approved Loan:</span>
                      <span className="font-extrabold text-emerald-400">{formatXlm(Number(activeLoan.approvedAmount || activeLoan.amount))} XLM</span>
                    </div>
                    <div className="flex justify-between font-semibold">
                      <span className="text-gray-400">Interest Rate:</span>
                      <span className="font-bold text-gray-300">{Number(activeLoan.interestRate || 3)}%</span>
                    </div>
                    <div className="flex justify-between font-semibold">
                      <span className="text-gray-400">Maturity Duration:</span>
                      <span className="font-bold text-gray-300">{Number(activeLoan.durationDays || 30)} days</span>
                    </div>
                  </div>

                  <p className="text-xs text-gray-500 leading-relaxed font-medium">
                    Ensure prompt repayment via Soroban smart contracts. Compliant repayment behavior automatically builds your driver trust telemetry.
                  </p>
                </div>
              )}
            </div>

            {activeLoan && activeLoan.status === "active" && (
              <button
                onClick={handleRepay}
                disabled={busy}
                className="w-full mt-6 px-5 py-3.5 rounded-xl font-black text-xs uppercase tracking-wider text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 active:scale-95 transition-all shadow-md shadow-emerald-600/15"
              >
                {busy ? "Repaying..." : "Repay Credit Term"}
              </button>
            )}
          </div>

        </div>

      </div>
    </UserLayout>
  );
};

export default DriverLoans;
