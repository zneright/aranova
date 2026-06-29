import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc, collection, query, where, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../../firebase/config";
import UserLayout, { useTheme } from "../../components/layout/UserLayout";
import LoadingWorkspace from "../../components/ui/LoadingWorkspace";

// ─── REAL BLOCKCHAIN IMPORTS ───
import {
  Networks,
  TransactionBuilder,
  Operation,
  Asset,
  Horizon,
  Claimant,
  Keypair,
  SorobanRpc,
  Contract,
  xdr,
  Address,
  nativeToScVal
} from "@stellar/stellar-sdk";

import { FreighterModule } from '@creit.tech/stellar-wallets-kit/modules/freighter';
import { xBullModule } from '@creit.tech/stellar-wallets-kit/modules/xbull';
import { LobstrModule } from '@creit.tech/stellar-wallets-kit/modules/lobstr';

// ---------------------------------------------------------------------------
// Global Constant Layer Config
// ---------------------------------------------------------------------------
const HORIZON_RPC_URL = "https://horizon-testnet.stellar.org";
const SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = Networks.TESTNET;
const ARANOVA_CONTRACT_ID = "CCT3YGPRWWIEHBVZQLZOIJ5GJX7Z5PYYF6ENCG3EKXCM3M7KX2QWWXJP"; // Your Contract ID
const XLM_NATIVE_CONTRACT_ID = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

// ---------------------------------------------------------------------------
// SVG Icons
// ---------------------------------------------------------------------------
const IconScan = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M23 7V1h-6" /><path d="M1 7V1h6" /><path d="M23 17v6h-6" /><path d="M1 17v6h6" /><line x1="9" y1="9" x2="15" y2="9" /><line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="15" x2="15" y2="15" /></svg>);
const IconSend = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>);
const IconPending = () => (<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>);
const IconFuel = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 22v-8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8" /><path d="M4 12V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6" /><rect x="6" y="7" width="8" height="3" rx="1" /><path d="M17 10h1.5a1.5 1.5 0 0 1 1.5 1.5V14a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2v-2a4 4 0 0 0-4-4h-3" /></svg>);

// ---------------------------------------------------------------------------
// HELPER: REUSABLE UI MODAL COMPONENT
// ---------------------------------------------------------------------------
const ActionModal: React.FC<{
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmText: string;
  isProcessing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  dark: boolean;
}> = ({ isOpen, title, message, confirmText, isProcessing, onConfirm, onCancel, dark }) => {
  if (!isOpen) return null;

  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}>
      <div style={{ background: dark ? "#1A1D27" : "#ffffff", padding: "24px", borderRadius: "20px", maxWidth: "420px", width: "100%", border: `1px solid ${dark ? "#2A2D3A" : "#E5E7EB"}`, boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)" }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 20, fontWeight: 900, color: dark ? "#F1F5F9" : "#111827" }}>{title}</h3>
        <div style={{ fontSize: 14, color: dark ? "#94A3B8" : "#4B5563", lineHeight: 1.5, marginBottom: "24px" }}>
          {message}
        </div>
        <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
          <button onClick={onCancel} disabled={isProcessing} style={{ padding: "10px 16px", borderRadius: "10px", border: `1px solid ${dark ? "#334155" : "#D1D5DB"}`, background: "transparent", color: dark ? "#F8FAFC" : "#374151", fontWeight: 700, cursor: isProcessing ? "not-allowed" : "pointer" }}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={isProcessing} style={{ padding: "10px 16px", borderRadius: "10px", border: "none", background: "#10B981", color: "#fff", fontWeight: 700, cursor: isProcessing ? "not-allowed" : "pointer", opacity: isProcessing ? 0.7 : 1 }}>
            {isProcessing ? "Processing..." : confirmText}
          </button>
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
// HELPER: SOROBAN SMART CONTRACT CALLER
// ---------------------------------------------------------------------------
const invokeSorobanContract = async (method: string, args: xdr.ScVal[], publicKey: string) => {
  const server = new SorobanRpc.Server(SOROBAN_RPC_URL);
  const account = await server.getAccount(publicKey);
  const contract = new Contract(ARANOVA_CONTRACT_ID);

  const operation = contract.call(method, ...args);

  let tx = new TransactionBuilder(account, {
    fee: "10000",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(operation)
    .setTimeout(30)
    .build();

  // 1. Simulate
  const simulated = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(simulated)) {
    throw new Error(typeof simulated.error === 'string' ? simulated.error : "Simulation Failed.");
  }

  // 2. Assemble
  tx = SorobanRpc.assembleTransaction(tx, simulated) as any;

  // 3. Sign
  const walletModule = await getActiveWalletModule();
  const signResult: any = await walletModule.signTransaction(tx.toXDR(), { networkPassphrase: NETWORK_PASSPHRASE });
  const signedXdr = typeof signResult === 'string' ? signResult : (signResult.signedXDR || signResult.signedTxXdr);
  const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);

  // 4. Submit
  const sendResponse = await server.sendTransaction(signedTx as any);
  if (sendResponse.status === "ERROR") throw new Error("Transaction rejected by network.");

  // 5. Poll
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
// 1. DRIVER DASHBOARD
// ---------------------------------------------------------------------------
const DriverContent: React.FC<{ userData: any }> = ({ userData }) => {
  const { dark } = useTheme();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);

  const t = { bgCard: dark ? "#1A1D27" : "#ffffff", border: dark ? "#2A2D3A" : "#E5E7EB", textPrim: dark ? "#F1F5F9" : "#111827", textMuted: dark ? "#94A3B8" : "#6B7280" };

  const handleSettleFuelCredit = async () => {
    setIsProcessing(true);
    try {
      if (!userData.publicKey) throw new Error("Wallet not connected.");

      // Prep args for AranovaContract::repay_fuel_credit
      const args = [
        new Address(userData.publicKey).toScVal(),
        new Address(XLM_NATIVE_CONTRACT_ID).toScVal()
      ];

      await invokeSorobanContract("repay_fuel_credit", args, userData.publicKey);

      alert("Success! Your debt has been settled on-chain and your Trust Score was evaluated.");
      setIsSettleModalOpen(false);
    } catch (err: any) {
      alert("Contract Execution Failed: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>

      <ActionModal
        isOpen={isSettleModalOpen}
        title="Settle Fuel Credit"
        message="This will invoke the Soroban Smart Contract to deduct the principal amount plus the required Admin (0.2%) and Coop (0.3%) logic fees. Are you ready to sign?"
        confirmText="Sign Contract"
        isProcessing={isProcessing}
        onConfirm={handleSettleFuelCredit}
        onCancel={() => setIsSettleModalOpen(false)}
        dark={dark}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
        <div style={{ gridColumn: "1 / 3", display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Assume LiveWalletWidget is here */}
          <div style={{ background: "linear-gradient(135deg, #10B981 0%, #064E3B 100%)", borderRadius: 24, padding: 28, color: "#fff" }}>
            <h2>Driver Active Wallet</h2>
            <p>PubKey: {userData.publicKey}</p>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderLeft: "4px solid #F59E0B", borderRadius: "0 20px 20px 0", padding: 20 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: t.textPrim, display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
              <IconFuel /> Active Loan Management
            </div>

            <button onClick={() => setIsSettleModalOpen(true)} disabled={isProcessing} style={{ width: "100%", background: "#10B981", color: "#fff", border: "none", borderRadius: 8, padding: "12px", fontWeight: 800, fontSize: 13, cursor: "pointer", opacity: isProcessing ? 0.6 : 1 }}>
              Settle Credit via Smart Contract
            </button>
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
  const [globalPoolAmount, setGlobalPoolAmount] = useState<string>("500");
  const [driverCeiling, setDriverCeiling] = useState<string>("50");

  const [isProcessing, setIsProcessing] = useState(false);
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);

  const t = { bgCard: dark ? "#1A1D27" : "#ffffff", border: dark ? "#2A2D3A" : "#E5E7EB", textPrim: dark ? "#F1F5F9" : "#111827", textMuted: dark ? "#94A3B8" : "#6B7280" };

  useEffect(() => {
    const fetchDrivers = async () => {
      const qApproved = query(collection(db, "users"), where("role", "==", "driver"), where("cooperativeId", "==", userData.uid), where("approved", "==", true));
      const snapshotApproved = await getDocs(qApproved);
      const drivers: any[] = [];
      snapshotApproved.forEach(docSnap => drivers.push({ id: docSnap.id, ...docSnap.data() }));
      setApprovedDrivers(drivers);
    };
    fetchDrivers();
  }, [userData]);

  const poolNum = Number(globalPoolAmount);
  const ceilingNum = Number(driverCeiling);
  let calculatedAllocation = approvedDrivers.length > 0 ? poolNum / approvedDrivers.length : 0;
  if (calculatedAllocation > ceilingNum) calculatedAllocation = ceilingNum;
  const finalAllocationXLM = calculatedAllocation.toFixed(4);
  const actualTotalSpent = (Number(finalAllocationXLM) * approvedDrivers.length).toFixed(4);

  const executeFleetDistribution = async () => {
    setIsProcessing(true);
    try {
      const horizon = new Horizon.Server(HORIZON_RPC_URL);
      const account = await horizon.loadAccount(userData.publicKey);
      const fee = await horizon.fetchBaseFee();

      const txBuilder = new TransactionBuilder(account, { fee: fee.toString(), networkPassphrase: NETWORK_PASSPHRASE });

      approvedDrivers.forEach((driver) => {
        if (driver.publicKey) {
          txBuilder.addOperation(Operation.createClaimableBalance({
            claimants: [new Claimant(driver.publicKey, Claimant.predicateUnconditional())],
            asset: Asset.native(),
            amount: finalAllocationXLM
          }));
        }
      });

      const tx = txBuilder.setTimeout(60).build();
      const walletModule = await getActiveWalletModule();

      const signResult: any = await walletModule.signTransaction(tx.toXDR(), { networkPassphrase: NETWORK_PASSPHRASE });
      const signedXdr = typeof signResult === 'string' ? signResult : (signResult.signedXDR || signResult.signedTxXdr);

      const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
      await horizon.submitTransaction(signedTx as any);

      alert(`Success! ${finalAllocationXLM} XLM was routed to all approved drivers.`);
      setIsDeployModalOpen(false);
    } catch (err: any) {
      alert("Allocation Failed: " + (err.message || "Network error."));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: t.textPrim, marginBottom: 20 }}>Cooperative Hub</h2>

      <ActionModal
        isOpen={isDeployModalOpen}
        title="Deploy Fleet Matrix"
        message={
          <>
            <p><strong>Global Pool:</strong> {poolNum} XLM</p>
            <p><strong>Max Ceiling:</strong> {ceilingNum} XLM per driver</p>
            <hr style={{ borderColor: dark ? "#334155" : "#E5E7EB", margin: "12px 0" }} />
            <p>Each of your <strong>{approvedDrivers.length}</strong> drivers will receive exactly <strong>{finalAllocationXLM} XLM</strong>.</p>
            <p style={{ color: "#F59E0B", fontWeight: 800 }}>Total Checkout: {actualTotalSpent} XLM</p>
          </>
        }
        confirmText="Sign & Deploy"
        isProcessing={isProcessing}
        onConfirm={executeFleetDistribution}
        onCancel={() => setIsDeployModalOpen(false)}
        dark={dark}
      />

      <div style={{ background: dark ? "#3B210B" : "#FFFBEB", border: `1px solid ${dark ? "#78350F" : "#FDE68A"}`, borderRadius: 16, padding: "20px", marginBottom: 24 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 800, color: dark ? "#FCD34D" : "#92400E" }}>Fleet Budget Allocation</h3>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 800, color: t.textMuted, marginBottom: 6 }}>TOTAL POOL (XLM)</label>
            <input type="number" value={globalPoolAmount} onChange={e => setGlobalPoolAmount(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: 8, border: `1px solid ${dark ? "#78350F" : "#FDE68A"}`, background: dark ? "#451A03" : "#fff", color: t.textPrim, fontWeight: 700 }} />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 800, color: t.textMuted, marginBottom: 6 }}>MAX CEILING PER DRIVER (XLM)</label>
            <input type="number" value={driverCeiling} onChange={e => setDriverCeiling(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: 8, border: `1px solid ${dark ? "#78350F" : "#FDE68A"}`, background: dark ? "#451A03" : "#fff", color: t.textPrim, fontWeight: 700 }} />
          </div>
        </div>

        <button onClick={() => setIsDeployModalOpen(true)} disabled={isProcessing} style={{ width: "100%", background: "#F59E0B", color: "#fff", border: "none", padding: "12px", borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: isProcessing ? "not-allowed" : "pointer" }}>
          Review & Deploy Funds
        </button>
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
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) setUserData(userDoc.data());
      } else {
        navigate("/auth");
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  if (!userData) return <LoadingWorkspace message="Connecting..." />;

  return (
    <UserLayout activeTab={activeTab} onTabChange={setActiveTab} userData={userData}>
      {userData.role === "driver" && <DriverContent userData={userData} />}
      {userData.role === "cooperative" && <CooperativeContent userData={userData} />}
    </UserLayout>
  );
};

export default UserDashboard;