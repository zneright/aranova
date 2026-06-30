import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc, collection, query, where, onSnapshot, setDoc, updateDoc, addDoc, increment } from "firebase/firestore";
import { auth, db } from "../../firebase/config";
import UserLayout, { useTheme } from "../../components/layout/UserLayout";
import LoadingWorkspace from "../../components/ui/LoadingWorkspace";
import CryptoJS from "crypto-js";
import {
  Networks,
  TransactionBuilder,
  Horizon,
  Keypair,
  Contract,
  Address,
  SorobanRpc,
  xdr
} from "@stellar/stellar-sdk";
import { FreighterModule } from '@creit.tech/stellar-wallets-kit/modules/freighter';

const HORIZON_RPC_URL = "https://horizon-testnet.stellar.org";
const SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = Networks.TESTNET;

// REPLACE THIS AFTER REDEPLOYING YOUR MERGED LIB.RS
const CONTRACT_ID = "CBKODGTL4BEG65F7IZZ2MWV3DNKXJ5LJJIA77TNIYSDL6N2BLDQOXGTO";
const NATIVE_XLM_CONTRACT_ID = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

// ---------------------------------------------------------------------------
// SVG Icons
// ---------------------------------------------------------------------------
const IconScan = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M23 7V1h-6" /><path d="M1 7V1h6" /><path d="M23 17v6h-6" /><path d="M1 17v6h6" /><line x1="9" y1="9" x2="15" y2="9" /><line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="15" x2="15" y2="15" /></svg>);
const IconSend = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>);
const IconPending = () => (<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const toI128ScVal = (xlmAmount: number) => {
  const stroops = BigInt(Math.floor(xlmAmount * 10000000));
  return xdr.ScVal.scvI128(new xdr.Int128Parts({
    hi: new xdr.Int64([0, 0]),
    lo: xdr.Uint64.fromString(stroops.toString())
  }));
};

const getLiveXlmToPhpRate = async (): Promise<number> => {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    const data = await res.json();
    if (data && data.rates && data.rates.PHP && data.rates.XLM) {
      const directRate = data.rates.PHP / data.rates.XLM;
      localStorage.setItem("aranova_cached_xlm_php_rate", String(directRate));
      return directRate;
    }
    throw new Error("Rates missing");
  } catch (e) {
    return Number(localStorage.getItem("aranova_cached_xlm_php_rate")) || 7.65;
  }
};

const signAndSubmitSorobanTransaction = async (rawTx: any, userData: any) => {
  const sorobanServer = new SorobanRpc.Server(SOROBAN_RPC_URL);

  const simResponse = await sorobanServer.simulateTransaction(rawTx);
  if (SorobanRpc.Api.isSimulationError(simResponse)) {
    throw new Error("Contract Simulation failed: " + simResponse.error);
  }

  const assembledTx = SorobanRpc.assembleTransaction(rawTx, NETWORK_PASSPHRASE, simResponse).build();

  let signedTx;
  if (userData?.encryptedSecretKey) {
    const pin = window.prompt("Enter your 4-6 digit Wallet PIN to authorize:");
    if (!pin) throw new Error("Transaction cancelled.");
    const bytes = CryptoJS.AES.decrypt(userData.encryptedSecretKey, pin);
    const secretKey = bytes.toString(CryptoJS.enc.Utf8);
    const keypair = Keypair.fromSecret(secretKey);
    assembledTx.sign(keypair);
    signedTx = assembledTx;
  } else {
    const walletModule = new FreighterModule();
    const signResult: any = await walletModule.signTransaction(assembledTx.toXDR(), { networkPassphrase: NETWORK_PASSPHRASE });
    signedTx = TransactionBuilder.fromXDR(typeof signResult === 'string' ? signResult : signResult.signedXDR, NETWORK_PASSPHRASE);
  }

  const sendResponse = await sorobanServer.sendTransaction(signedTx);
  if (sendResponse.errorResultXdr) throw new Error("Execution reverted on-chain.");
  return sendResponse;
};

// ---------------------------------------------------------------------------
// SUB-COMPONENT: REAL LIVE BALANCE DISPLAY
// ---------------------------------------------------------------------------
const LiveWalletWidget: React.FC<{ userData: any, liveRate: number }> = ({ userData, liveRate }) => {
  const [balance, setBalance] = useState(() => localStorage.getItem(`aranova_cached_bal_${userData?.uid}`) || "0.00");

  const fetchBalance = () => {
    if (!userData?.publicKey) return;
    fetch(`${HORIZON_RPC_URL}/accounts/${userData.publicKey}`)
      .then(res => res.json())
      .then(data => {
        if (data.balances) {
          const xlm = data.balances.find((b: any) => b.asset_type === 'native');
          const finalBal = xlm ? parseFloat(xlm.balance).toFixed(2) : "0.00";
          setBalance(finalBal);
          localStorage.setItem(`aranova_cached_bal_${userData.uid}`, finalBal);
        }
      }).catch(() => {
        const fallback = localStorage.getItem(`aranova_cached_bal_${userData.uid}`) || "0.00";
        setBalance(fallback);
      });
  };

  useEffect(() => {
    fetchBalance();
    const interval = setInterval(fetchBalance, 10000);
    return () => clearInterval(interval);
  }, [userData]);

  const phpBalanceVal = (parseFloat(balance) * liveRate).toFixed(2);

  return (
    <div style={{ background: "linear-gradient(135deg, #10B981 0%, #064E3B 100%)", borderRadius: 24, padding: 28, color: "#fff", position: "relative" }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.8)", marginBottom: 6 }}>Live Testnet XLM Balance</p>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, margin: "6px 0" }}>
        <span style={{ fontSize: 52, fontWeight: 900, letterSpacing: -2, lineHeight: 1 }}>{balance}</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,.8)", marginLeft: 4 }}>XLM</span>
        <span style={{ fontSize: 18, fontWeight: 600, color: "#FFFBEB", marginLeft: 12 }}>≈ ₱{phpBalanceVal} PHP</span>
      </div>
      <p style={{ fontSize: 11, color: "rgba(255,255,255,.6)", marginTop: 10, wordBreak: "break-all" }}>PubKey: {userData?.publicKey}</p>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 1. COMMUTER DASHBOARD
// ---------------------------------------------------------------------------
const CommuterContent: React.FC<{ userData: any }> = ({ userData }) => {
  const { dark } = useTheme();
  const [liveRate, setLiveRate] = useState<number>(7.65);
  const [isProcessing, setIsProcessing] = useState(false);
  const t = { textPrim: dark ? "#F1F5F9" : "#111827" };

  useEffect(() => { getLiveXlmToPhpRate().then(rate => setLiveRate(rate)); }, []);

  // Uses the Unified `process_payment` Contract call for Auto-Vaults
  const handlePayFare = async () => {
    const dest = window.prompt("Enter recipient's Stellar Public Key:");
    if (!dest || dest.length !== 56) return alert("Invalid Public Key.");
    const amt = window.prompt("Enter Fare Amount (XLM):");
    if (!amt || isNaN(Number(amt))) return alert("Invalid amount.");

    setIsProcessing(true);
    try {
      const horizon = new Horizon.Server(HORIZON_RPC_URL);
      const account = await horizon.loadAccount(userData.publicKey);
      const aranovaContract = new Contract(CONTRACT_ID);

      const rawTx = new TransactionBuilder(account, { fee: "100", networkPassphrase: NETWORK_PASSPHRASE })
        .addOperation(aranovaContract.call(
          "process_payment",
          new Address(userData.publicKey).toScVal(),
          new Address(dest).toScVal(),
          new Address(NATIVE_XLM_CONTRACT_ID).toScVal(),
          toI128ScVal(Number(amt))
        )).setTimeout(30).build();

      await signAndSubmitSorobanTransaction(rawTx, userData);
      alert(`Success! Sent ${amt} XLM via Smart Contract (Auto-vaults triggered).`);
    } catch (e: any) {
      alert("Payment Failed: " + e.message);
    } finally { setIsProcessing(false); }
  };

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
        <div style={{ gridColumn: "1 / 4", display: "flex", flexDirection: "column", gap: 20 }}>
          <LiveWalletWidget userData={userData} liveRate={liveRate} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div onClick={handlePayFare} style={{ background: dark ? "#064E3B" : "#ECFDF5", border: `1px solid ${dark ? "#047857" : "#6EE7B7"}`, borderRadius: 20, padding: 22, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, cursor: isProcessing ? "not-allowed" : "pointer", opacity: isProcessing ? 0.6 : 1 }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: dark ? "#065F46" : "#D1FAE5", color: dark ? "#34D399" : "#059669", display: "flex", alignItems: "center", justifyContent: "center" }}><IconSend /></div>
              <span style={{ fontWeight: 800, fontSize: 15, color: dark ? "#34D399" : "#059669" }}>{isProcessing ? "Sending..." : "Pay Fare"}</span>
            </div>
            <div onClick={() => alert(`Your Public Key:\n\n${userData.publicKey}`)} style={{ background: dark ? "#1F1A0A" : "#FFFBEB", border: `1px solid ${dark ? "#78350F" : "#F4D03F"}`, borderRadius: 20, padding: 22, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: dark ? "#292200" : "#FEF9C3", color: dark ? "#FBBF24" : "#92400E", display: "flex", alignItems: "center", justifyContent: "center" }}><IconScan /></div>
              <span style={{ fontWeight: 800, fontSize: 15, color: t.textPrim }}>Receive Funds</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 2. DRIVER DASHBOARD
// ---------------------------------------------------------------------------
const DriverContent: React.FC<{ userData: any }> = ({ userData }) => {
  const { dark } = useTheme();
  const [liveRate, setLiveRate] = useState<number>(7.65);
  const [isProcessing, setIsProcessing] = useState(false);
  const [requestAmount, setRequestAmount] = useState("");
  const [activeLoan, setActiveLoan] = useState<any>(null);

  useEffect(() => { getLiveXlmToPhpRate().then(rate => setLiveRate(rate)); }, []);

  useEffect(() => {
    const q = query(collection(db, "fuel_requests"), where("driverId", "==", userData.uid), where("status", "in", ["pending", "active"]));
    const unsub = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) setActiveLoan({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
      else setActiveLoan(null);
    });
    return () => unsub();
  }, [userData]);

  const handlePayFare = async () => {
    const dest = window.prompt("Enter recipient's Stellar Public Key:");
    if (!dest || dest.length !== 56) return alert("Invalid Public Key.");
    const amt = window.prompt("Enter Fare Amount (XLM):");
    if (!amt || isNaN(Number(amt))) return alert("Invalid amount.");

    setIsProcessing(true);
    try {
      const horizon = new Horizon.Server(HORIZON_RPC_URL);
      const account = await horizon.loadAccount(userData.publicKey);
      const aranovaContract = new Contract(CONTRACT_ID);

      const rawTx = new TransactionBuilder(account, { fee: "100", networkPassphrase: NETWORK_PASSPHRASE })
        .addOperation(aranovaContract.call(
          "process_payment",
          new Address(userData.publicKey).toScVal(),
          new Address(dest).toScVal(),
          new Address(NATIVE_XLM_CONTRACT_ID).toScVal(),
          toI128ScVal(Number(amt))
        )).setTimeout(30).build();

      await signAndSubmitSorobanTransaction(rawTx, userData);
      alert(`Success! Sent ${amt} XLM.`);
    } catch (e: any) { alert("Payment Failed: " + e.message); } finally { setIsProcessing(false); }
  };

  const handleRequestCredit = async () => {
    if (activeLoan) return alert("You already have an active or pending request.");
    if (!requestAmount || isNaN(Number(requestAmount))) return alert("Invalid amount.");

    await addDoc(collection(db, "fuel_requests"), {
      driverId: userData.uid, driverName: userData.displayName, driverPublicKey: userData.publicKey,
      coopId: userData.cooperativeId, amount: Number(requestAmount), status: "pending", timestamp: new Date().toISOString()
    });
    setRequestAmount("");
    alert("Request submitted to your Cooperative.");
  };

  const handleRepay = async () => {
    if (!activeLoan) return;
    setIsProcessing(true);
    try {
      const horizon = new Horizon.Server(HORIZON_RPC_URL);
      const account = await horizon.loadAccount(userData.publicKey);
      const aranovaContract = new Contract(CONTRACT_ID);

      const rawTx = new TransactionBuilder(account, { fee: "100", networkPassphrase: NETWORK_PASSPHRASE })
        .addOperation(aranovaContract.call(
          "repay_credit",
          new Address(userData.publicKey).toScVal(),
          new Address(NATIVE_XLM_CONTRACT_ID).toScVal()
        )).setTimeout(30).build();

      await signAndSubmitSorobanTransaction(rawTx, userData);

      // Sync to Firebase
      await updateDoc(doc(db, "fuel_requests", activeLoan.id), { status: "repaid" });
      await setDoc(doc(db, "coop_stats", activeLoan.coopId), {
        poolBalance: increment(Number(activeLoan.amount)),
        totalRepaid: increment(Number(activeLoan.amount)),
        outstanding: increment(-Number(activeLoan.amount))
      }, { merge: true });

      alert("Repayment successful! Escrow unlocked and fees routed.");
    } catch (e: any) { alert("Repayment failed: " + e.message); } finally { setIsProcessing(false); }
  };

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", color: dark ? "#fff" : "#111" }}>
      <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 20 }}>Driver Dashboard</h2>

      <LiveWalletWidget userData={userData} liveRate={liveRate} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, margin: "20px 0" }}>
        <button onClick={handlePayFare} disabled={isProcessing} style={{ padding: "16px", background: "#10B981", color: "#fff", border: "none", borderRadius: 12, fontWeight: 800 }}>{isProcessing ? "Processing..." : "Pay/Send Funds (Smart Routing)"}</button>
      </div>

      <div style={{ background: dark ? "#1A1D27" : "#fff", padding: 20, borderRadius: 16, border: `1px solid ${dark ? "#2A2D3A" : "#E5E7EB"}` }}>
        <h4 style={{ margin: "0 0 16px" }}>Fuel Credit Escrow</h4>
        {!activeLoan ? (
          <div>
            <p style={{ fontSize: 13, marginBottom: 16 }}>You have no active loans. Request a new credit line from your Cooperative.</p>
            <input type="number" placeholder="Amount (XLM)" value={requestAmount} onChange={e => setRequestAmount(e.target.value)} style={{ padding: 10, marginRight: 10, borderRadius: 8, border: "1px solid #E5E7EB" }} />
            <button onClick={handleRequestCredit} style={{ padding: "10px 20px", background: "#3B82F6", color: "#fff", border: "none", borderRadius: 8, fontWeight: 800 }}>Request Credit</button>
          </div>
        ) : activeLoan.status === "pending" ? (
          <div style={{ padding: 16, background: "#FEF3C7", color: "#92400E", borderRadius: 12 }}>
            <span style={{ fontWeight: 800 }}>Pending Approval:</span> Your request for {activeLoan.amount} XLM is pending.
          </div>
        ) : (
          <div style={{ padding: 16, background: "#FEE2E2", color: "#991B1B", borderRadius: 12 }}>
            <span style={{ fontWeight: 800 }}>Active Credit:</span> You owe {activeLoan.amount} XLM + Strict Smart Contract Fees.
            <button onClick={handleRepay} disabled={isProcessing} style={{ display: "block", marginTop: 16, padding: "10px 20px", background: "#EF4444", color: "#fff", border: "none", borderRadius: 8, fontWeight: 800, width: "100%" }}>{isProcessing ? "Signing..." : "Repay Loan Now"}</button>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 3. COOPERATIVE DASHBOARD
// ---------------------------------------------------------------------------
const CooperativeContent: React.FC<{ userData: any }> = ({ userData }) => {
  const { dark } = useTheme();
  const [liveRate, setLiveRate] = useState<number>(7.65);
  const [isProcessing, setIsProcessing] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [requests, setRequests] = useState<any[]>([]);
  const [stats, setStats] = useState({ poolBalance: 0, totalDeposited: 0, totalReleased: 0, totalRepaid: 0, outstanding: 0 });

  useEffect(() => { getLiveXlmToPhpRate().then(rate => setLiveRate(rate)); }, []);

  useEffect(() => {
    const unsubStats = onSnapshot(doc(db, "coop_stats", userData.uid), (doc) => {
      if (doc.exists()) setStats(doc.data() as any);
    });

    const q = query(collection(db, "fuel_requests"), where("coopId", "==", userData.uid), where("status", "==", "pending"));
    const unsubReqs = onSnapshot(q, (snapshot) => {
      setRequests(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubStats(); unsubReqs(); };
  }, [userData]);

  const handleDeposit = async () => {
    if (!depositAmount || isNaN(Number(depositAmount))) return alert("Invalid amount.");
    setIsProcessing(true);
    try {
      const horizon = new Horizon.Server(HORIZON_RPC_URL);
      const account = await horizon.loadAccount(userData.publicKey);
      const aranovaContract = new Contract(CONTRACT_ID);

      const rawTx = new TransactionBuilder(account, { fee: "100", networkPassphrase: NETWORK_PASSPHRASE })
        .addOperation(aranovaContract.call(
          "deposit_pool",
          new Address(userData.publicKey).toScVal(),
          new Address(NATIVE_XLM_CONTRACT_ID).toScVal(),
          toI128ScVal(Number(depositAmount))
        )).setTimeout(30).build();

      await signAndSubmitSorobanTransaction(rawTx, userData);

      const statRef = doc(db, "coop_stats", userData.uid);
      await setDoc(statRef, {
        poolBalance: increment(Number(depositAmount)),
        totalDeposited: increment(Number(depositAmount))
      }, { merge: true });

      alert(`Successfully deposited ${depositAmount} XLM to the Smart Contract Escrow.`);
      setDepositAmount("");
    } catch (e: any) { alert("Deposit failed: " + e.message); } finally { setIsProcessing(false); }
  };

  const handleApprove = async (req: any) => {
    setIsProcessing(true);
    try {
      const horizon = new Horizon.Server(HORIZON_RPC_URL);
      const account = await horizon.loadAccount(userData.publicKey);
      const aranovaContract = new Contract(CONTRACT_ID);

      const rawTx = new TransactionBuilder(account, { fee: "100", networkPassphrase: NETWORK_PASSPHRASE })
        .addOperation(aranovaContract.call(
          "release_credit",
          new Address(userData.publicKey).toScVal(),
          new Address(req.driverPublicKey).toScVal(),
          new Address(NATIVE_XLM_CONTRACT_ID).toScVal(),
          toI128ScVal(Number(req.amount))
        )).setTimeout(30).build();

      await signAndSubmitSorobanTransaction(rawTx, userData);

      await updateDoc(doc(db, "fuel_requests", req.id), { status: "active" });
      await setDoc(doc(db, "coop_stats", userData.uid), {
        poolBalance: increment(-Number(req.amount)),
        totalReleased: increment(Number(req.amount)),
        outstanding: increment(Number(req.amount))
      }, { merge: true });

      alert("Credit released from Escrow directly to Driver.");
    } catch (e: any) { alert("Release failed: " + e.message); } finally { setIsProcessing(false); }
  };

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", color: dark ? "#fff" : "#111" }}>
      <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 20 }}>Cooperative Dashboard</h2>

      <LiveWalletWidget userData={userData} liveRate={liveRate} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, margin: "30px 0" }}>
        <div style={{ padding: 20, background: "#10B981", color: "#fff", borderRadius: 16 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700 }}>Current Pool Escrow</p>
          <h3 style={{ margin: "4px 0 0", fontSize: 24 }}>{stats.poolBalance} XLM</h3>
        </div>
        <div style={{ padding: 20, background: dark ? "#1F2937" : "#F3F4F6", borderRadius: 16 }}>
          <p style={{ margin: 0, fontSize: 12 }}>Total Deposited</p>
          <h3 style={{ margin: "4px 0 0", fontSize: 20 }}>{stats.totalDeposited} XLM</h3>
        </div>
        <div style={{ padding: 20, background: dark ? "#1F2937" : "#F3F4F6", borderRadius: 16 }}>
          <p style={{ margin: 0, fontSize: 12 }}>Total Released</p>
          <h3 style={{ margin: "4px 0 0", fontSize: 20 }}>{stats.totalReleased} XLM</h3>
        </div>
        <div style={{ padding: 20, background: dark ? "#1F2937" : "#F3F4F6", borderRadius: 16 }}>
          <p style={{ margin: 0, fontSize: 12 }}>Outstanding</p>
          <h3 style={{ margin: "4px 0 0", fontSize: 20 }}>{stats.outstanding} XLM</h3>
        </div>
      </div>

      <div style={{ background: dark ? "#1A1D27" : "#fff", padding: 20, borderRadius: 16, marginBottom: 30, border: `1px solid ${dark ? "#2A2D3A" : "#E5E7EB"}` }}>
        <h4 style={{ margin: "0 0 16px" }}>Fund the Smart Pool</h4>
        <input type="number" placeholder="Amount (XLM)" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} style={{ padding: 10, marginRight: 10, borderRadius: 8, border: "1px solid #E5E7EB" }} />
        <button onClick={handleDeposit} disabled={isProcessing} style={{ padding: "10px 20px", background: "#3B82F6", color: "#fff", border: "none", borderRadius: 8, fontWeight: 800 }}>{isProcessing ? "Signing..." : "Deposit to Escrow"}</button>
      </div>

      <div style={{ background: dark ? "#1A1D27" : "#fff", padding: 20, borderRadius: 16, border: `1px solid ${dark ? "#2A2D3A" : "#E5E7EB"}` }}>
        <h4 style={{ margin: "0 0 16px" }}>Pending Driver Requests</h4>
        {requests.length === 0 ? <p style={{ fontSize: 13, opacity: 0.8 }}>No pending requests.</p> : requests.map(req => (
          <div key={req.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 12, borderBottom: `1px solid ${dark ? "#374151" : "#E5E7EB"}` }}>
            <div>
              <strong>{req.driverName}</strong> requests <strong>{req.amount} XLM</strong>
            </div>
            <button onClick={() => handleApprove(req)} disabled={isProcessing} style={{ padding: "8px 16px", background: "#10B981", color: "#fff", border: "none", borderRadius: 8, fontWeight: 800 }}>Approve & Release</button>
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// UserDashboard (Entry Point)
// ---------------------------------------------------------------------------
const UserDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState("wallet");
  const [userData, setUserData] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) setUserData(userDoc.data());
        } catch (error) { console.error("Database error."); }
      } else { navigate("/auth"); }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, [navigate]);

  if (authLoading || userData === null) return <LoadingWorkspace message="Loading Ecosystem Data..." />;
  if (userData.approved === false) return <LoadingWorkspace message="Verification Pending..." />;

  return (
    <UserLayout activeTab={activeTab} onTabChange={setActiveTab} userData={userData}>
      {userData.role === "driver" && <DriverContent userData={userData} />}
      {userData.role === "cooperative" && <CooperativeContent userData={userData} />}
      {!["driver", "cooperative"].includes(userData.role) && <CommuterContent userData={userData} />}
    </UserLayout>
  );
};

export default UserDashboard;