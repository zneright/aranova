import React, { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import UserLayout, { useTheme } from "../../components/layout/UserLayout";
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

const StatCard: React.FC<{ title: string; value: string; note?: string; dark: boolean }> = ({
  title,
  value,
  note,
  dark,
}) => (
  <div
    style={{
      background: dark ? "#08111f" : "#ffffff",
      border: `1px solid ${dark ? "#1f2937" : "#e5e7eb"}`,
      borderRadius: 18,
      padding: 16,
    }}
  >
    <div style={{ fontSize: 12, color: dark ? "#94a3b8" : "#64748b", marginBottom: 8 }}>{title}</div>
    <div style={{ fontSize: 20, fontWeight: 800 }}>{value}</div>
    {note && <div style={{ marginTop: 6, fontSize: 12, color: dark ? "#64748b" : "#94a3b8" }}>{note}</div>}
  </div>
);

const PrimaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { dark: boolean; ghost?: boolean }> = ({
  dark,
  ghost,
  style,
  ...props
}) => (
  <button
    {...props}
    style={{
      border: "none",
      borderRadius: 999,
      padding: "12px 16px",
      fontWeight: 800,
      cursor: props.disabled ? "not-allowed" : "pointer",
      background: ghost ? (dark ? "#1f2937" : "#e2e8f0") : (dark ? "#10b981" : "#0f766e"),
      color: ghost ? (dark ? "#f8fafc" : "#111827") : "#ffffff",
      ...style,
    }}
  />
);

const inputStyle = (dark: boolean) => ({
  width: "100%",
  border: `1px solid ${dark ? "#334155" : "#cbd5e1"}`,
  borderRadius: 14,
  padding: "12px 14px",
  fontSize: 14,
  background: dark ? "#0f172a" : "#fff",
  color: dark ? "#f8fafc" : "#0f172a",
  outline: "none",
  fontFamily: "inherit",
});

const DriverLoans = () => {
  const { userData, loading: authLoading } = useAuth();
  const { dark } = useTheme();

  const [policy, setPolicy] = useState<Policy>(defaultPolicy);
  const [requestedAmount, setRequestedAmount] = useState("");
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
      setRequestedAmount("");
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

  return (
    <UserLayout activeTab="loans" userData={userData}>
      <div style={{ display: "grid", gap: 16 }}>
        <h2>Driver Panel - Fuel Credit & Loans</h2>

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <StatCard
            dark={dark}
            title="Trust Score"
            value={`${Number(userData.trustScore || 0)}/100`}
            note="Updated daily in backend"
          />
          <StatCard
            dark={dark}
            title="Personal Credit Limit"
            value={`${formatXlm(creditLimit)} XLM`}
            note="Determined by trust score"
          />
          <StatCard
            dark={dark}
            title="Duration"
            value={`${Number(policy.durationValue || 30)} ${policy.durationUnit}`}
            note="Admin final say on repayment terms"
          />
        </div>

        <div
          style={{
            background: dark ? "#08111f" : "#ffffff",
            borderRadius: 22,
            padding: 20,
            border: `1px solid ${dark ? "#1f2937" : "#e5e7eb"}`,
          }}
        >
          <h3 style={{ marginTop: 0 }}>Fuel Credit Request</h3>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              value={requestedAmount}
              onChange={(e) => setRequestedAmount(e.target.value)}
              type="number"
              placeholder="Requested amount"
              style={inputStyle(dark)}
            />
            <PrimaryButton dark={dark} onClick={handleRequestCredit} disabled={busy}>
              Request Credit
            </PrimaryButton>
            <PrimaryButton
              dark={dark}
              ghost
              onClick={() => alert("Bluetooth receive is handled by the cooperative matching service.")}
            >
              Bluetooth Receive
            </PrimaryButton>
          </div>
        </div>

        <div
          style={{
            background: dark ? "#08111f" : "#ffffff",
            borderRadius: 22,
            padding: 20,
            border: `1px solid ${dark ? "#1f2937" : "#e5e7eb"}`,
          }}
        >
          <h3 style={{ marginTop: 0 }}>Current Credit</h3>
          {!activeLoan ? (
            <div style={{ color: dark ? "#94a3b8" : "#64748b" }}>No active request or loan.</div>
          ) : activeLoan.status === "pending" ? (
            <div>Request pending cooperative approval.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <div>Approved amount: {formatXlm(Number(activeLoan.approvedAmount || activeLoan.amount))} XLM</div>
              <div>Interest rate: {Number(activeLoan.interestRate || 3)}%</div>
              <div>Duration: {Number(activeLoan.durationDays || 30)} days</div>
              <PrimaryButton dark={dark} onClick={handleRepay} disabled={busy}>
                Repay Credit
              </PrimaryButton>
            </div>
          )}
        </div>
      </div>
    </UserLayout>
  );
};

export default DriverLoans;
