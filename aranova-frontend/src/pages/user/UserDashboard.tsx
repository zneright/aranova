import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
<<<<<<< HEAD
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
=======
import {
  addDoc,
  collection,
  doc,
  getDoc,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "../../firebase/config";
import UserLayout, { useTheme } from "../../components/layout/UserLayout";
import LoadingWorkspace from "../../components/ui/LoadingWorkspace";

const makePublicKey = (uid: string) => `G${uid.slice(0, 55)}`.padEnd(56, "0");
const formatXlm = (value: number) => Number(value || 0).toFixed(2);

const ensureUserProfile = async (user: any) => {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const profile = {
      uid: user.uid,
      email: user.email || "",
      displayName: user.displayName || "New User",
      role: "commuter",
      approved: true,
      publicKey: makePublicKey(user.uid),
      walletBalance: 120,
      vaultBalance: 0,
      trustScore: 72,
      lastTrustUpdate: null,
      cooperativeId: null,
      createdAt: serverTimestamp(),
    };
    await setDoc(ref, profile, { merge: true });
    return profile;
  }

  return { uid: user.uid, ...snap.data() };
};

const refreshTrustScore = async (userData: any, nextScore: number) => {
  if (!userData?.uid) return;
  await updateDoc(doc(db, "users", userData.uid), {
    trustScore: Math.max(0, Math.min(100, nextScore)),
    lastTrustUpdate: serverTimestamp(),
  });
};

const CommuterContent: React.FC<{ userData: any; onRefresh: () => void }> = ({ userData, onRefresh }) => {
  const { dark } = useTheme();
  const [isBusy, setIsBusy] = useState(false);
  const [showVaultForm, setShowVaultForm] = useState(false);
  const [lockPercent, setLockPercent] = useState("25");
  const [lockDays, setLockDays] = useState("30");
  const [maturityDate, setMaturityDate] = useState(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));

  const maxCredit = useMemo(() => Math.min(250, 50 + Number(userData?.trustScore || 70) * 2), [userData?.trustScore]);

  const handleSend = async () => {
    const recipient = window.prompt("Recipient public key or phone id") || "";
    const amountInput = window.prompt("Amount in XLM") || "";
    const amount = Number(amountInput);

    if (!recipient || !amount || amount <= 0) {
      alert("Please provide a valid recipient and amount.");
      return;
    }

    if (amount > Number(userData.walletBalance || 0)) {
      alert("Insufficient wallet balance.");
      return;
    }

    setIsBusy(true);
    try {
      const txRef = await addDoc(collection(db, "transactions"), {
        type: "send",
        from: userData.uid,
        to: recipient,
        amount,
        mode: "manual",
        status: "completed",
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "users", userData.uid), {
        walletBalance: increment(-amount),
        lastActivityAt: serverTimestamp(),
      });
      await refreshTrustScore(userData, Number(userData.trustScore || 72) + 1);
      alert(`Payment queued and recorded. Transaction ID: ${txRef.id}`);
      onRefresh();
    } finally {
      setIsBusy(false);
    }
  };

  const handleBluetoothPay = async () => {
    const amountInput = window.prompt("Offline Bluetooth payment amount in XLM") || "";
    const amount = Number(amountInput);
    if (!amount || amount <= 0) return;

    setIsBusy(true);
    try {
      const queuedRef = await addDoc(collection(db, "offline_payments"), {
        payerId: userData.uid,
        recipientId: "bluetooth-driver",
        amount,
        mode: "bluetooth",
        status: "queued",
        createdAt: serverTimestamp(),
      });
      alert(`Bluetooth payment queued locally. ID: ${queuedRef.id}`);
      onRefresh();
    } finally {
      setIsBusy(false);
    }
  };

  const handleLockVault = async () => {
    const percent = Number(lockPercent);
    const days = Number(lockDays);
    if (!percent || !days || percent <= 0 || percent > 100) {
      alert("Choose a valid lock percentage and duration.");
      return;
    }

    const lockedAmount = (Number(userData.walletBalance || 0) * percent) / 100;
    setIsBusy(true);
    try {
      await setDoc(doc(db, "vaults", userData.uid), {
        ownerId: userData.uid,
        lockedAmount,
        lockPercent: percent,
        lockDays: days,
        maturityDate,
        status: "locked",
        createdAt: serverTimestamp(),
      }, { merge: true });
      await updateDoc(doc(db, "users", userData.uid), {
        walletBalance: increment(-lockedAmount),
        vaultBalance: increment(lockedAmount),
      });
      await refreshTrustScore(userData, Number(userData.trustScore || 72) + Math.min(5, Math.round(days / 10)));
      setShowVaultForm(false);
      onRefresh();
      alert(`Vault locked successfully with ${percent}% of your balance.`);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ background: dark ? "#08111f" : "#ffffff", borderRadius: 22, padding: 24, border: `1px solid ${dark ? "#1f2a3a" : "#e5e7eb"}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 24 }}>Commuter Wallet</h2>
          <span style={{ color: dark ? "#34d399" : "#15803d", fontWeight: 800 }}>Trust {userData?.trustScore || 72}</span>
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ background: "linear-gradient(135deg, #0f766e, #047857)", color: "#fff", borderRadius: 16, padding: 18 }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Available Wallet Balance</div>
            <div style={{ fontSize: 34, fontWeight: 900 }}>{formatXlm(Number(userData.walletBalance || 0))} XLM</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <button onClick={handleSend} disabled={isBusy} style={buttonStyle(dark, true)}>Send</button>
            <button onClick={() => alert(`Scan or receive using this public key:\n${userData.publicKey}`)} style={buttonStyle(dark, false)}>Receive QR</button>
            <button onClick={handleBluetoothPay} disabled={isBusy} style={buttonStyle(dark, false)}>Bluetooth Pay</button>
            <button onClick={() => setShowVaultForm((v) => !v)} style={buttonStyle(dark, false)}>Lock Vault</button>
          </div>
        </div>
      </div>

      {showVaultForm && (
        <div style={{ background: dark ? "#0f172a" : "#f8fafc", borderRadius: 18, padding: 16, border: `1px solid ${dark ? "#1f2a3a" : "#e2e8f0"}` }}>
          <h3 style={{ marginTop: 0 }}>Vault Lock</h3>
          <div style={{ display: "grid", gap: 10 }}>
            <input value={lockPercent} onChange={(e) => setLockPercent(e.target.value)} type="number" placeholder="Lock percentage" style={inputStyle(dark)} />
            <input value={lockDays} onChange={(e) => setLockDays(e.target.value)} type="number" placeholder="Lock days" style={inputStyle(dark)} />
            <input value={maturityDate} onChange={(e) => setMaturityDate(e.target.value)} type="date" style={inputStyle(dark)} />
            <button onClick={handleLockVault} disabled={isBusy} style={{ ...buttonStyle(dark, true), justifyContent: "center" }}>Lock Funds</button>
          </div>
        </div>
      )}

      <div style={{ background: dark ? "#08111f" : "#ffffff", borderRadius: 22, padding: 24, border: `1px solid ${dark ? "#1f2a3a" : "#e5e7eb"}` }}>
        <h3 style={{ marginTop: 0 }}>Credit Readiness</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <InfoCard label="Trust Score" value={`${userData?.trustScore || 72}/100`} dark={dark} />
          <InfoCard label="Max Credit" value={`${formatXlm(maxCredit)} XLM`} dark={dark} />
          <InfoCard label="Vault Locked" value={`${formatXlm(Number(userData?.vaultBalance || 0))} XLM`} dark={dark} />
        </div>
      </div>
    </div>
  );
};

const DriverContent: React.FC<{ userData: any; policy: any; onRefresh: () => void }> = ({ userData, policy, onRefresh }) => {
  const { dark } = useTheme();
  const [requestAmount, setRequestAmount] = useState("");
  const [activeRequest, setActiveRequest] = useState<any>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!userData?.uid) return;
    const q = query(collection(db, "fuel_requests"), where("driverId", "==", userData.uid), where("status", "in", ["pending", "active"]));
    return onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        setActiveRequest({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
      } else {
        setActiveRequest(null);
      }
    });
  }, [userData?.uid]);

  const handleRequestCredit = async () => {
    const amount = Number(requestAmount);
    if (!amount || amount <= 0) return alert("Enter a valid amount.");
    if (amount > Number(policy?.maxApprovedAmount || 100)) return alert("Amount exceeds the cooperative policy limit.");

    setIsBusy(true);
    try {
      await addDoc(collection(db, "fuel_requests"), {
        driverId: userData.uid,
        driverName: userData.displayName,
        driverPublicKey: userData.publicKey,
        coopId: userData.cooperativeId || "coop-demo",
        amount,
        approvedAmount: Math.min(amount, Number(policy?.maxApprovedAmount || 100)),
        interestRate: Number(policy?.interestRate || 3),
        durationDays: Number(policy?.durationDays || 30),
        status: "pending",
        createdAt: serverTimestamp(),
      });
      setRequestAmount("");
      alert("Fuel credit request submitted.");
      onRefresh();
    } finally {
      setIsBusy(false);
    }
  };

  const handleRepay = async () => {
    if (!activeRequest) return;
    setIsBusy(true);
    try {
      await updateDoc(doc(db, "fuel_requests", activeRequest.id), {
        status: "repaid",
        repaidAt: serverTimestamp(),
      });
      await setDoc(doc(db, "coop_stats", activeRequest.coopId), {
        poolBalance: increment(Number(activeRequest.amount)),
        totalRepaid: increment(Number(activeRequest.amount)),
        outstanding: increment(-Number(activeRequest.amount)),
      }, { merge: true });
      await addDoc(collection(db, "transactions"), {
        type: "repayment",
        from: userData.uid,
        to: activeRequest.coopId,
        amount: Number(activeRequest.amount),
        feeAdmin: 0.2,
        feeCoop: 0.3,
        status: "completed",
        createdAt: serverTimestamp(),
      });
      await refreshTrustScore(userData, Number(userData.trustScore || 72) + 4);
      onRefresh();
      alert("Repayment recorded and returned to the cooperative pool.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ background: dark ? "#08111f" : "#ffffff", borderRadius: 22, padding: 24, border: `1px solid ${dark ? "#1f2a3a" : "#e5e7eb"}` }}>
        <h2 style={{ marginTop: 0, fontSize: 24 }}>Driver Fuel Credit</h2>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ background: "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "#fff", borderRadius: 16, padding: 18 }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Active Trust Score</div>
            <div style={{ fontSize: 34, fontWeight: 900 }}>{userData?.trustScore || 72}/100</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <InfoCard label="Approved Limit" value={`${formatXlm(Number(policy?.maxApprovedAmount || 100))} XLM`} dark={dark} />
            <InfoCard label="Interest Rate" value={`${Number(policy?.interestRate || 3)}%`} dark={dark} />
            <InfoCard label="Repayment Duration" value={`${Number(policy?.durationDays || 30)} days`} dark={dark} />
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input value={requestAmount} onChange={(e) => setRequestAmount(e.target.value)} type="number" placeholder="Fuel credit amount" style={inputStyle(dark)} />
            <button onClick={handleRequestCredit} disabled={isBusy} style={buttonStyle(dark, true)}>Request Credit</button>
          </div>
        </div>
      </div>

      <div style={{ background: dark ? "#08111f" : "#ffffff", borderRadius: 22, padding: 24, border: `1px solid ${dark ? "#1f2a3a" : "#e5e7eb"}` }}>
        <h3 style={{ marginTop: 0 }}>Current Credit</h3>
        {!activeRequest ? (
          <div style={{ color: dark ? "#94a3b8" : "#64748b" }}>No active fuel credit.</div>
        ) : activeRequest.status === "pending" ? (
          <div style={{ background: dark ? "#1e293b" : "#fef3c7", padding: 12, borderRadius: 12 }}>Request is pending cooperative approval.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ background: dark ? "#1e293b" : "#fee2e2", padding: 12, borderRadius: 12 }}>
              You currently owe {formatXlm(Number(activeRequest.amount || 0))} XLM. Repayments return to the cooperative pool with a 0.2 XLM admin fee and 0.3 XLM cooperative fee.
            </div>
            <button onClick={handleRepay} disabled={isBusy} style={buttonStyle(dark, false)}>Repay Now</button>
>>>>>>> e6907c9
          </div>
        )}
      </div>
    </div>
  );
};

<<<<<<< HEAD
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
=======
const CooperativeContent: React.FC<{ userData: any; onRefresh: () => void }> = ({ userData, onRefresh }) => {
  const { dark } = useTheme();
  const [isBusy, setIsBusy] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [policy, setPolicy] = useState({ maxApprovedAmount: 100, interestRate: 3, durationDays: 30 });
  const [requests, setRequests] = useState<any[]>([]);
  const [stats, setStats] = useState({ poolBalance: 0, totalDeposited: 0, totalReleased: 0, totalRepaid: 0, outstanding: 0 });
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    if (!userData?.uid) return;
    const statsRef = doc(db, "coop_stats", userData.uid);
    const unsubStats = onSnapshot(statsRef, (snap) => {
      if (snap.exists()) setStats((snap.data() as any) || {});
    });

    const reqQuery = query(collection(db, "fuel_requests"), where("coopId", "==", userData.uid));
    const unsubReqs = onSnapshot(reqQuery, (snapshot) => {
      setRequests(snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })));
    });

    const txQuery = query(collection(db, "transactions"), where("to", "==", userData.uid));
    const unsubTx = onSnapshot(txQuery, (snapshot) => {
      setHistory(snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })));
    });

    const policyRef = doc(db, "app_config", "policy");
    const unsubPolicy = onSnapshot(policyRef, (snap) => {
      if (snap.exists()) setPolicy((snap.data() as any) || policy);
    });

    return () => {
      unsubStats();
      unsubReqs();
      unsubTx();
      unsubPolicy();
    };
  }, [userData?.uid]);

  const handleDeposit = async () => {
    const amount = Number(depositAmount);
    if (!amount || amount <= 0) return alert("Enter a valid amount.");

    setIsBusy(true);
    try {
      await setDoc(doc(db, "coop_stats", userData.uid), {
        poolBalance: increment(amount),
        totalDeposited: increment(amount),
        outstanding: increment(0),
      }, { merge: true });
      await addDoc(collection(db, "transactions"), {
        type: "deposit",
        from: userData.uid,
        to: userData.uid,
        amount,
        status: "completed",
        createdAt: serverTimestamp(),
      });
      setDepositAmount("");
      onRefresh();
      alert(`Deposited ${amount} XLM into the cooperative pool.`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleApprove = async (request: any) => {
    setIsBusy(true);
    try {
      await updateDoc(doc(db, "fuel_requests", request.id), {
        status: "active",
        approvedAt: serverTimestamp(),
      });
      await setDoc(doc(db, "coop_stats", userData.uid), {
        poolBalance: increment(-Number(request.amount)),
        totalReleased: increment(Number(request.amount)),
        outstanding: increment(Number(request.amount)),
      }, { merge: true });
      await addDoc(collection(db, "transactions"), {
        type: "credit_release",
        from: userData.uid,
        to: request.driverId,
        amount: Number(request.amount),
        status: "completed",
        createdAt: serverTimestamp(),
      });
      onRefresh();
      alert("Credit released from the cooperative pool.");
    } finally {
      setIsBusy(false);
    }
  };

  const savePolicy = async () => {
    await setDoc(doc(db, "app_config", "policy"), policy, { merge: true });
    alert("Policy updated.");
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ background: dark ? "#08111f" : "#ffffff", borderRadius: 22, padding: 24, border: `1px solid ${dark ? "#1f2a3a" : "#e5e7eb"}` }}>
        <h2 style={{ marginTop: 0, fontSize: 24 }}>Cooperative Pool</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          <InfoCard label="Pool Balance" value={`${formatXlm(Number(stats.poolBalance || 0))} XLM`} dark={dark} />
          <InfoCard label="Deposits" value={`${formatXlm(Number(stats.totalDeposited || 0))} XLM`} dark={dark} />
          <InfoCard label="Released" value={`${formatXlm(Number(stats.totalReleased || 0))} XLM`} dark={dark} />
          <InfoCard label="Outstanding" value={`${formatXlm(Number(stats.outstanding || 0))} XLM`} dark={dark} />
        </div>
      </div>

      <div style={{ background: dark ? "#08111f" : "#ffffff", borderRadius: 22, padding: 24, border: `1px solid ${dark ? "#1f2a3a" : "#e5e7eb"}` }}>
        <h3 style={{ marginTop: 0 }}>Pool Operations</h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <input value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} type="number" placeholder="Deposit amount" style={inputStyle(dark)} />
          <button onClick={handleDeposit} disabled={isBusy} style={buttonStyle(dark, true)}>Deposit Funds</button>
        </div>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", marginBottom: 12 }}>
          <input value={policy.maxApprovedAmount} onChange={(e) => setPolicy({ ...policy, maxApprovedAmount: Number(e.target.value) })} type="number" placeholder="Approval limit" style={inputStyle(dark)} />
          <input value={policy.interestRate} onChange={(e) => setPolicy({ ...policy, interestRate: Number(e.target.value) })} type="number" placeholder="Interest %" style={inputStyle(dark)} />
          <input value={policy.durationDays} onChange={(e) => setPolicy({ ...policy, durationDays: Number(e.target.value) })} type="number" placeholder="Duration days" style={inputStyle(dark)} />
          <button onClick={savePolicy} style={buttonStyle(dark, false)}>Save Policy</button>
        </div>
      </div>

      <div style={{ background: dark ? "#08111f" : "#ffffff", borderRadius: 22, padding: 24, border: `1px solid ${dark ? "#1f2a3a" : "#e5e7eb"}` }}>
        <h3 style={{ marginTop: 0 }}>Pending Requests</h3>
        {requests.filter((request) => request.status === "pending").length === 0 ? (
          <div style={{ color: dark ? "#94a3b8" : "#64748b" }}>No pending requests.</div>
        ) : requests.filter((request) => request.status === "pending").map((request) => (
          <div key={request.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${dark ? "#1f2a3a" : "#e5e7eb"}` }}>
            <div>
              <strong>{request.driverName}</strong> requested {formatXlm(Number(request.amount || 0))} XLM
            </div>
            <button onClick={() => handleApprove(request)} disabled={isBusy} style={buttonStyle(dark, true)}>Approve</button>
          </div>
        ))}
      </div>

      <div style={{ background: dark ? "#08111f" : "#ffffff", borderRadius: 22, padding: 24, border: `1px solid ${dark ? "#1f2a3a" : "#e5e7eb"}` }}>
        <h3 style={{ marginTop: 0 }}>Transaction History</h3>
        {history.length === 0 ? <div style={{ color: dark ? "#94a3b8" : "#64748b" }}>No activity yet.</div> : history.slice(0, 8).map((item) => (
          <div key={item.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${dark ? "#1f2a3a" : "#e5e7eb"}` }}>
            <span>{item.type}</span>
            <span>{formatXlm(Number(item.amount || 0))} XLM</span>
>>>>>>> e6907c9
          </div>
        ))}
      </div>
    </div>
  );
};

<<<<<<< HEAD
// ---------------------------------------------------------------------------
// UserDashboard (Entry Point)
// ---------------------------------------------------------------------------
=======
const InfoCard: React.FC<{ label: string; value: string; dark: boolean }> = ({ label, value, dark }) => (
  <div style={{ background: dark ? "#0f172a" : "#f8fafc", borderRadius: 16, padding: 14, border: `1px solid ${dark ? "#1f2a3a" : "#e2e8f0"}` }}>
    <div style={{ fontSize: 12, color: dark ? "#94a3b8" : "#64748b", marginBottom: 6 }}>{label}</div>
    <div style={{ fontWeight: 800, fontSize: 16 }}>{value}</div>
  </div>
);

const buttonStyle = (dark: boolean, primary: boolean) => ({
  border: "none",
  borderRadius: 999,
  padding: "10px 16px",
  fontWeight: 800,
  cursor: "pointer",
  background: primary ? (dark ? "#10b981" : "#0f766e") : (dark ? "#1f2937" : "#e2e8f0"),
  color: primary ? "#ffffff" : (dark ? "#f8fafc" : "#111827"),
});

const inputStyle = (dark: boolean) => ({
  border: `1px solid ${dark ? "#334155" : "#cbd5e1"}`,
  borderRadius: 999,
  padding: "10px 14px",
  minWidth: 180,
  background: dark ? "#0f172a" : "#ffffff",
  color: dark ? "#f8fafc" : "#111827",
});

>>>>>>> e6907c9
const UserDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState("wallet");
  const [userData, setUserData] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const navigate = useNavigate();

  const refreshUser = async (uid: string) => {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) setUserData({ uid, ...snap.data() });
  };

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        try {
<<<<<<< HEAD
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) setUserData(userDoc.data());
        } catch (error) { console.error("Database error."); }
      } else { navigate("/auth"); }
      setAuthLoading(false);
=======
          const profile = await ensureUserProfile(user);
          setUserData(profile);
          setAuthLoading(false);
          const userRef = doc(db, "users", user.uid);
          onSnapshot(userRef, (snap) => {
            if (snap.exists()) setUserData({ uid: user.uid, ...snap.data() });
          });
        } catch (error) {
          console.error("Database error", error);
          setAuthLoading(false);
        }
      } else {
        navigate("/auth");
      }
>>>>>>> e6907c9
    });
    return () => unsubscribe();
  }, [navigate]);

<<<<<<< HEAD
  if (authLoading || userData === null) return <LoadingWorkspace message="Loading Ecosystem Data..." />;
  if (userData.approved === false) return <LoadingWorkspace message="Verification Pending..." />;

  return (
    <UserLayout activeTab={activeTab} onTabChange={setActiveTab} userData={userData}>
      {userData.role === "driver" && <DriverContent userData={userData} />}
      {userData.role === "cooperative" && <CooperativeContent userData={userData} />}
      {!["driver", "cooperative"].includes(userData.role) && <CommuterContent userData={userData} />}
=======
  if (authLoading || userData === null) return <LoadingWorkspace message="Loading ecosystem data..." />;
  if (userData.approved === false) return <LoadingWorkspace message="Verification pending..." />;

  return (
    <UserLayout activeTab={activeTab} onTabChange={setActiveTab} userData={userData}>
      {userData.role === "driver" && <DriverContent userData={userData} policy={{ maxApprovedAmount: 100, interestRate: 3, durationDays: 30 }} onRefresh={() => refreshUser(userData.uid)} />}
      {userData.role === "cooperative" && <CooperativeContent userData={userData} onRefresh={() => refreshUser(userData.uid)} />}
      {!["driver", "cooperative"].includes(userData.role) && <CommuterContent userData={userData} onRefresh={() => refreshUser(userData.uid)} />}
>>>>>>> e6907c9
    </UserLayout>
  );
};

export default UserDashboard;