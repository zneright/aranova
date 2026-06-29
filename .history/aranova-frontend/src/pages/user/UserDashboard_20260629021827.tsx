import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "../../firebase/config";
import UserLayout, { useTheme } from "../../components/layout/UserLayout";
import LoadingWorkspace from "../../components/ui/LoadingWorkspace";

// ─── REAL BLOCKCHAIN IMPORTS (FIXED FOR NEW SDK VERSIONS) ───
import {
  Networks,
  TransactionBuilder,
  Operation,
  Asset,
  Horizon
} from "@stellar/stellar-sdk";

import { FreighterModule } from '@creit.tech/stellar-wallets-kit/modules/freighter';
import { xBullModule } from '@creit.tech/stellar-wallets-kit/modules/xbull';
import { LobstrModule } from '@creit.tech/stellar-wallets-kit/modules/lobstr';

// ---------------------------------------------------------------------------
// Global Constant Layer Config
// ---------------------------------------------------------------------------
const HORIZON_RPC_URL = "https://horizon-testnet.stellar.org";
const NETWORK_PASSPHRASE = Networks.TESTNET;

// ---------------------------------------------------------------------------
// SVG Icons
// ---------------------------------------------------------------------------
const IconScan = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M23 7V1h-6" /><path d="M1 7V1h6" /><path d="M23 17v6h-6" /><path d="M1 17v6h6" /><line x1="9" y1="9" x2="15" y2="9" /><line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="15" x2="15" y2="15" /></svg>);
const IconSend = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>);
const IconPending = () => (<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>);
const IconFuel = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 22v-8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8" /><path d="M4 12V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6" /><rect x="6" y="7" width="8" height="3" rx="1" /><path d="M17 10h1.5a1.5 1.5 0 0 1 1.5 1.5V14a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2v-2a4 4 0 0 0-4-4h-3" /></svg>);

// ---------------------------------------------------------------------------
// HELPER: SAFELY GET WALLET MODULE
// ---------------------------------------------------------------------------
const getActiveWalletModule = async () => {
  const modules = [new FreighterModule(), new xBullModule(), new LobstrModule()];
  for (const mod of modules) {
    try {
      if (await mod.isAvailable()) return mod;
    } catch (e) { /* ignore */ }
  }
  throw new Error("No active wallet extension found. Please unlock your wallet.");
};

// ---------------------------------------------------------------------------
// HELPER: AUTO-FUND ACCOUNT VIA FRIENDBOT
// ---------------------------------------------------------------------------
const fundWithFriendbot = async (publicKey: string) => {
  console.log(`Triggering Friendbot to fund account ${publicKey} on Testnet...`);
  try {
    const res = await fetch(`https://friendbot.stellar.org/?addr=${publicKey}`);
    await res.json();
    return true;
  } catch (error) {
    console.error("Friendbot funding failed:", error);
    return false;
  }
};

// ---------------------------------------------------------------------------
// HELPER: EXCHANGE RATES
// ---------------------------------------------------------------------------
const getLiveXlmToPhpRate = async (): Promise<number> => {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    const data = await res.json();
    if (data && data.rates && data.rates.PHP && data.rates.XLM) {
      const directRate = data.rates.PHP / data.rates.XLM;
      localStorage.setItem("aranova_cached_xlm_php_rate", String(directRate));
      return directRate;
    }
    throw new Error("Rates array missing");
  } catch (e) {
    return Number(localStorage.getItem("aranova_cached_xlm_php_rate")) || 7.65;
  }
};

// ---------------------------------------------------------------------------
// HELPER: REAL STELLAR NATIVE TRANSACTION (GUARANTEED WORKING)
// ---------------------------------------------------------------------------
const submitRealStellarPayment = async (senderPubKey: string, receiverPubKey: string, amountXlm: string) => {
  const horizon = new Horizon.Server(HORIZON_RPC_URL);

  // 1. Ensure Sender exists
  try {
    await horizon.loadAccount(senderPubKey);
  } catch (err: any) {
    if (err.name === "NotFoundError" || (err.response && err.response.status === 404)) {
      await fundWithFriendbot(senderPubKey);
      await new Promise(r => setTimeout(r, 4000));
    } else throw err;
  }

  // 2. Ensure Receiver exists (Required for Native Payment)
  try {
    await horizon.loadAccount(receiverPubKey);
  } catch (err: any) {
    if (err.name === "NotFoundError" || (err.response && err.response.status === 404)) {
      await fundWithFriendbot(receiverPubKey);
      await new Promise(r => setTimeout(r, 4000));
    } else throw err;
  }

  // 3. Load Sender Account for Sequence Number
  const account = await horizon.loadAccount(senderPubKey);
  const fee = await horizon.fetchBaseFee();

  // 4. Build Payment Transaction
  const tx = new TransactionBuilder(account, {
    fee: fee.toString(),
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(Operation.payment({
      destination: receiverPubKey,
      asset: Asset.native(),
      amount: amountXlm.toString()
    }))
    .setTimeout(60)
    .build();

  console.log(`Sending ${amountXlm} XLM to ${receiverPubKey}...`);

  // 5. Sign Transaction via Wallet (Removed invalid network key)
  const walletModule = await getActiveWalletModule();
  const signResult: any = await walletModule.signTransaction(tx.toXDR(), { networkPassphrase: NETWORK_PASSPHRASE });

  const signedXdr = typeof signResult === 'string' ? signResult : (signResult.signedXDR || signResult.signedTxXdr);
  if (!signedXdr) throw new Error("Failed to extract signed XDR from wallet.");

  const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);

  // 6. Submit to Network
  const response = await horizon.submitTransaction(signedTx as any);
  return response;
};

// ---------------------------------------------------------------------------
// SUB-COMPONENT: REAL LIVE BALANCE DISPLAY
// ---------------------------------------------------------------------------
const LiveWalletWidget: React.FC<{ userData: any, liveRate: number }> = ({ userData, liveRate }) => {
  const [balance, setBalance] = useState("0.00");

  const fetchBalance = () => {
    if (!userData?.publicKey) return;
    fetch(`${HORIZON_RPC_URL}/accounts/${userData.publicKey}`)
      .then(res => res.json())
      .then(data => {
        if (data.balances) {
          const xlm = data.balances.find((b: any) => b.asset_type === 'native');
          setBalance(xlm ? parseFloat(xlm.balance).toFixed(2) : "0.00");
        }
      }).catch(() => setBalance("0.00"));
  };

  useEffect(() => {
    fetchBalance();
    const interval = setInterval(fetchBalance, 10000);
    return () => clearInterval(interval);
  }, [userData]);

  const phpBalanceVal = (parseFloat(balance) * liveRate).toFixed(2);

  return (
    <div style={{ background: "linear-gradient(135deg, #10B981 0%, #064E3B 100%)", borderRadius: 24, padding: 28, color: "#fff", position: "relative", overflow: "hidden" }}>
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
// 1. DRIVER DASHBOARD
// ---------------------------------------------------------------------------
const DriverContent: React.FC<{ userData: any }> = ({ userData }) => {
  const { dark } = useTheme();
  const [coopWalletData, setCoopWalletData] = useState<string>("");
  const [liveRate, setLiveRate] = useState<number>(7.65);
  const [isProcessing, setIsProcessing] = useState(false);

  const t = { bgCard: dark ? "#1A1D27" : "#ffffff", border: dark ? "#2A2D3A" : "#E5E7EB", textPrim: dark ? "#F1F5F9" : "#111827", textMuted: dark ? "#94A3B8" : "#6B7280" };

  useEffect(() => {
    getLiveXlmToPhpRate().then(rate => setLiveRate(rate));
    if (userData?.cooperativeId) {
      getDoc(doc(db, "cooperatives", userData.cooperativeId)).then(docSnap => {
        if (docSnap.exists() && docSnap.data().publicKey) {
          setCoopWalletData(docSnap.data().publicKey);
        }
      });
    }
  }, [userData]);

  const handlePayFare = async () => {
    const dest = window.prompt("Enter recipient's Stellar Public Key:");
    if (!dest || dest.length !== 56) return alert("Invalid Public Key.");
    const amt = window.prompt("Enter amount to send (XLM):");
    if (!amt || isNaN(Number(amt))) return alert("Invalid amount.");

    setIsProcessing(true);
    try {
      await submitRealStellarPayment(userData.publicKey, dest, amt);
      alert(`Success! Sent ${amt} XLM.`);
    } catch (err: any) {
      alert("Payment Failed: " + err.message);
    } finally { setIsProcessing(false); }
  };

  const handleSettleDebt = async () => {
    if (!coopWalletData) return alert("Cooperative wallet not found.");
    const amt = window.prompt("Enter amount to repay to your Cooperative (XLM):");
    if (!amt || isNaN(Number(amt))) return;

    setIsProcessing(true);
    try {
      await submitRealStellarPayment(userData.publicKey, coopWalletData, amt);
      alert(`Successfully settled ${amt} XLM debt to your Cooperative!`);
    } catch (err: any) {
      alert("Repayment Failed: " + err.message);
    } finally { setIsProcessing(false); }
  };

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }} className="dash-grid">
        <div className="dash-col-main" style={{ gridColumn: "1 / 3", display: "flex", flexDirection: "column", gap: 20 }}>

          <LiveWalletWidget userData={userData} liveRate={liveRate} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div onClick={() => alert(`Your Public Key for receiving payments is:\n\n${userData.publicKey}`)} style={{ background: dark ? "#1F1A0A" : "#FFFBEB", border: `1px solid ${dark ? "#78350F" : "#F4D03F"}`, borderRadius: 20, padding: 22, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: dark ? "#292200" : "#FEF9C3", color: dark ? "#FBBF24" : "#92400E", display: "flex", alignItems: "center", justifyContent: "center" }}><IconScan /></div>
              <span style={{ fontWeight: 800, fontSize: 15, color: t.textPrim }}>Receive Fare</span>
            </div>
            <div onClick={handlePayFare} style={{ background: dark ? "#064E3B" : "#ECFDF5", border: `1px solid ${dark ? "#047857" : "#6EE7B7"}`, borderRadius: 20, padding: 22, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, cursor: isProcessing ? "not-allowed" : "pointer", opacity: isProcessing ? 0.6 : 1 }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: dark ? "#065F46" : "#D1FAE5", color: dark ? "#34D399" : "#059669", display: "flex", alignItems: "center", justifyContent: "center" }}><IconSend /></div>
              <span style={{ fontWeight: 800, fontSize: 15, color: dark ? "#34D399" : "#059669" }}>{isProcessing ? "Sending..." : "Send Funds"}</span>
            </div>
          </div>
        </div>

        <div className="dash-col-side" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderLeft: "4px solid #F59E0B", borderRadius: "0 20px 20px 0", padding: 20 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: t.textPrim, display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}><IconFuel /> Fuel Credit Status</div>
            <p style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.5, marginBottom: 16 }}>
              Fuel credit is managed and issued directly by your Cooperative Admin. Wait for them to send funds to your wallet.
            </p>
            <button onClick={handleSettleDebt} disabled={isProcessing} style={{ width: "100%", background: dark ? "#064E3B" : "#D1FAE5", color: dark ? "#34D399" : "#065F46", border: "none", borderRadius: 8, padding: "10px", fontWeight: 700, fontSize: 12, cursor: "pointer", opacity: isProcessing ? 0.6 : 1 }}>
              {isProcessing ? "Processing..." : "Settle Debt (Send to Coop)"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 2. COMMUTER DASHBOARD
// ---------------------------------------------------------------------------
const CommuterContent: React.FC<{ userData: any }> = ({ userData }) => {
  const { dark } = useTheme();
  const [liveRate, setLiveRate] = useState<number>(7.65);
  const [isProcessing, setIsProcessing] = useState(false);
  const t = { bgCard: dark ? "#1A1D27" : "#ffffff", border: dark ? "#2A2D3A" : "#E5E7EB", textPrim: dark ? "#F1F5F9" : "#111827", textMuted: dark ? "#94A3B8" : "#6B7280" };

  useEffect(() => { getLiveXlmToPhpRate().then(rate => setLiveRate(rate)); }, []);

  const handlePayFare = async () => {
    const dest = window.prompt("Enter Driver's Stellar Public Key:");
    if (!dest || dest.length !== 56) return alert("Invalid Public Key.");
    const amt = window.prompt("Enter Fare Amount (XLM):");
    if (!amt || isNaN(Number(amt))) return alert("Invalid amount.");

    setIsProcessing(true);
    try {
      await submitRealStellarPayment(userData.publicKey, dest, amt);
      alert(`Success! Sent ${amt} XLM to driver.`);
    } catch (err: any) {
      alert("Payment Failed: " + err.message);
    } finally { setIsProcessing(false); }
  };

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }} className="dash-grid">
        <div className="dash-col-main" style={{ gridColumn: "1 / 4", display: "flex", flexDirection: "column", gap: 20 }}>
          <LiveWalletWidget userData={userData} liveRate={liveRate} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div onClick={handlePayFare} style={{ background: dark ? "#064E3B" : "#ECFDF5", border: `1px solid ${dark ? "#047857" : "#6EE7B7"}`, borderRadius: 20, padding: 22, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, cursor: isProcessing ? "not-allowed" : "pointer", opacity: isProcessing ? 0.6 : 1 }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: dark ? "#065F46" : "#D1FAE5", color: dark ? "#34D399" : "#059669", display: "flex", alignItems: "center", center: "center" }}><IconSend /></div>
              <span style={{ fontWeight: 800, fontSize: 15, color: dark ? "#34D399" : "#059669" }}>{isProcessing ? "Sending..." : "Pay Fare"}</span>
            </div>
            <div onClick={() => alert(`Your Public Key for receiving funds is:\n\n${userData.publicKey}`)} style={{ background: dark ? "#1F1A0A" : "#FFFBEB", border: `1px solid ${dark ? "#78350F" : "#F4D03F"}`, borderRadius: 20, padding: 22, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, cursor: "pointer" }}>
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
// 3. COOPERATIVE DASHBOARD
// ---------------------------------------------------------------------------
const CooperativeContent: React.FC<{ userData: any }> = ({ userData }) => {
  const { dark } = useTheme();
  const [approvedDrivers, setApprovedDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveRate, setLiveRate] = useState<number>(7.65);
  const [isProcessing, setIsProcessing] = useState(false);

  const t = { bgCard: dark ? "#1A1D27" : "#ffffff", border: dark ? "#2A2D3A" : "#E5E7EB", textPrim: dark ? "#F1F5F9" : "#111827", textMuted: dark ? "#94A3B8" : "#6B7280" };

  const fetchDrivers = async () => {
    try {
      setLoading(true);
      getLiveXlmToPhpRate().then(rate => setLiveRate(rate));
      const qApproved = query(collection(db, "users"), where("role", "==", "driver"), where("cooperativeId", "==", userData.uid), where("approved", "==", true));
      const snapshotApproved = await getDocs(qApproved);
      const drivers: any[] = [];
      snapshotApproved.forEach(docSnap => drivers.push({ id: docSnap.id, ...docSnap.data() }));
      setApprovedDrivers(drivers);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { fetchDrivers(); }, []);

  const handleSendFuelCredit = async (driver: any) => {
    if (!driver.publicKey) return alert("This driver has not set up their wallet yet.");
    if (!userData.publicKey) return alert("You must connect your Cooperative Wallet first.");

    const amt = window.prompt(`Enter amount of XLM to send to ${driver.displayName} for Fuel Credit:`);
    if (!amt || isNaN(Number(amt))) return;

    setIsProcessing(true);
    try {
      await submitRealStellarPayment(userData.publicKey, driver.publicKey, amt);
      alert(`Success! Sent ${amt} XLM Fuel Credit to ${driver.displayName}.`);
    } catch (err: any) {
      alert("Fuel Credit Transfer Failed: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePayFare = async () => {
    const dest = window.prompt("Enter recipient's Stellar Public Key:");
    if (!dest || dest.length !== 56) return alert("Invalid Public Key.");
    const amt = window.prompt("Enter amount to send (XLM):");
    if (!amt || isNaN(Number(amt))) return alert("Invalid amount.");

    setIsProcessing(true);
    try {
      await submitRealStellarPayment(userData.publicKey, dest, amt);
      alert(`Success! Sent ${amt} XLM.`);
    } catch (err: any) {
      alert("Payment Failed: " + err.message);
    } finally { setIsProcessing(false); }
  };

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: t.textPrim, marginBottom: 20 }}>Cooperative Hub</h2>

      <div style={{ marginBottom: 24 }}>
        <LiveWalletWidget userData={userData} liveRate={liveRate} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
          <div onClick={() => alert(`Cooperative Receiving Address:\n\n${userData.publicKey}`)} style={{ background: dark ? "#1F1A0A" : "#FFFBEB", border: `1px solid ${dark ? "#78350F" : "#F4D03F"}`, borderRadius: 20, padding: 16, display: "flex", alignItems: "center", gap: 10, cursor: "pointer", justifyContent: "center" }}>
            <span style={{ fontWeight: 800, fontSize: 14, color: t.textPrim }}>View Receiving Address</span>
          </div>
          <div onClick={handlePayFare} style={{ background: dark ? "#064E3B" : "#ECFDF5", border: `1px solid ${dark ? "#047857" : "#6EE7B7"}`, borderRadius: 20, padding: 16, display: "flex", alignItems: "center", gap: 10, cursor: isProcessing ? "not-allowed" : "pointer", opacity: isProcessing ? 0.6 : 1, justifyContent: "center" }}>
            <span style={{ fontWeight: 800, fontSize: 14, color: dark ? "#34D399" : "#059669" }}>{isProcessing ? "Processing..." : "Send Custom Payment"}</span>
          </div>
        </div>
      </div>

      <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 20, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontWeight: 800, fontSize: 16, color: t.textPrim }}>Active Fleet & Fuel Issuance</h3>
          <button onClick={fetchDrivers} style={{ background: "transparent", border: `1px solid ${t.border}`, color: t.textPrim, padding: "6px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontWeight: 700 }}>Refresh Fleet</button>
        </div>

        {loading ? <p style={{ color: t.textMuted, fontSize: 13 }}>Loading drivers...</p> : approvedDrivers.length === 0 ? <p style={{ color: t.textMuted, fontSize: 13 }}>No approved drivers found.</p> : (
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${t.border}`, color: t.textMuted, fontSize: 13 }}>
                <th style={{ padding: "12px 0" }}>Driver Name</th>
                <th style={{ padding: "12px 0" }}>Vehicle Info</th>
                <th style={{ padding: "12px 0", textAlign: "right" }}>Fuel Action</th>
              </tr>
            </thead>
            <tbody>
              {approvedDrivers.map(d => (
                <tr key={d.id} style={{ borderBottom: `1px solid ${t.border}` }}>
                  <td style={{ padding: "12px 0", color: t.textPrim, fontWeight: 600, fontSize: 14 }}>{d.displayName}</td>
                  <td style={{ padding: "12px 0", color: t.textMuted, fontSize: 13 }}>
                    <span style={{ textTransform: "capitalize" }}>{d.vehicleType}</span> • {d.plateNumber}<br />
                    <span style={{ fontSize: 10, opacity: 0.7, wordBreak: "break-all" }}>{d.publicKey || "No wallet linked"}</span>
                  </td>
                  <td style={{ padding: "12px 0", textAlign: "right" }}>
                    <button onClick={() => handleSendFuelCredit(d)} disabled={isProcessing} style={{ background: "#F59E0B", color: "#fff", border: "none", padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: isProcessing ? "not-allowed" : "pointer", opacity: isProcessing ? 0.6 : 1 }}>
                      {isProcessing ? "Sending..." : "Send Fuel Credit"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
        } catch (error) { console.error("Error fetching user status:", error); }
      } else { navigate("/auth"); }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, [navigate]);

  if (authLoading || userData === null) return <LoadingWorkspace message="Connecting to Stellar Horizon Node..." />;

  if (userData.approved === false) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "#F8F9FA", fontFamily: "'Inter', sans-serif", padding: 20 }}>
        <div style={{ background: "#ffffff", padding: "40px", borderRadius: 24, boxShadow: "0 10px 40px rgba(0,0,0,0.05)", maxWidth: 400, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ width: 80, height: 80, background: "#FEF3C7", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}><IconPending /></div>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: "#111827", margin: "0 0 10px", letterSpacing: "-0.5px" }}>Verification Pending</h2>
          <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.6, margin: 0 }}>Your account documentation is currently under review. You will be granted access to the dashboard once approved.</p>
        </div>
      </div>
    );
  }

  if (userData.approved === true && userData.walletCreated === false) {
    navigate("/auth");
    return null;
  }

  return (
    <>
      <style>{`@media (max-width: 700px) { .dash-grid { grid-template-columns: 1fr !important; } .dash-col-main, .dash-col-side { grid-column: 1 !important; } }`}</style>
      <UserLayout activeTab={activeTab} onTabChange={setActiveTab} userData={userData}>
        {userData.role === "commuter" && <CommuterContent userData={userData} />}
        {userData.role === "driver" && <DriverContent userData={userData} />}
        {userData.role === "cooperative" && <CooperativeContent userData={userData} />}
        {!["commuter", "driver", "cooperative"].includes(userData.role) && <CommuterContent userData={userData} />}
      </UserLayout>
    </>
  );
};

export default UserDashboard;