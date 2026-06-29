import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc, collection, query, where, getDocs, updateDoc, deleteDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../../firebase/config";
import UserLayout, { useTheme } from "../../components/layout/UserLayout";
import LoadingWorkspace from "../../components/ui/LoadingWorkspace";

// ─── REAL BLOCKCHAIN IMPORTS ───
import * as StellarSdk from "@stellar/stellar-sdk";
import { signTransaction, isConnected } from "@stellar/freighter-api";

// ---------------------------------------------------------------------------
// Global Constant Layer Config
// ---------------------------------------------------------------------------
const ARANOVA_CONTRACT_ID = "CCT3YGPRWWIEHBVZQLZOIJ5GJX7Z5PYYF6ENCG3EKXCM3M7KX2QWWXJP";
const XLM_NATIVE_CONTRACT_ID = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"; // Testnet XLM
const PARTNER_PUMP_PUBLIC_KEY = "GDUY7J7A33TQWOSOQGDO776GVSWAO6AEH4M2B7G34V2YYRUM5A27A6I4"; // Test partner pump
const SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;

// ---------------------------------------------------------------------------
// SVG Icons
// ---------------------------------------------------------------------------
const IconScan = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M23 7V1h-6" /><path d="M1 7V1h6" /><path d="M23 17v6h-6" /><path d="M1 17v6h6" /><line x1="9" y1="9" x2="15" y2="9" /><line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="15" x2="15" y2="15" /></svg>);
const IconLock = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>);
const IconAdd = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>);
const IconSend = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>);
const IconPending = () => (<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>);
const IconExternalLink = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 4 }}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>);
const IconFuel = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 22v-8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8" /><path d="M4 12V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6" /><rect x="6" y="7" width="8" height="3" rx="1" /><path d="M17 10h1.5a1.5 1.5 0 0 1 1.5 1.5V14a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2v-2a4 4 0 0 0-4-4h-3" /></svg>);
const IconWallet = () => (<svg width="20" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M16 11h4" /></svg>);

// ---------------------------------------------------------------------------
// HELPER: CENTRALIZED TRUSTED CONVERSION PIPELINE
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
// HELPER: REAL SOROBAN TRANSACTION SUBMITTER
// ---------------------------------------------------------------------------
const submitRealSorobanTransaction = async (publicKey: string, method: string, args: StellarSdk.xdr.ScVal[]) => {
  if (!(await isConnected())) throw new Error("Freighter wallet is not connected.");

  const server = new StellarSdk.SorobanRpc.Server(SOROBAN_RPC_URL);
  const account = await server.getAccount(publicKey);
  const contract = new StellarSdk.Contract(ARANOVA_CONTRACT_ID);

  const operation = contract.call(method, ...args);

  let tx = new StellarSdk.TransactionBuilder(account, {
    fee: "10000",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(operation)
    .setTimeout(30)
    .build();

  // 1. Simulate on network
  const simulated = await server.simulateTransaction(tx);
  if (StellarSdk.SorobanRpc.Api.isSimulationError(simulated)) {
    throw new Error(typeof simulated.error === 'string' ? simulated.error : "Simulation Failed. Check logic limits.");
  }

  // 2. Assemble resources
  tx = StellarSdk.SorobanRpc.assembleTransaction(tx, simulated) as StellarSdk.Transaction;

  // 3. Sign with Freighter
  const signedXdr = await signTransaction(tx.toXDR(), { networkPassphrase: NETWORK_PASSPHRASE });
  const signedTx = StellarSdk.TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);

  // 4. Send to Network
  const sendResponse = await server.sendTransaction(signedTx);
  if (sendResponse.status === "ERROR") throw new Error("Transaction submission rejected by network.");

  // 5. Poll for confirmation
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const statusResponse = await server.getTransaction(sendResponse.hash);
    if (statusResponse.status !== "NOT_FOUND") {
      if (statusResponse.status === "SUCCESS") return statusResponse;
      throw new Error("Transaction failed on-chain.");
    }
  }
  throw new Error("Transaction timed out.");
};

// ---------------------------------------------------------------------------
// DEDICATED MULTI-WALLET MANAGER COMPONENT
// ---------------------------------------------------------------------------
interface WalletItem { address: string; isMain: boolean; hasActiveLoan: boolean; label: string; }

const DedicatedWalletManager: React.FC<{ userData: any; userRole: string }> = ({ userData, userRole }) => {
  const { dark } = useTheme();
  const [wallets, setWallets] = useState<WalletItem[]>([]);
  const [newAddress, setNewAddress] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [showManager, setShowManager] = useState(false);

  useEffect(() => {
    const cached = localStorage.getItem(`aranova_wallets_${userData?.uid}`);
    if (cached) { setWallets(JSON.parse(cached)); }
    else if (userData?.publicKey) {
      const initial: WalletItem[] = [{ address: userData.publicKey, isMain: true, hasActiveLoan: false, label: "Primary Node Key" }];
      setWallets(initial);
      localStorage.setItem(`aranova_wallets_${userData.uid}`, JSON.stringify(initial));
    }
  }, [userData]);

  const saveAndSync = (updated: WalletItem[]) => {
    setWallets(updated);
    localStorage.setItem(`aranova_wallets_${userData?.uid}`, JSON.stringify(updated));
    const mainWallet = updated.find(w => w.isMain);
    if (mainWallet && auth.currentUser) {
      updateDoc(doc(db, "users", auth.currentUser.uid), { publicKey: mainWallet.address }).catch(err => console.error(err));
    }
  };

  const handleAddWallet = () => {
    if (!newAddress.startsWith("G") || newAddress.length !== 56) return alert("Invalid Stellar Public Key.");
    if (wallets.some(w => w.address === newAddress)) return alert("Account layer already parsed.");
    saveAndSync([...wallets, { address: newAddress, isMain: wallets.length === 0, hasActiveLoan: false, label: newLabel.trim() || `Sub-Key Node ${wallets.length + 1}` }]);
    setNewAddress(""); setNewLabel("");
  };

  const handleSetMain = (targetAddress: string) => {
    if (userRole === "driver") return alert("Drivers are locked to their validated primary cooperative key.");
    saveAndSync(wallets.map(w => ({ ...w, isMain: w.address === targetAddress })));
  };

  const handleRemoveWallet = (targetAddress: string) => {
    const target = wallets.find(w => w.address === targetAddress);
    if (!target) return;
    if (target.isMain) return alert("Validation Error: Cannot purge main asset wrapper.");
    if (target.hasActiveLoan) return alert("Transaction Lock: Outstanding loan liabilities found.");
    if (window.confirm("Purge selected wallet node parameter?")) saveAndSync(wallets.filter(w => w.address !== targetAddress));
  };

  const t = { bg: dark ? "#13151F" : "#F3F4F6", border: dark ? "#2A2D3A" : "#E5E7EB", card: dark ? "#1A1D27" : "#FFFFFF", text: dark ? "#F1F5F9" : "#111827", muted: dark ? "#94A3B8" : "#6B7280" };

  return (
    <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 20, padding: 20, marginBottom: 20 }}>
      <button onClick={() => setShowManager(!showManager)} style={{ width: "100%", background: "none", border: "none", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", color: t.text, padding: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 800, fontSize: 15 }}><IconWallet /> Dedicated Wallet Management Field</div>
        <span style={{ fontSize: 12, color: dark ? "#7DB3FF" : "#1652C9", fontWeight: 700 }}>{showManager ? "Hide System Keys" : "View All Keys"}</span>
      </button>

      {showManager && (
        <div style={{ marginTop: 20, borderTop: `1px solid ${t.border}`, paddingTop: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
            {wallets.map(w => (
              <div key={w.address} style={{ background: t.bg, borderRadius: 12, padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 800, fontSize: 13, color: t.text }}>{w.label}</span>
                    {w.isMain && <span style={{ background: dark ? "#052E16" : "#D1FAE5", color: dark ? "#4ADE80" : "#065F46", fontSize: 9, fontWeight: 900, padding: "2px 6px", borderRadius: 4 }}>MAIN</span>}
                  </div>
                  <code style={{ fontSize: 11, color: t.muted, display: "block", marginTop: 4, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{w.address}</code>
                </div>
                <div style={{ display: "flex", gap: 8, shrink: 0 }}>
                  {!w.isMain && userRole !== "driver" && <button onClick={() => handleSetMain(w.address)} style={{ background: "#1652C9", color: "#fff", border: "none", padding: "6px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Make Main</button>}
                  {!w.isMain && <button onClick={() => handleRemoveWallet(w.address)} style={{ background: "#EF4444", color: "#fff", border: "none", padding: "6px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Remove</button>}
                </div>
              </div>
            ))}
          </div>
          <div style={{ background: t.bg, padding: 14, borderRadius: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: t.text }}>Register New Wallet Array</span>
            <input type="text" placeholder="Wallet Title Node (e.g. Ledger Backup)" value={newLabel} onChange={e => setNewLabel(e.target.value)} style={{ padding: 10, borderRadius: 8, border: `1px solid ${t.border}`, background: t.card, color: t.text, fontSize: 13 }} />
            <input type="text" placeholder="G... (Stellar Public Key Reference Array)" value={newAddress} onChange={e => setNewAddress(e.target.value)} style={{ padding: 10, borderRadius: 8, border: `1px solid ${t.border}`, background: t.card, color: t.text, fontSize: 13 }} />
            <button onClick={handleAddWallet} style={{ background: "linear-gradient(135deg, #1652C9, #10B981)", color: "#fff", border: "none", padding: 12, borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Inject Node Vector</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// SUB-COMPONENT: REUSABLE TRUSTLINE ACCORDION
// ---------------------------------------------------------------------------
const TrustlinesView: React.FC<{ publicKey: string; dark: boolean }> = ({ publicKey, dark }) => {
  const [mockTrustlines, setMockTrustlines] = useState<any[]>([]);
  const [showLines, setShowTrustlines] = useState(false);

  useEffect(() => {
    if (publicKey) {
      setMockTrustlines([
        { asset_code: "PHPNode", balance: "420.00" },
        { asset_code: "FuelToken", balance: "75.50" }
      ]);
    }
  }, [publicKey]);

  if (!publicKey) return null;

  return (
    <div style={{ marginTop: 16, borderTop: `1px solid ${dark ? "#2A2D3A" : "rgba(255,255,255,0.2)"}`, paddingTop: 12 }}>
      <button onClick={() => setShowTrustlines(!showLines)} style={{ background: "none", border: "none", color: dark ? "#7DB3FF" : "#ffffff", fontWeight: 700, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: 0 }}>
        {showLines ? "Hide Sub-Ledger Trustlines ▲" : "View Auxiliary Network Trustlines ▼"}
      </button>
      {showLines && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          {mockTrustlines.map((tl, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(0,0,0,0.15)", padding: "8px 12px", borderRadius: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#FFF" }}>{tl.asset_code}</span>
              <span style={{ fontSize: 12, fontWeight: 900, color: "#FCD34D" }}>{tl.balance} <span style={{ fontSize: 10, opacity: 0.7 }}>UNITS</span></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// SUB-COMPONENT: SMART VAULT WIDGET
// ---------------------------------------------------------------------------
const SmartVaultWidget: React.FC<{ userData: any }> = ({ userData }) => {
  const { dark } = useTheme();
  const [isActive, setIsActive] = useState(false);
  const [savePercentage, setSavePercentage] = useState(10);
  const [duration, setDuration] = useState(30);

  const t = { bgCard: dark ? "#1A1D27" : "#ffffff", border: dark ? "#2A2D3A" : "#E5E7EB", textPrim: dark ? "#F1F5F9" : "#111827", textMuted: dark ? "#94A3B8" : "#6B7280" };

  const handleUpdateVault = async () => {
    try {
      // Real Blockchain Call for configure_vault
      const args = [
        new StellarSdk.Address(userData.publicKey).toScVal(),
        StellarSdk.xdr.ScVal.scvBool(isActive),
        StellarSdk.nativeToScVal(savePercentage * 100, { type: 'i128' }), // BPS conversion
        StellarSdk.nativeToScVal(duration, { type: 'u64' })
      ];
      await submitRealSorobanTransaction(userData.publicKey, "configure_vault", args);
      alert(`Smart Vault synced on-chain! ${savePercentage}% of incoming payments will be securely locked.`);
    } catch (err: any) {
      alert("Vault configuration failed: " + err.message);
    }
  };

  return (
    <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 20, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ fontWeight: 800, fontSize: 15, color: t.textPrim, margin: 0, display: "flex", alignItems: "center", gap: 6 }}><IconLock /> Smart Vault</h3>
        <label style={{ display: "flex", alignItems: "center", cursor: "pointer", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: isActive ? "#10B981" : t.textMuted }}>{isActive ? "ACTIVE" : "OFF"}</span>
          <div style={{ position: "relative", width: 44, height: 24, background: isActive ? "#10B981" : dark ? "#334155" : "#CBD5E1", borderRadius: 12, transition: "0.3s" }}>
            <div style={{ position: "absolute", top: 2, left: isActive ? 22 : 2, width: 20, height: 20, background: "#fff", borderRadius: "50%", transition: "0.3s" }} onClick={() => setIsActive(!isActive)} />
          </div>
        </label>
      </div>

      <div style={{ opacity: isActive ? 1 : 0.4, pointerEvents: isActive ? "auto" : "none", transition: "0.3s" }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, color: t.textMuted, marginBottom: 8 }}>
            <span>Auto-Save Cut</span>
            <span style={{ color: t.textPrim }}>{savePercentage}%</span>
          </div>
          <input type="range" min="1" max="50" value={savePercentage} onChange={(e) => setSavePercentage(Number(e.target.value))} style={{ width: "100%", accentColor: "#10B981" }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: t.textMuted, marginBottom: 8 }}>Lock Duration (Boost Multiplier)</span>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setDuration(7)} style={{ flex: 1, padding: 8, borderRadius: 8, border: `1px solid ${duration === 7 ? "#10B981" : t.border}`, background: duration === 7 ? (dark ? "#064E3B" : "#D1FAE5") : "transparent", color: duration === 7 ? "#10B981" : t.textPrim, fontWeight: 700, cursor: "pointer" }}>7 Days</button>
            <button onClick={() => setDuration(30)} style={{ flex: 1, padding: 8, borderRadius: 8, border: `1px solid ${duration === 30 ? "#10B981" : t.border}`, background: duration === 30 ? (dark ? "#064E3B" : "#D1FAE5") : "transparent", color: duration === 30 ? "#10B981" : t.textPrim, fontWeight: 700, cursor: "pointer" }}>30 Days</button>
          </div>
        </div>
        <button onClick={handleUpdateVault} style={{ width: "100%", background: "#10B981", color: "#fff", border: "none", borderRadius: 8, padding: 10, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Sync On-Chain Settings</button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 1. DRIVER DASHBOARD
// ---------------------------------------------------------------------------
const DriverContent: React.FC<{ userData: any }> = ({ userData }) => {
  const { dark } = useTheme();
  const [balance, setBalance] = useState("0.00");
  const [coopCeiling, setCoopCeiling] = useState<number>(8);
  const [coopWalletData, setCoopWalletData] = useState<string>("");
  const [customRequestAmount, setCustomRequestAmount] = useState<string>("");
  const [trustScore, setTrustScore] = useState<number>(720);
  const [liveRate, setLiveRate] = useState<number>(7.65);
  const [isProcessingContract, setIsProcessingContract] = useState(false);

  const t = { bgCard: dark ? "#1A1D27" : "#ffffff", border: dark ? "#2A2D3A" : "#E5E7EB", textPrim: dark ? "#F1F5F9" : "#111827", textMuted: dark ? "#94A3B8" : "#6B7280", blueText: dark ? "#7DB3FF" : "#1652C9" };

  useEffect(() => {
    const isOnline = navigator.onLine;
    getLiveXlmToPhpRate().then(rate => setLiveRate(rate));

    if (userData?.cooperativeId) {
      if (!isOnline) {
        setCoopCeiling(Number(localStorage.getItem(`aranova_offline_limit_${userData.cooperativeId}`)) || 8);
      } else {
        getDoc(doc(db, "cooperatives", userData.cooperativeId)).then(docSnap => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setCoopCeiling(data.fuelCreditLimit || 8);
            if (data.publicKey) setCoopWalletData(data.publicKey);
            localStorage.setItem(`aranova_offline_limit_${userData.cooperativeId}`, String(data.fuelCreditLimit || 8));
          }
        }).catch(() => setCoopCeiling(8));
      }
    }

    setTrustScore(userData?.baseTrustScore || 700);

    if (!userData?.publicKey) return setBalance("0.00");
    const networkUrl = userData?.network === "TESTNET" ? "https://horizon-testnet.stellar.org" : "https://horizon.stellar.org";
    fetch(`${networkUrl}/accounts/${userData.publicKey}`)
      .then(res => res.json())
      .then(data => {
        if (data.balances) {
          const xlm = data.balances.find((b: any) => b.asset_type === 'native');
          setBalance(xlm ? parseFloat(xlm.balance).toFixed(2) : "0.00");
        }
      }).catch(() => setBalance("0.00"));
  }, [userData]);

  const executeFuelCreditContract = async () => {
    const requestedAmt = Number(customRequestAmount);
    if (!requestedAmt || requestedAmt <= 0) return alert("Please designate a clear transaction volume.");

    setIsProcessingContract(true);
    try {
      // ── REGULAR PAYMENT VERIFICATION (DRIVER LIQUIDITY CHECK) ──
      const networkUrl = userData?.network === "TESTNET" ? "https://horizon-testnet.stellar.org" : "https://horizon.stellar.org";
      const driverRes = await fetch(`${networkUrl}/accounts/${userData.publicKey}`);

      if (!driverRes.ok) {
        throw new Error("Network Error: Could not verify your wallet status on the blockchain.");
      }

      const driverData = await driverRes.json();
      const driverNativeBalance = driverData.balances.find((b: any) => b.asset_type === 'native');

      // Check if Driver has the money to pay the gas station directly
      if (!driverNativeBalance || parseFloat(driverNativeBalance.balance) < requestedAmt) {
        throw new Error(`Transaction Blocked: You do not have enough funds (Current Balance: ${driverNativeBalance ? parseFloat(driverNativeBalance.balance).toFixed(2) : "0"} XLM) to pay ${requestedAmt} XLM.`);
      }

      // ── STANDARD STELLAR PAYMENT TO GAS STATION ──
      if (!(await isConnected())) throw new Error("Freighter wallet is not connected.");

      const server = new StellarSdk.SorobanRpc.Server(SOROBAN_RPC_URL);
      const account = await server.getAccount(userData.publicKey);

      // Build a standard Payment Operation
      let tx = new StellarSdk.TransactionBuilder(account, {
        fee: "10000",
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(StellarSdk.Operation.payment({
          destination: PARTNER_PUMP_PUBLIC_KEY,
          asset: StellarSdk.Asset.native(),
          amount: requestedAmt.toString()
        }))
        .setTimeout(30)
        .build();

      const signedXdr = await signTransaction(tx.toXDR(), { networkPassphrase: NETWORK_PASSPHRASE });
      const signedTx = StellarSdk.TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);

      const sendResponse = await server.sendTransaction(signedTx);
      if (sendResponse.status === "ERROR") throw new Error("Transaction submission rejected by network.");

      // Poll for confirmation
      let success = false;
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const statusResponse = await server.getTransaction(sendResponse.hash);
        if (statusResponse.status !== "NOT_FOUND") {
          if (statusResponse.status === "SUCCESS") {
            success = true;
            break;
          }
          throw new Error("Transaction failed on-chain.");
        }
      }

      if (!success) throw new Error("Transaction timed out.");

      alert(`Payment Successful! ${requestedAmt} XLM paid directly to the Gas Station from your wallet.`);
      setCustomRequestAmount("");

      // Optimistically update local balance UI
      setBalance(prev => (parseFloat(prev) - requestedAmt).toFixed(2));

    } catch (error: any) {
      alert("Payment execution failed: " + error.message);
    }
    finally { setIsProcessingContract(false); }
  };
  const executeRepayCreditContract = async () => {
    setIsProcessingContract(true);
    try {
      // ── REAL SOROBAN CALL: repay_fuel_credit ──
      const args = [
        new StellarSdk.Address(userData.publicKey).toScVal(),
        new StellarSdk.Address(XLM_NATIVE_CONTRACT_ID).toScVal()
      ];

      await submitRealSorobanTransaction(userData.publicKey, "repay_fuel_credit", args);

      alert("Debt Settled On-Chain! Trust Score boosted by +5 points for timely repayment.");
      setTrustScore(prev => prev + 5);

      // Update local balance UI
      const networkUrl = "https://horizon-testnet.stellar.org";
      const res = await fetch(`${networkUrl}/accounts/${userData.publicKey}`);
      const data = await res.json();
      if (data.balances) {
        const xlm = data.balances.find((b: any) => b.asset_type === 'native');
        setBalance(xlm ? parseFloat(xlm.balance).toFixed(2) : balance);
      }
    } catch (error: any) {
      alert("Failed to settle debt: " + error.message);
    }
    finally { setIsProcessingContract(false); }
  };

  const triggerBluetoothPaymentReceive = () => {
    alert("Bluetooth Ad-Hoc Fare Received! Awaiting network sync...");
    setTrustScore(prev => prev + 1);
  };

  const phpBalanceVal = (parseFloat(balance) * liveRate).toFixed(2);
  const phpLimitVal = (coopCeiling * liveRate).toFixed(2);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <DedicatedWalletManager userData={userData} userRole="driver" />
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: dark ? "#1A2644" : "#EEF4FF", border: `1px solid ${dark ? "rgba(79,142,247,.3)" : "rgba(22,82,201,.2)"}`, borderRadius: 20, padding: "6px 14px" }}>
          <span style={{ position: "relative", width: 10, height: 10, borderRadius: "50%", background: t.blueText, display: "inline-block", animation: "aranovapulse 2s infinite" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: t.blueText, letterSpacing: ".4px", textTransform: "uppercase" }}>Bluetooth Ready — Offline Cache Layer Engaged</span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }} className="dash-grid">
        <div className="dash-col-main" style={{ gridColumn: "1 / 3", display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ background: "linear-gradient(135deg, #1652C9 0%, #0A1931 100%)", borderRadius: 24, padding: 28, color: "#fff", position: "relative", overflow: "hidden" }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.65)", marginBottom: 6 }}>Available Balance (Live API Matrix)</p>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, margin: "6px 0" }}>
              <span style={{ fontSize: 52, fontWeight: 900, letterSpacing: -2, lineHeight: 1 }}>{balance}</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,.55)", marginLeft: 4 }}>XLM</span>
              <span style={{ fontSize: 18, fontWeight: 600, color: "#FCD34D", marginLeft: 12 }}>≈ ₱{phpBalanceVal} PHP</span>
            </div>
            <TrustlinesView publicKey={userData?.publicKey} dark={dark} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div onClick={triggerBluetoothPaymentReceive} style={{ background: dark ? "#1F1A0A" : "#FFFBEB", border: `1px solid ${dark ? "#78350F" : "#F4D03F"}`, borderRadius: 20, padding: 22, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: dark ? "#292200" : "#FEF9C3", color: dark ? "#FBBF24" : "#92400E", display: "flex", alignItems: "center", justifyContent: "center" }}><IconScan /></div>
              <span style={{ fontWeight: 800, fontSize: 15, color: t.textPrim }}>Receive Fare</span>
              <span style={{ fontSize: 11, color: t.textMuted, textAlign: "center" }}>Scan offline Bluetooth payments</span>
            </div>
            <div onClick={() => alert("Initiating outbound transaction... (process_payment)")} style={{ background: dark ? "#064E3B" : "#ECFDF5", border: `1px solid ${dark ? "#047857" : "#6EE7B7"}`, borderRadius: 20, padding: 22, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: dark ? "#065F46" : "#D1FAE5", color: dark ? "#34D399" : "#059669", display: "flex", alignItems: "center", justifyContent: "center" }}><IconSend /></div>
              <span style={{ fontWeight: 800, fontSize: 15, color: dark ? "#34D399" : "#059669" }}>Send Funds</span>
              <span style={{ fontSize: 11, color: t.textMuted, textAlign: "center" }}>Pay co-ops, stores, or commuters</span>
            </div>
          </div>
        </div>

        <div className="dash-col-side" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderLeft: "4px solid #22C55E", borderRadius: "0 20px 20px 0", padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14, color: t.textPrim }}>Soroban Trust Score</div>
                <div style={{ display: "inline-block", marginTop: 4, background: dark ? "#052E16" : "#F0FDF4", color: dark ? "#4ADE80" : "#15803D", fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 12, letterSpacing: ".4px" }}>ON-CHAIN INTEGRITY</div>
              </div>
              <span style={{ fontSize: 38, fontWeight: 900, color: t.blueText }}>{trustScore}</span>
            </div>
          </div>

          <SmartVaultWidget userData={userData} />

          <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderLeft: "4px solid #F59E0B", borderRadius: "0 20px 20px 0", padding: 20 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: t.textPrim, display: "flex", alignItems: "center", gap: 6 }}><IconFuel /> Coop Fuel Credit</div>
            <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4, marginBottom: 10 }}>Maximum limit: {coopCeiling} XLM (≈ ₱{phpLimitVal} PHP)</div>

            <input type="number" placeholder="Set advance value..." value={customRequestAmount} onChange={e => setCustomRequestAmount(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: 8, border: `1px solid ${t.border}`, background: dark ? "#13151F" : "#F9FAFB", color: t.textPrim, fontWeight: 700, outline: "none", boxSizing: "border-box", marginBottom: 10 }} />

            <button onClick={executeFuelCreditContract} disabled={isProcessingContract} style={{ width: "100%", background: dark ? "#451A03" : "#FEF3C7", color: dark ? "#FCD34D" : "#92400E", border: "none", borderRadius: 8, padding: "10px", fontWeight: 700, fontSize: 12, cursor: "pointer", opacity: isProcessingContract ? 0.6 : 1, marginBottom: 8 }}>
              {isProcessingContract ? "Processing XDR..." : "Request Fuel Advance"}
            </button>

            <button onClick={executeRepayCreditContract} disabled={isProcessingContract} style={{ width: "100%", background: dark ? "#064E3B" : "#D1FAE5", color: dark ? "#34D399" : "#065F46", border: "none", borderRadius: 8, padding: "10px", fontWeight: 700, fontSize: 12, cursor: "pointer", opacity: isProcessingContract ? 0.6 : 1 }}>
              {isProcessingContract ? "Settling On-Chain..." : "One-Click Settle Debt"}
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
  const [balance, setBalance] = useState("0.00");
  const [liveRate, setLiveRate] = useState<number>(7.65);
  const [trustScore, setTrustScore] = useState<number>(700);

  const t = { bgCard: dark ? "#1A1D27" : "#ffffff", border: dark ? "#2A2D3A" : "#E5E7EB", textPrim: dark ? "#F1F5F9" : "#111827", textMuted: dark ? "#94A3B8" : "#6B7280", blueText: dark ? "#7DB3FF" : "#1652C9" };

  useEffect(() => {
    getLiveXlmToPhpRate().then(rate => setLiveRate(rate));
    setTrustScore(userData?.baseTrustScore || 700);

    if (!userData?.publicKey) return setBalance("0.00");
    const networkUrl = userData?.network === "TESTNET" ? "https://horizon-testnet.stellar.org" : "https://horizon.stellar.org";
    fetch(`${networkUrl}/accounts/${userData.publicKey}`)
      .then(res => res.json())
      .then(data => {
        if (data.balances) {
          const xlm = data.balances.find((b: any) => b.asset_type === 'native');
          setBalance(xlm ? parseFloat(xlm.balance).toFixed(2) : "0.00");
        }
      }).catch(() => setBalance("0.00"));
  }, [userData]);

  const triggerBluetoothOfflinePayment = () => {
    alert("Bluetooth Offline Ad-Hoc Mesh Payment successfully signed and delivered! It will sync when connected.");
    setTrustScore(prev => prev + 1);
  };

  const phpBalanceVal = (parseFloat(balance) * liveRate).toFixed(2);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <DedicatedWalletManager userData={userData} userRole="commuter" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }} className="dash-grid">
        <div className="dash-col-main" style={{ gridColumn: "1 / 3", display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ background: "linear-gradient(135deg, #10B981 0%, #064E3B 100%)", borderRadius: 24, padding: 28, color: "#fff", position: "relative", overflow: "hidden" }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.8)", marginBottom: 6 }}>Live Wallet Balance</p>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, margin: "6px 0" }}>
              <span style={{ fontSize: 52, fontWeight: 900, letterSpacing: -2, lineHeight: 1 }}>{balance}</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,.8)", marginLeft: 4 }}>XLM</span>
              <span style={{ fontSize: 18, fontWeight: 600, color: "#FFFBEB", marginLeft: 12 }}>≈ ₱{phpBalanceVal} PHP</span>
            </div>
            <TrustlinesView publicKey={userData?.publicKey} dark={dark} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div onClick={triggerBluetoothOfflinePayment} style={{ background: dark ? "#064E3B" : "#ECFDF5", border: `1px solid ${dark ? "#047857" : "#6EE7B7"}`, borderRadius: 20, padding: 22, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: dark ? "#065F46" : "#D1FAE5", color: dark ? "#34D399" : "#059669", display: "flex", alignItems: "center", justifyContent: "center" }}><IconSend /></div>
              <span style={{ fontWeight: 800, fontSize: 15, color: dark ? "#34D399" : "#059669" }}>Pay Fare</span>
              <span style={{ fontSize: 11, color: t.textMuted, textAlign: "center" }}>Send payment via Bluetooth/QR</span>
            </div>
            <div onClick={() => alert("Ready to receive funds.")} style={{ background: dark ? "#1F1A0A" : "#FFFBEB", border: `1px solid ${dark ? "#78350F" : "#F4D03F"}`, borderRadius: 20, padding: 22, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: dark ? "#292200" : "#FEF9C3", color: dark ? "#FBBF24" : "#92400E", display: "flex", alignItems: "center", justifyContent: "center" }}><IconScan /></div>
              <span style={{ fontWeight: 800, fontSize: 15, color: t.textPrim }}>Receive Funds</span>
              <span style={{ fontSize: 11, color: t.textMuted, textAlign: "center" }}>Scan to accept XLM</span>
            </div>
          </div>
        </div>

        <div className="dash-col-side" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderLeft: "4px solid #22C55E", borderRadius: "0 20px 20px 0", padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14, color: t.textPrim }}>Soroban Trust Score</div>
                <div style={{ display: "inline-block", marginTop: 4, background: dark ? "#052E16" : "#F0FDF4", color: dark ? "#4ADE80" : "#15803D", fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 12, letterSpacing: ".4px" }}>ON-CHAIN INTEGRITY</div>
              </div>
              <span style={{ fontSize: 38, fontWeight: 900, color: t.blueText }}>{trustScore}</span>
            </div>
          </div>
          <SmartVaultWidget userData={userData} />
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
  const [pendingDrivers, setPendingDrivers] = useState<any[]>([]);
  const [approvedDriversCount, setApprovedDriversCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [coopLimitInput, setCoopLimitInput] = useState<number>(8);
  const [liveRate, setLiveRate] = useState<number>(7.65);

  const t = { bgCard: dark ? "#1A1D27" : "#ffffff", border: dark ? "#2A2D3A" : "#E5E7EB", textPrim: dark ? "#F1F5F9" : "#111827", textMuted: dark ? "#94A3B8" : "#6B7280" };

  const fetchDrivers = async () => {
    try {
      setLoading(true);
      getLiveXlmToPhpRate().then(rate => setLiveRate(rate));

      const coopDoc = await getDoc(doc(db, "cooperatives", userData.uid));
      if (coopDoc.exists()) setCoopLimitInput(coopDoc.data().fuelCreditLimit || 8);
      else setCoopLimitInput(8);

      const qPending = query(collection(db, "users"), where("role", "==", "driver"), where("cooperativeId", "==", userData.uid), where("approved", "==", false));
      const snapshotPending = await getDocs(qPending);
      const drivers: any[] = [];
      snapshotPending.forEach(docSnap => drivers.push({ id: docSnap.id, ...docSnap.data() }));
      setPendingDrivers(drivers);

      const qApproved = query(collection(db, "users"), where("role", "==", "driver"), where("cooperativeId", "==", userData.uid), where("approved", "==", true));
      const snapshotApproved = await getDocs(qApproved);
      setApprovedDriversCount(snapshotApproved.size);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { fetchDrivers(); }, []);

  const handleUpdateLimit = async () => {
    try {
      if (!userData.publicKey) return alert("You must connect your Cooperative Wallet first to sign this transaction.");

      // REAL ON-CHAIN CALL to set limit
      const args = [
        new StellarSdk.Address(userData.publicKey).toScVal(), // Coop
        new StellarSdk.Address(userData.publicKey).toScVal(), // Driver (Dummy value just for setting global limit, or modify contract)
        StellarSdk.nativeToScVal(coopLimitInput, { type: 'i128' })
      ];
      await submitRealSorobanTransaction(userData.publicKey, "set_driver_limit", args);

      await setDoc(doc(db, "cooperatives", userData.uid), { fuelCreditLimit: coopLimitInput, publicKey: userData.publicKey, updatedAt: new Date().toISOString() }, { merge: true });
      alert("Cooperative ceiling metrics successfully verified on-chain and saved.");
    } catch (err: any) { alert("Contract limit failed: " + err.message); }
  };

  const handleApprove = async (driver: any) => {
    try {
      await updateDoc(doc(db, "users", driver.id), { approved: true, coopStatus: "approved" });
      setPendingDrivers(prev => prev.filter(d => d.id !== driver.id));
      setApprovedDriversCount(prev => prev + 1);
      alert(`Driver ${driver.displayName} approved.`);
    } catch (error) {
      console.error(error);
      alert("Error: Transaction failed. Driver not approved.");
    }
  };

  const handleDecline = async (id: string) => {
    if (!window.confirm("Delete this driver application?")) return;
    try {
      await deleteDoc(doc(db, "users", id));
      setPendingDrivers(prev => prev.filter(d => d.id !== id));
    } catch (error) { alert("Error: You do not have permission to delete this driver."); }
  };

  const phpCoopLimitVal = (coopLimitInput * liveRate).toFixed(2);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <DedicatedWalletManager userData={userData} userRole="cooperative" />
      <h2 style={{ fontSize: 24, fontWeight: 800, color: t.textPrim, marginBottom: 20 }}>Cooperative Management</h2>

      <div style={{ background: dark ? "#3B210B" : "#FFFBEB", border: `1px solid ${dark ? "#78350F" : "#FDE68A"}`, borderRadius: 16, padding: "16px 20px", marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14, color: dark ? "#FCD34D" : "#92400E" }}>Driver Fuel Credit Limit</div>
          <div style={{ fontSize: 12, color: dark ? "#D97706" : "#B45309", marginTop: 4 }}>Set the max available XLM advance for verified drivers via Soroban parameters. Current value: ≈ ₱{phpCoopLimitVal} PHP</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input type="number" value={coopLimitInput} onChange={e => setCoopLimitInput(Number(e.target.value))} style={{ width: 80, padding: "8px", borderRadius: 8, border: `1px solid ${dark ? "#78350F" : "#FDE68A"}`, background: dark ? "#451A03" : "#fff", color: t.textPrim, fontWeight: 700 }} />
          <button onClick={handleUpdateLimit} style={{ background: "#F59E0B", color: "#fff", border: "none", padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Save</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 20, marginBottom: 24 }}>
        <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 20, padding: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: t.textMuted, textTransform: "uppercase" }}>Total Approved Fleet</p>
          <p style={{ fontSize: 32, fontWeight: 900, color: t.textPrim, marginTop: 8 }}>{loading ? "..." : approvedDriversCount} <span style={{ fontSize: 14 }}>Drivers</span></p>
        </div>
        <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderLeft: "4px solid #F59E0B", borderRadius: 20, padding: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: t.textMuted, textTransform: "uppercase" }}>Pending Applications</p>
          <p style={{ fontSize: 32, fontWeight: 900, color: "#F59E0B", marginTop: 8 }}>{pendingDrivers.length}</p>
        </div>
      </div>

      <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 20, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontWeight: 800, fontSize: 16, color: t.textPrim }}>Pending Driver Approvals</h3>
          <button onClick={fetchDrivers} style={{ background: "transparent", border: `1px solid ${t.border}`, color: t.textPrim, padding: "6px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontWeight: 700 }}>Refresh</button>
        </div>

        {loading ? <p style={{ color: t.textMuted, fontSize: 13 }}>Loading...</p> : pendingDrivers.length === 0 ? <p style={{ color: t.textMuted, fontSize: 13 }}>No pending applications found.</p> : (
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${t.border}`, color: t.textMuted, fontSize: 13 }}>
                <th style={{ padding: "12px 0" }}>Driver Name</th>
                <th style={{ padding: "12px 0" }}>Vehicle & Plate</th>
                <th style={{ padding: "12px 0" }}>Phone</th>
                <th style={{ padding: "12px 0", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingDrivers.map(d => (
                <tr key={d.id} style={{ borderBottom: `1px solid ${t.border}` }}>
                  <td style={{ padding: "12px 0", color: t.textPrim, fontWeight: 600, fontSize: 14 }}>{d.displayName}</td>
                  <td style={{ padding: "12px 0", color: t.textPrim, fontSize: 14 }}><span style={{ textTransform: "capitalize" }}>{d.vehicleType}</span> • {d.plateNumber}</td>
                  <td style={{ padding: "12px 0", color: t.textMuted, fontSize: 14 }}>{d.phone}</td>
                  <td style={{ padding: "12px 0", textAlign: "right" }}>
                    <button onClick={() => handleApprove(d)} style={{ background: "#10B981", color: "#fff", border: "none", padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, marginRight: 8, cursor: "pointer" }}>Approve</button>
                    <button onClick={() => handleDecline(d.id)} style={{ background: "#EF4444", color: "#fff", border: "none", padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Decline</button>
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
  const { dark } = useTheme();
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

  if (authLoading || userData === null) return <LoadingWorkspace message="Verifying credentials and compiling your ledger nodes..." dark={dark} />;

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