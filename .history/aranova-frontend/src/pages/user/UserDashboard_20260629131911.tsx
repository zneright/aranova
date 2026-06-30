import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc, collection, query, where, getDocs, setDoc, updateDoc, addDoc, onSnapshot, increment } from "firebase/firestore";
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
const CONTRACT_ID = "CBKODGTL4BEG65F7IZZ2MWV3DNKXJ5LJJIA77TNIYSDL6N2BLDQOXGTO";
const NATIVE_XLM_CONTRACT_ID = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

// Helper to convert XLM to stroops (i128 representation for Soroban)
const toI128ScVal = (xlmAmount: number) => {
  const stroops = BigInt(Math.floor(xlmAmount * 10000000));
  return xdr.ScVal.scvI128(new xdr.Int128Parts({
    hi: new xdr.Int64([0, 0]),
    lo: xdr.Uint64.fromString(stroops.toString())
  }));
};

const signAndSubmitSorobanTransaction = async (rawTx: any, userData: any) => {
  const sorobanServer = new SorobanRpc.Server(SOROBAN_RPC_URL);

  // 1. Simulate
  const simResponse = await sorobanServer.simulateTransaction(rawTx);
  if (SorobanRpc.Api.isSimulationError(simResponse)) {
    throw new Error("Contract Simulation failed: " + simResponse.error);
  }

  // 2. Assemble
  const assembledTx = SorobanRpc.assembleTransaction(rawTx, NETWORK_PASSPHRASE, simResponse).build();

  // 3. Sign
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

  // 4. Submit
  const sendResponse = await sorobanServer.sendTransaction(signedTx);
  if (sendResponse.errorResultXdr) throw new Error("Execution reverted on-chain.");
  return sendResponse;
};

// ---------------------------------------------------------------------------
// 1. COOPERATIVE DASHBOARD
// ---------------------------------------------------------------------------
const CooperativeContent: React.FC<{ userData: any }> = ({ userData }) => {
  const { dark } = useTheme();
  const [isProcessing, setIsProcessing] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [requests, setRequests] = useState<any[]>([]);
  const [stats, setStats] = useState({ poolBalance: 0, totalDeposited: 0, totalReleased: 0, totalRepaid: 0, outstanding: 0 });

  // Real-time Firebase listeners for metrics & queues
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

      // Update Firebase Metrics after successful on-chain tx
      const statRef = doc(db, "coop_stats", userData.uid);
      await setDoc(statRef, {
        poolBalance: increment(Number(depositAmount)),
        totalDeposited: increment(Number(depositAmount))
      }, { merge: true });

      alert(`Successfully deposited ${depositAmount} XLM to the Smart Contract Escrow.`);
      setDepositAmount("");
    } catch (e: any) {
      alert("Deposit failed: " + e.message);
    } finally { setIsProcessing(false); }
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

      // Sync Success to Firebase
      await updateDoc(doc(db, "fuel_requests", req.id), { status: "active" });
      await setDoc(doc(db, "coop_stats", userData.uid), {
        poolBalance: increment(-Number(req.amount)),
        totalReleased: increment(Number(req.amount)),
        outstanding: increment(Number(req.amount))
      }, { merge: true });

      alert("Credit released from Escrow directly to Driver.");
    } catch (e: any) {
      alert("Release failed: " + e.message);
    } finally { setIsProcessing(false); }
  };

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", color: dark ? "#fff" : "#111" }}>
      <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 20 }}>Cooperative Dashboard</h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 30 }}>
        <div style={{ padding: 20, background: "#10B981", color: "#fff", borderRadius: 16 }}>
          <p style={{ margin: 0, fontSize: 12 }}>Current Pool Escrow</p>
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
          <p style={{ margin: 0, fontSize: 12 }}>Outstanding Loans</p>
          <h3 style={{ margin: "4px 0 0", fontSize: 20 }}>{stats.outstanding} XLM</h3>
        </div>
      </div>

      <div style={{ background: dark ? "#1A1D27" : "#fff", padding: 20, borderRadius: 16, marginBottom: 30 }}>
        <h4>Fund the Pool</h4>
        <input type="number" placeholder="Amount (XLM)" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} style={{ padding: 10, marginRight: 10, borderRadius: 8 }} />
        <button onClick={handleDeposit} disabled={isProcessing} style={{ padding: "10px 20px", background: "#3B82F6", color: "#fff", border: "none", borderRadius: 8 }}>{isProcessing ? "Signing..." : "Deposit to Escrow"}</button>
      </div>

      <div style={{ background: dark ? "#1A1D27" : "#fff", padding: 20, borderRadius: 16 }}>
        <h4>Pending Driver Requests</h4>
        {requests.length === 0 ? <p>No pending requests.</p> : requests.map(req => (
          <div key={req.id} style={{ display: "flex", justifyContent: "space-between", padding: 12, borderBottom: "1px solid #374151" }}>
            <div>
              <strong>{req.driverName}</strong> requests <strong>{req.amount} XLM</strong>
            </div>
            <button onClick={() => handleApprove(req)} disabled={isProcessing} style={{ padding: "6px 12px", background: "#10B981", color: "#fff", border: "none", borderRadius: 6 }}>Approve & Release</button>
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 2. DRIVER DASHBOARD
// ---------------------------------------------------------------------------
const DriverContent: React.FC<{ userData: any }> = ({ userData }) => {
  const { dark } = useTheme();
  const [isProcessing, setIsProcessing] = useState(false);
  const [requestAmount, setRequestAmount] = useState("");
  const [activeLoan, setActiveLoan] = useState<any>(null);

  useEffect(() => {
    const q = query(collection(db, "fuel_requests"), where("driverId", "==", userData.uid), where("status", "in", ["pending", "active"]));
    const unsub = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) setActiveLoan({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
      else setActiveLoan(null);
    });
    return () => unsub();
  }, [userData]);

  const handleRequest = async () => {
    if (activeLoan) return alert("You already have an active or pending request.");
    if (!requestAmount || isNaN(Number(requestAmount))) return alert("Invalid amount.");

    await addDoc(collection(db, "fuel_requests"), {
      driverId: userData.uid,
      driverName: userData.displayName,
      driverPublicKey: userData.publicKey,
      coopId: userData.cooperativeId,
      amount: Number(requestAmount),
      status: "pending",
      timestamp: new Date().toISOString()
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

      // Sync Success to Firebase (Close loan, update coop stats)
      await updateDoc(doc(db, "fuel_requests", activeLoan.id), { status: "repaid" });
      await setDoc(doc(db, "coop_stats", activeLoan.coopId), {
        poolBalance: increment(Number(activeLoan.amount)),
        totalRepaid: increment(Number(activeLoan.amount)),
        outstanding: increment(-Number(activeLoan.amount))
      }, { merge: true });

      alert("Repayment successful! Fees automatically routed to Admin and Coop.");
    } catch (e: any) {
      alert("Repayment failed: " + e.message);
    } finally { setIsProcessing(false); }
  };

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", color: dark ? "#fff" : "#111" }}>
      <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 20 }}>Driver Dashboard</h2>

      <div style={{ background: dark ? "#1A1D27" : "#fff", padding: 20, borderRadius: 16, marginBottom: 20 }}>
        <h4>Fuel Credit Status</h4>
        {!activeLoan ? (
          <div>
            <p>You have no active loans. Request a new credit line from your Cooperative.</p>
            <input type="number" placeholder="Amount (XLM)" value={requestAmount} onChange={e => setRequestAmount(e.target.value)} style={{ padding: 10, marginRight: 10, borderRadius: 8 }} />
            <button onClick={handleRequest} style={{ padding: "10px 20px", background: "#3B82F6", color: "#fff", border: "none", borderRadius: 8 }}>Request Credit</button>
          </div>
        ) : activeLoan.status === "pending" ? (
          <p style={{ color: "#F59E0B" }}>Your request for <strong>{activeLoan.amount} XLM</strong> is pending approval from your Cooperative.</p>
        ) : (
          <div>
            <p style={{ color: "#EF4444" }}>You have an active fuel credit of <strong>{activeLoan.amount} XLM</strong>.</p>
            <p style={{ fontSize: 12, opacity: 0.8 }}>Repayment includes a strict 0.2 XLM Admin fee and 0.3 XLM Coop fee enforced by the Smart Contract.</p>
            <button onClick={handleRepay} disabled={isProcessing} style={{ padding: "10px 20px", background: "#EF4444", color: "#fff", border: "none", borderRadius: 8 }}>{isProcessing ? "Processing..." : "Repay Loan Now"}</button>
          </div>
        )}
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

  if (authLoading || userData === null) return <LoadingWorkspace message="Loading Data..." />;
  if (userData.approved === false) return <div>Verification Pending...</div>;

  return (
    <UserLayout activeTab={activeTab} onTabChange={setActiveTab} userData={userData}>
      {userData.role === "driver" && <DriverContent userData={userData} />}
      {userData.role === "cooperative" && <CooperativeContent userData={userData} />}
    </UserLayout>
  );
};

export default UserDashboard;