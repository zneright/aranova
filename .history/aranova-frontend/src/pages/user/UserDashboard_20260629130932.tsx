import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc, collection, query, where, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../../firebase/config";
import UserLayout, { useTheme } from "../../components/layout/UserLayout";
import LoadingWorkspace from "../../components/ui/LoadingWorkspace";

// ─── CRYPTO IMPORT FOR LOCAL DECRYPTION ───
import CryptoJS from "crypto-js";

// ─── REAL BLOCKCHAIN IMPORTS ───
import {
  Networks,
  TransactionBuilder,
  Operation,
  Asset,
  Horizon,
  Claimant,
  Keypair,
  Contract,
  Address,
  SorobanRpc
} from "@stellar/stellar-sdk";

import { FreighterModule } from '@creit.tech/stellar-wallets-kit/modules/freighter';
import { xBullModule } from '@creit.tech/stellar-wallets-kit/modules/xbull';
import { LobstrModule } from '@creit.tech/stellar-wallets-kit/modules/lobstr';

// ---------------------------------------------------------------------------
// Global Constant Layer Config
// ---------------------------------------------------------------------------
const HORIZON_RPC_URL = "https://horizon-testnet.stellar.org";
const SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org"; // <--- ADD THIS
const NETWORK_PASSPHRASE = Networks.TESTNET;
const CONTRACT_ID = "CBKODGTL4BEG65F7IZZ2MWV3DNKXJ5LJJIA77TNIYSDL6N2BLDQOXGTO";
const NATIVE_XLM_CONTRACT_ID = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
// ---------------------------------------------------------------------------
// SVG Icons
// ---------------------------------------------------------------------------
const IconScan = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M23 7V1h-6" /><path d="M1 7V1h6" /><path d="M23 17v6h-6" /><path d="M1 17v6h6" /><line x1="9" y1="9" x2="15" y2="9" /><line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="15" x2="15" y2="15" /></svg>);
const IconSend = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>);
const IconPending = () => (<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>);
const IconFuel = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 22v-8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8" /><path d="M4 12V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6" /><rect x="6" y="7" width="8" height="3" rx="1" /><path d="M17 10h1.5a1.5 1.5 0 0 1 1.5 1.5V14a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2v-2a4 4 0 0 0-4-4h-3" /></svg>);

// ---------------------------------------------------------------------------
// Custom Confirmation Modal Component
// ---------------------------------------------------------------------------
const ConfirmationModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string | React.ReactNode;
  isDark: boolean
}> = ({ isOpen, onClose, onConfirm, title, message, isDark }) => {
  if (!isOpen) return null;
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}>
      <div style={{ background: isDark ? "#1A1D27" : "#fff", border: `1px solid ${isDark ? "#2A2D3A" : "#E5E7EB"}`, borderRadius: 20, padding: 30, width: "90%", maxWidth: 420, boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 20, fontWeight: 900, color: isDark ? "#F1F5F9" : "#111827" }}>{title}</h3>
        <div style={{ fontSize: 14, color: isDark ? "#94A3B8" : "#6B7280", lineHeight: 1.6, marginBottom: 24 }}>{message}</div>
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${isDark ? "#334155" : "#D1D5DB"}`, color: isDark ? "#F1F5F9" : "#374151", padding: "10px 18px", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
          <button onClick={() => { onConfirm(); onClose(); }} style={{ background: "#F59E0B", color: "#fff", border: "none", padding: "10px 18px", borderRadius: 8, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>Confirm & Sign</button>
        </div>
      </div>
    </div>
  );
};


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
    throw new Error("Rates missing");
  } catch (e) {
    return Number(localStorage.getItem("aranova_cached_xlm_php_rate")) || 7.65;
  }
};
// ---------------------------------------------------------------------------
// HELPER: SOROBAN SMART SIGNING ROUTER
// ---------------------------------------------------------------------------
const signAndSubmitSorobanTransaction = async (assembledTx: any, userData: any, sorobanServer: SorobanRpc.Server) => {
  let signedTx;

  if (userData?.encryptedSecretKey) {
    const pin = window.prompt("Enter your 4-6 digit Wallet PIN to authorize this smart contract execution:");
    if (!pin) throw new Error("Transaction cancelled.");

    try {
      const bytes = CryptoJS.AES.decrypt(userData.encryptedSecretKey, pin);
      const secretKey = bytes.toString(CryptoJS.enc.Utf8);
      const keypair = Keypair.fromSecret(secretKey);
      assembledTx.sign(keypair);
      signedTx = assembledTx;
    } catch (error) {
      throw new Error("Invalid PIN.");
    }
  } else {
    const walletModule = await getActiveWalletModule();
    const signResult: any = await walletModule.signTransaction(assembledTx.toXDR(), { networkPassphrase: NETWORK_PASSPHRASE });
    const signedXdr = typeof signResult === 'string' ? signResult : (signResult.signedXDR || signResult.signedTxXdr);
    signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  }

  // Submit to the Soroban RPC instead of Horizon
  const sendResponse = await sorobanServer.sendTransaction(signedTx);
  if (sendResponse.errorResultXdr) {
    throw new Error("Contract execution reverted on-chain.");
  }
  return sendResponse;
};
// ---------------------------------------------------------------------------
// HELPER: SMART SIGNING ROUTER
// ---------------------------------------------------------------------------
const signAndSubmitStellarTransaction = async (txBuilder: TransactionBuilder, userData: any, horizon: Horizon.Server) => {
  const tx = txBuilder.setTimeout(60).build();
  let signedTx;

  if (userData?.encryptedSecretKey) {
    const pin = window.prompt("Enter your 4-6 digit Wallet PIN to authorize this transaction:");
    if (!pin) throw new Error("Transaction cancelled. PIN is required to sign.");

    try {
      const bytes = CryptoJS.AES.decrypt(userData.encryptedSecretKey, pin);
      const secretKey = bytes.toString(CryptoJS.enc.Utf8);
      if (!secretKey) throw new Error("Decryption returned empty string.");

      const keypair = Keypair.fromSecret(secretKey);
      tx.sign(keypair);
      signedTx = tx;
    } catch (error) {
      throw new Error("Invalid PIN. Could not decrypt your wallet for signing.");
    }

  } else {
    const walletModule = await getActiveWalletModule();
    const signResult: any = await walletModule.signTransaction(tx.toXDR(), { networkPassphrase: NETWORK_PASSPHRASE });
    const signedXdr = typeof signResult === 'string' ? signResult : (signResult.signedXDR || signResult.signedTxXdr);
    if (!signedXdr) throw new Error("Wallet failed to return signed XDR.");
    signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  }

  const submitPromise = horizon.submitTransaction(signedTx as any);
  const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Network connection to Stellar Horizon timed out.")), 25000));

  return await Promise.race([submitPromise, timeoutPromise]);
};

// ---------------------------------------------------------------------------
// HELPER: REAL STELLAR NATIVE TRANSACTION
// ---------------------------------------------------------------------------
const submitRealStellarPayment = async (userData: any, receiverPubKey: string, amountXlm: string) => {
  const horizon = new Horizon.Server(HORIZON_RPC_URL);

  try {
    await horizon.loadAccount(userData.publicKey);
  } catch (err: any) {
    if (err.name === "NotFoundError" || (err.response && err.response.status === 404)) {
      await fundWithFriendbot(userData.publicKey);
      await new Promise(r => setTimeout(r, 4000));
    } else throw err;
  }

  try {
    await horizon.loadAccount(receiverPubKey);
  } catch (err: any) {
    if (err.name === "NotFoundError" || (err.response && err.response.status === 404)) {
      await fundWithFriendbot(receiverPubKey);
      await new Promise(r => setTimeout(r, 4000));
    } else throw err;
  }

  const account = await horizon.loadAccount(userData.publicKey);
  const fee = await horizon.fetchBaseFee();

  const txBuilder = new TransactionBuilder(account, {
    fee: fee.toString(),
    networkPassphrase: NETWORK_PASSPHRASE,
  }).addOperation(Operation.payment({
    destination: receiverPubKey,
    asset: Asset.native(),
    amount: amountXlm.toString()
  }));

  return await signAndSubmitStellarTransaction(txBuilder, userData, horizon);
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
  const [liveRate, setLiveRate] = useState<number>(7.65);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingAllocationId, setPendingAllocationId] = useState<string | null>(null);
  const [allocationAmount, setAllocationAmount] = useState<string>("0.00");

  const [coopPoolAvailable, setCoopPoolAvailable] = useState<number>(() =>
    Number(localStorage.getItem(`aranova_offline_pool_${userData?.cooperativeId}`)) || 0
  );

  const t = { bgCard: dark ? "#1A1D27" : "#ffffff", border: dark ? "#2A2D3A" : "#E5E7EB", textPrim: dark ? "#F1F5F9" : "#111827", textMuted: dark ? "#94A3B8" : "#6B7280" };

  const checkPendingOnChainAllocations = async () => {
    if (!userData?.publicKey) return;
    try {
      const res = await fetch(`${HORIZON_RPC_URL}/claimable_balances?claimant=${userData.publicKey}&asset=native`);
      const data = await res.json();
      if (data && data._embedded && data._embedded.records && data._embedded.records.length > 0) {
        const record = data._embedded.records[0];
        setPendingAllocationId(record.id);
        setAllocationAmount(record.amount);
      } else {
        setPendingAllocationId(null);
        setAllocationAmount("0.00");
      }
    } catch (e) {
      console.error("Error querying claimable balance arrays:", e);
    }
  };

  useEffect(() => {
    getLiveXlmToPhpRate().then(rate => setLiveRate(rate));
    checkPendingOnChainAllocations();
    const int = setInterval(checkPendingOnChainAllocations, 8000);
    return () => clearInterval(int);
  }, [userData]);

  useEffect(() => {
    if (userData?.cooperativeId) {
      getDoc(doc(db, "cooperatives", userData.cooperativeId)).then(docSnap => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const pool = data.globalPool || 0;
          setCoopPoolAvailable(pool);
          localStorage.setItem(`aranova_offline_pool_${userData.cooperativeId}`, String(pool));
        }
      }).catch(err => {
        const cached = localStorage.getItem(`aranova_offline_pool_${userData.cooperativeId}`);
        if (cached) setCoopPoolAvailable(Number(cached));
      });
    }
  }, [userData]);

  // FIXED: Full Soroban Pipeline (Simulate -> Assemble -> Sign -> Submit)
  const handleRepayFuelCredit = async () => {
    setIsProcessing(true);
    try {
      const horizon = new Horizon.Server(HORIZON_RPC_URL);
      const sorobanServer = new SorobanRpc.Server(SOROBAN_RPC_URL); // Use Soroban Server

      const account = await horizon.loadAccount(userData.publicKey);
      const aranovaContract = new Contract(CONTRACT_ID);

      // 1. Build Raw Transaction
      const rawTx = new TransactionBuilder(account, {
        fee: "100", // Placeholder fee, simulation will calculate the real one
        networkPassphrase: NETWORK_PASSPHRASE
      }).addOperation(
        aranovaContract.call(
          "repay_fuel_credit",
          new Address(userData.publicKey).toScVal(),
          new Address(NATIVE_XLM_CONTRACT_ID).toScVal()
        )
      ).setTimeout(30).build();

      // 2. Simulate the Transaction to get Footprint and Gas Fees
      const simResponse = await sorobanServer.simulateTransaction(rawTx);
      if (SorobanRpc.Api.isSimulationError(simResponse)) {
        throw new Error("Smart Contract Simulation failed: " + simResponse.error);
      }

      // 3. Assemble the Transaction (Attaches the footprint and exact fees)
      const assembledTx = SorobanRpc.assembleTransaction(rawTx, NETWORK_PASSPHRASE, simResponse).build();

      // 4. Sign and Submit via our new Soroban Helper
      await signAndSubmitSorobanTransaction(assembledTx, userData, sorobanServer);

      alert("Repayment successful! Fees routed dynamically based on your lib.rs.");
    } catch (err: any) {
      alert("Repayment failed: " + (err.message || err));
    } finally {
      setIsProcessing(false);
    }
  };
  const handleClaimAllocationOnChain = async () => {
    if (!pendingAllocationId) return;
    setIsProcessing(true);

    try {
      const horizon = new Horizon.Server(HORIZON_RPC_URL);

      let account;
      try {
        account = await horizon.loadAccount(userData.publicKey);
      } catch (err: any) {
        if (err.name === "NotFoundError" || (err.response && err.response.status === 404)) {
          await fundWithFriendbot(userData.publicKey);
          await new Promise(r => setTimeout(r, 4000));
          account = await horizon.loadAccount(userData.publicKey);
        } else throw err;
      }

      const fee = await horizon.fetchBaseFee();

      const txBuilder = new TransactionBuilder(account, {
        fee: fee.toString(),
        networkPassphrase: NETWORK_PASSPHRASE
      }).addOperation(Operation.claimClaimableBalance({
        balanceId: pendingAllocationId
      }));

      await signAndSubmitStellarTransaction(txBuilder, userData, horizon);

      alert(`Success! Instantly claimed ${allocationAmount} XLM from the Cooperative smart pool.`);
      setPendingAllocationId(null);
      setAllocationAmount("0.00");

      const balCache = localStorage.getItem(`aranova_cached_bal_${userData.uid}`);
      if (balCache) {
        localStorage.setItem(`aranova_cached_bal_${userData.uid}`, (Number(balCache) + Number(allocationAmount)).toFixed(2));
      }
    } catch (err: any) {
      alert("Claim execution failed: " + err.message);
    } finally { setIsProcessing(false); }
  };

  const handlePayFare = async () => {
    const dest = window.prompt("Enter recipient's Stellar Public Key:");
    if (!dest || dest.length !== 56) return alert("Invalid Public Key.");
    const amt = window.prompt("Enter amount to send (XLM):");
    if (!amt || isNaN(Number(amt))) return alert("Invalid amount.");

    setIsProcessing(true);
    try {
      await submitRealStellarPayment(userData, dest, amt);
      alert(`Success! Sent ${amt} XLM.`);
    } catch (err: any) {
      alert("Payment Failed: " + err.message);
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
            <div onClick={handleRepayFuelCredit} style={{ gridColumn: "1 / -1", background: "#F59E0B", borderRadius: 20, padding: 16, display: "flex", justifyContent: "center", alignItems: "center", gap: 10, cursor: isProcessing ? "not-allowed" : "pointer", opacity: isProcessing ? 0.6 : 1 }}>
              <span style={{ fontWeight: 800, fontSize: 15, color: "#fff" }}>{isProcessing ? "Processing..." : "Repay Fuel Credit (Smart Contract)"}</span>
            </div>
          </div>
        </div>

        <div className="dash-col-side" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderLeft: "4px solid #F59E0B", borderRadius: "0 20px 20px 0", padding: 20 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: t.textPrim, display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}><IconFuel /> Shared Smart Pool</div>
            <p style={{ fontSize: 11, color: t.textMuted, margin: "0 0 12px" }}>Available Cooperative Budget: {coopPoolAvailable} XLM (≈ ₱{(coopPoolAvailable * liveRate).toFixed(2)} PHP)</p>

            {pendingAllocationId ? (
              <div style={{ marginTop: 12 }}>
                <div style={{ background: dark ? "#291B00" : "#FEF3C7", padding: "12px", borderRadius: "10px", border: "1px solid #F59E0B", marginBottom: 14 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: dark ? "#FBBF24" : "#92400E", display: "block" }}>COOP ALLOCATION DETECTED</span>
                  <span style={{ fontSize: 20, fontWeight: 900, color: t.textPrim, marginTop: 4, display: "block" }}>{allocationAmount} XLM</span>
                </div>
                <button onClick={handleClaimAllocationOnChain} disabled={isProcessing} style={{ width: "100%", background: "#10B981", color: "#fff", border: "none", borderRadius: 8, padding: "12px", fontWeight: 800, fontSize: 13, cursor: "pointer", opacity: isProcessing ? 0.6 : 1 }}>
                  {isProcessing ? "Signing Execution..." : "Instantly Liquidate Credit"}
                </button>
              </div>
            ) : (
              <p style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.5, margin: "10px 0 0" }}>
                You are no longer restricted by an individual ceiling limit. You may draw any necessary amount up to the Cooperative's available Smart Pool balance.
              </p>
            )}
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
      await submitRealStellarPayment(userData, dest, amt);
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
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: dark ? "#065F46" : "#D1FAE5", color: dark ? "#34D399" : "#059669", display: "flex", alignItems: "center", justifyContent: "center" }}><IconSend /></div>
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

  const [globalPoolAmount, setGlobalPoolAmount] = useState<string>(() => localStorage.getItem(`aranova_pool_${userData?.uid}`) || "500");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [liveRate, setLiveRate] = useState<number>(7.65);
  const [isProcessing, setIsProcessing] = useState(false);

  const t = { bgCard: dark ? "#1A1D27" : "#ffffff", border: dark ? "#2A2D3A" : "#E5E7EB", textPrim: dark ? "#F1F5F9" : "#111827", textMuted: dark ? "#94A3B8" : "#6B7280" };

  const fetchDrivers = async () => {
    try {
      setLoading(true);
      getLiveXlmToPhpRate().then(rate => setLiveRate(rate));

      getDoc(doc(db, "cooperatives", userData.uid)).then(coopDoc => {
        if (coopDoc.exists()) {
          const data = coopDoc.data();
          if (data.globalPool) setGlobalPoolAmount(String(data.globalPool));
        }
      }).catch(err => console.warn("Offline mode active."));

      const qApproved = query(collection(db, "users"), where("role", "==", "driver"), where("cooperativeId", "==", userData.uid), where("approved", "==", true));
      const snapshotApproved = await getDocs(qApproved);
      const drivers: any[] = [];
      snapshotApproved.forEach(docSnap => drivers.push({ id: docSnap.id, ...docSnap.data() }));
      setApprovedDrivers(drivers);
    } catch (err) {
      console.error("Could not fetch drivers:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDrivers(); }, []);

  const syncToFirebaseBackground = (pool: number) => {
    setDoc(doc(db, "cooperatives", userData.uid), {
      globalPool: pool,
      publicKey: userData.publicKey,
      updatedAt: new Date().toISOString()
    }, { merge: true }).catch(() => { });
  };

  const handleUpdateSmartContractPool = async () => {
    setIsProcessing(true);
    const poolNum = Number(globalPoolAmount);

    try {
      const horizon = new Horizon.Server(HORIZON_RPC_URL);

      let account;
      try {
        account = await horizon.loadAccount(userData.publicKey);
      } catch (err: any) {
        if (err.name === "NotFoundError" || (err.response && err.response.status === 404)) {
          await fundWithFriendbot(userData.publicKey);
          await new Promise(r => setTimeout(r, 4000));
          account = await horizon.loadAccount(userData.publicKey);
        } else throw err;
      }

      const fee = await horizon.fetchBaseFee();
      const txBuilder = new TransactionBuilder(account, {
        fee: fee.toString(),
        networkPassphrase: NETWORK_PASSPHRASE
      });

      const splitAmount = poolNum / (approvedDrivers.length || 1);

      approvedDrivers.forEach((driver) => {
        if (driver.publicKey) {
          txBuilder.addOperation(Operation.createClaimableBalance({
            claimants: [new Claimant(driver.publicKey, Claimant.predicateUnconditional())],
            asset: Asset.native(),
            amount: splitAmount.toFixed(4)
          }));
        }
      });

      await signAndSubmitStellarTransaction(txBuilder, userData, horizon);

      syncToFirebaseBackground(poolNum);
      localStorage.setItem(`aranova_pool_${userData.uid}`, String(poolNum));

      alert(`Success! Smart Pool of ${poolNum} XLM initialized. Drivers can now draw dynamically.`);
    } catch (err: any) {
      alert("Pool Allocation Failed: " + (err.message || "User declined signature or network disconnected."));
    } finally {
      setIsProcessing(false);
    }
  };

  const attemptPoolUpdate = () => {
    if (!userData.publicKey) return alert("Hardware wallet initialization required.");
    if (approvedDrivers.length === 0) return alert("No active driver keys mapped to your fleet parameter vector yet.");

    const poolNum = Number(globalPoolAmount);
    if (isNaN(poolNum) || poolNum <= 0) return alert("Invalid pool amount.");

    setIsModalOpen(true);
  };

  const handlePayFare = async () => {
    const dest = window.prompt("Enter recipient's Stellar Public Key:");
    if (!dest || dest.length !== 56) return alert("Invalid Public Key.");
    const amt = window.prompt("Enter amount to send (XLM):");
    if (!amt || isNaN(Number(amt))) return alert("Invalid amount.");

    setIsProcessing(true);
    try {
      await submitRealStellarPayment(userData, dest, amt);
      alert(`Success! Sent ${amt} XLM.`);
    } catch (err: any) {
      alert("Payment Failed: " + err.message);
    } finally { setIsProcessing(false); }
  };

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>

      <ConfirmationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleUpdateSmartContractPool}
        isDark={dark}
        title="Confirm Smart Pool Setup"
        message={
          <>
            You are authorizing a total Global Pool of <strong>{globalPoolAmount} XLM</strong>.
            By signing this transaction, individual caps are removed, allowing any approved driver in your fleet to draw funds against this shared pool dynamically.
          </>
        }
      />

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

      <div style={{ background: dark ? "#3B210B" : "#FFFBEB", border: `1px solid ${dark ? "#78350F" : "#FDE68A"}`, borderRadius: 16, padding: "20px", marginBottom: 24 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 800, color: dark ? "#FCD34D" : "#92400E" }}>Smart Pool Configuration</h3>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 800, color: t.textMuted, marginBottom: 6 }}>TOTAL SHARED POOL (XLM)</label>
          <input type="number" value={globalPoolAmount} onChange={e => setGlobalPoolAmount(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "10px", borderRadius: 8, border: `1px solid ${dark ? "#78350F" : "#FDE68A"}`, background: dark ? "#451A03" : "#fff", color: t.textPrim, fontWeight: 700 }} />
          <span style={{ fontSize: 11, color: t.textMuted, display: "block", marginTop: 4 }}>≈ ₱{(Number(globalPoolAmount) * liveRate).toFixed(2)} PHP. Drivers can draw any amount up to this limit.</span>
        </div>

        <button onClick={attemptPoolUpdate} disabled={isProcessing} style={{ width: "100%", background: "#F59E0B", color: "#fff", border: "none", padding: "12px", borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: isProcessing ? "not-allowed" : "pointer", opacity: isProcessing ? 0.6 : 1 }}>
          {isProcessing ? "Processing Signature & Awaiting Network..." : "Sign & Bind Global Pool"}
        </button>
      </div>

      <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 20, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontWeight: 800, fontSize: 16, color: t.textPrim }}>Active Fleet Status</h3>
          <button onClick={fetchDrivers} style={{ background: "transparent", border: `1px solid ${t.border}`, color: t.textPrim, padding: "6px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontWeight: 700 }}>Refresh Fleet</button>
        </div>

        {loading ? <p style={{ color: t.textMuted, fontSize: 13 }}>Loading drivers...</p> : approvedDrivers.length === 0 ? <p style={{ color: t.textMuted, fontSize: 13 }}>No approved drivers found.</p> : (
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${t.border}`, color: t.textMuted, fontSize: 13 }}>
                <th style={{ padding: "12px 0" }}>Driver Name</th>
                <th style={{ padding: "12px 0" }}>Vehicle Info</th>
                <th style={{ padding: "12px 0", textAlign: "right" }}>Status Link</th>
              </tr>
            </thead>
            <tbody>
              {approvedDrivers.map(d => (
                <tr style={{ borderBottom: `1px solid ${t.border}` }} key={d.id}>
                  <td style={{ padding: "12px 0", color: t.textPrim, fontWeight: 600, fontSize: 14 }}>{d.displayName}</td>
                  <td style={{ padding: "12px 0", color: t.textMuted, fontSize: 13 }}>
                    <span style={{ textTransform: "capitalize" }}>{d.vehicleType}</span> • {d.plateNumber}<br />
                    <span style={{ fontSize: 10, opacity: 0.7, wordBreak: "break-all" }}>{d.publicKey || "No wallet linked"}</span>
                  </td>
                  <td style={{ padding: "12px 0", textAlign: "right", fontSize: 12, fontWeight: 700, color: "#10B981" }}>
                    POOL ACCESS MAPPED
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
          if (userDoc.exists()) {
            setUserData(userDoc.data());
            localStorage.setItem(`aranova_offline_user_${user.uid}`, JSON.stringify(userDoc.data()));
          }
        } catch (error) {
          console.error("Online user query timed out, checking offline storage...", error);
          const cachedUser = localStorage.getItem(`aranova_offline_user_${user.uid}`);
          if (cachedUser) setUserData(JSON.parse(cachedUser));
        }
      } else {
        navigate("/auth");
      }
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