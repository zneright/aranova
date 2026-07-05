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
  parseTimestamp,
  dayMs,
} from "../../services/aranovaWorkflow";
import {
  depositPool,
  releaseCredit,
  getPoolBalance,
  NETWORK_PASSPHRASE,
  getLiveStellarBalance,
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

const CoopPool = () => {
  const { userData, loading: authLoading } = useAuth();
  const { dark } = useTheme();

  const [depositAmount, setDepositAmount] = useState("");
  const [requests, setRequests] = useState<any[]>([]);
  const [coopDrivers, setCoopDrivers] = useState<any[]>([]);
  const [policy, setPolicy] = useState<Policy>(defaultPolicy);
  const [stats, setStats] = useState<any>({
    poolBalance: 0,
    totalDeposited: 0,
    totalReleased: 0,
    totalRepaid: 0,
    outstanding: 0,
    lockedVaultBalance: 0,
  });
  const [busy, setBusy] = useState(false);
  const [driverBalances, setDriverBalances] = useState<{ [uid: string]: string }>({});

  // Sync driver balances dynamically
  useEffect(() => {
    coopDrivers.forEach((driver) => {
      if (driver.publicKey && driverBalances[driver.uid] === undefined) {
        getLiveStellarBalance(driver.publicKey)
          .then((bal) => {
            setDriverBalances((prev) => ({ ...prev, [driver.uid]: bal }));
          })
          .catch(() => undefined);
      }
    });
  }, [coopDrivers, driverBalances]);

  // Sync DB records
  useEffect(() => {
    if (authLoading || !userData?.uid) return;

    const statsUnsub = onSnapshot(
      doc(db, "coop_stats", userData.uid),
      (snap) => {
        if (snap.exists()) setStats((previous: any) => ({ ...previous, ...(snap.data() as any) }));
      },
      (err) => console.warn("Cooperative stats snapshot error:", err)
    );

    if (userData?.publicKey) {
      getPoolBalance(userData.publicKey)
        .then((onChainBalance) => {
          if (onChainBalance !== -1n) {
            const displayBalance = Number(onChainBalance) / 10_000_000;
            setStats((previous: any) => ({ ...previous, poolBalance: displayBalance }));
          }
        })
        .catch((err) => {
          console.warn("Failed to check on-chain pool balance:", err);
        });
    }

    const requestsUnsub = onSnapshot(
      query(collection(db, "fuel_requests"), where("coopId", "==", userData.uid)),
      (snap) => {
        setRequests(snap.docs.map((item) => ({ id: item.id, ...item.data() })));
      },
      (err) => console.warn("Cooperative requests snapshot error:", err)
    );

    const policyUnsub = onSnapshot(
      doc(db, "app_config", "policy"),
      (snap) => {
        if (snap.exists()) setPolicy({ ...defaultPolicy, ...(snap.data() as any) });
      },
      (err) => console.warn("Cooperative policy snapshot error:", err)
    );

    const driversUnsub = onSnapshot(
      query(collection(db, "users"), where("role", "==", "driver"), where("cooperativeId", "==", userData.uid)),
      (snap) => {
        setCoopDrivers(snap.docs.map((item) => ({ id: item.id, ...item.data() })));
      },
      (err) => console.warn("Cooperative drivers snapshot error:", err)
    );

    return () => {
      statsUnsub();
      requestsUnsub();
      policyUnsub();
      driversUnsub();
    };
  }, [authLoading, userData?.uid, userData?.publicKey]);

  if (authLoading || !userData) return <LoadingWorkspace message="Loading Cooperative Pool Panel..." />;

  const handleDeposit = async () => {
    const value = Number(depositAmount);
    if (!value || value <= 0) return alert("Enter a valid amount.");
    setBusy(true);
    try {
      // Live on-chain Soroban contract invocation
      const handler = await getSigningHandler(userData, NETWORK_PASSPHRASE);
      const amountBig = BigInt(Math.floor(value * 10_000_000));
      const txHash = await depositPool(userData.publicKey, amountBig, handler);
      console.log("Soroban Transaction Completed. Hash:", txHash);

      await setDoc(
        doc(db, "coop_stats", userData.uid),
        {
          poolBalance: increment(value),
          totalDeposited: increment(value),
        },
        { merge: true }
      );
      await addDoc(collection(db, "transactions"), {
        type: "pool_deposit",
        from: userData.uid,
        to: userData.uid,
        amount: value,
        status: "completed",
        blockchainTxHash: txHash,
        createdAt: serverTimestamp(),
      });
      setDepositAmount("");
      alert(`Deposit completed on-chain and recorded locally!\nTx Hash: ${txHash}`);
    } catch (err: any) {
      console.error(err);
      alert(`Contract execution failed: ${err.message || err}`);
    } finally {
      setBusy(false);
    }
  };

  const handleApprove = async (request: any) => {
    setBusy(true);
    try {
      const approvedAmount = Number(request.approvedAmount || request.amount);
      const interestRateBps = Number(request.interestRate || 3) * 100;
      const durationDays = Number(request.durationDays || 30);

      // Live on-chain Soroban contract invocation
      const handler = await getSigningHandler(userData, NETWORK_PASSPHRASE);
      const amountBig = BigInt(Math.floor(approvedAmount * 10_000_000));
      const txHash = await releaseCredit(
        userData.publicKey,
        request.driverPublicKey,
        amountBig,
        BigInt(interestRateBps),
        durationDays,
        handler
      );
      console.log("Soroban Transaction Completed. Hash:", txHash);

      await updateDoc(doc(db, "fuel_requests", request.id), {
        status: "active",
        approvedAt: serverTimestamp(),
        blockchainTxHash: txHash,
      });
      await setDoc(
        doc(db, "coop_stats", userData.uid),
        {
          poolBalance: increment(-approvedAmount),
          totalReleased: increment(approvedAmount),
          outstanding: increment(approvedAmount),
        },
        { merge: true }
      );
      await addDoc(collection(db, "transactions"), {
        type: "credit_release",
        from: userData.uid,
        to: request.driverId,
        amount: approvedAmount,
        status: "completed",
        blockchainTxHash: txHash,
        createdAt: serverTimestamp(),
      });
      alert(`Credit released on-chain and recorded locally!\nTx Hash: ${txHash}`);
    } catch (err: any) {
      console.error(err);
      alert(`Contract execution failed: ${err.message || err}`);
    } finally {
      setBusy(false);
    }
  };

  const savePolicy = async () => {
    await setDoc(doc(db, "app_config", "policy"), policy, { merge: true });
    alert("Policy saved.");
  };

  const overdue = requests.filter((request) => {
    const createdAt = parseTimestamp(request.createdAt);
    const dueDays = Number(request.durationDays || policy.durationValue);
    return request.status === "active" && createdAt && Date.now() - createdAt.getTime() > dueDays * dayMs;
  });

  const outstandingDriverBalance = requests
    .filter((r) => r.status === "active")
    .reduce((sum, r) => sum + Number(r.approvedAmount || r.amount || 0), 0);

  const totalLockedVaultBalance =
    Number(userData.vaultBalance || 0) + coopDrivers.reduce((sum, d) => sum + Number(d.vaultBalance || 0), 0);

  return (
    <UserLayout activeTab="coop-pool" userData={userData}>
      <div style={{ display: "grid", gap: 16 }}>
        <h2>Cooperative Panel - Fuel Credit Pool</h2>

        {/* Core Stats Grid */}
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <StatCard
            dark={dark}
            title="Pool Balance"
            value={`${formatXlm(Number(stats.poolBalance || 0))} XLM`}
            note="Source of active fuel credits"
          />
          <StatCard
            dark={dark}
            title="Total Deposited"
            value={`${formatXlm(Number(stats.totalDeposited || 0))} XLM`}
            note="Total cooperative inputs"
          />
          <StatCard
            dark={dark}
            title="Total Released"
            value={`${formatXlm(Number(stats.totalReleased || 0))} XLM`}
            note="Cumulative active/paid loans"
          />
          <StatCard
            dark={dark}
            title="Total Repaid"
            value={`${formatXlm(Number(stats.totalRepaid || 0))} XLM`}
            note="Returned to pool"
          />
        </div>

        {/* Additional Stats Grid */}
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <StatCard
            dark={dark}
            title="Outstanding Balances"
            value={`${formatXlm(outstandingDriverBalance)} XLM`}
            note="Unpaid credit on the road"
          />
          <StatCard
            dark={dark}
            title="Locked Vault Balance"
            value={`${formatXlm(totalLockedVaultBalance)} XLM`}
            note="Coop + drivers total locks"
          />
          <StatCard
            dark={dark}
            title="Overdue Repayments"
            value={`${overdue.length} Lines`}
            note="Requires trust score review"
          />
        </div>

        {/* Pool Management Form */}
        <div
          style={{
            background: dark ? "#08111f" : "#ffffff",
            borderRadius: 22,
            padding: 20,
            border: `1px solid ${dark ? "#1f2937" : "#e5e7eb"}`,
          }}
        >
          <h3 style={{ marginTop: 0 }}>Pool Management</h3>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              type="number"
              placeholder="Deposit amount"
              style={inputStyle(dark)}
            />
            <PrimaryButton dark={dark} onClick={handleDeposit} disabled={busy}>
              Deposit to Pool
            </PrimaryButton>
          </div>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", marginTop: 14 }}>
            <input
              value={policy.maxApprovedAmount}
              onChange={(e) => setPolicy({ ...policy, maxApprovedAmount: Number(e.target.value) })}
              type="number"
              placeholder="Approved limit"
              style={inputStyle(dark)}
            />
            <input
              value={policy.interestRate}
              onChange={(e) => setPolicy({ ...policy, interestRate: Number(e.target.value) })}
              type="number"
              placeholder="Interest rate"
              style={inputStyle(dark)}
            />
            <input
              value={policy.durationValue}
              onChange={(e) => setPolicy({ ...policy, durationValue: Number(e.target.value) })}
              type="number"
              placeholder="Duration value"
              style={inputStyle(dark)}
            />
            <select
              value={policy.durationUnit}
              onChange={(e) => setPolicy({ ...policy, durationUnit: e.target.value as Policy["durationUnit"] })}
              style={inputStyle(dark)}
            >
              <option value="days">days</option>
              <option value="weeks">weeks</option>
              <option value="months">months</option>
              <option value="years">years</option>
            </select>
            <PrimaryButton dark={dark} ghost onClick={savePolicy}>
              Save Policy
            </PrimaryButton>
          </div>
        </div>

        {/* Pending Requests & Approvals */}
        <div
          style={{
            background: dark ? "#08111f" : "#ffffff",
            borderRadius: 22,
            padding: 20,
            border: `1px solid ${dark ? "#1f2937" : "#e5e7eb"}`,
          }}
        >
          <h3 style={{ marginTop: 0 }}>Pending Credit Applications</h3>
          {requests.filter((r) => r.status === "pending").length === 0 ? (
            <div style={{ color: dark ? "#94a3b8" : "#64748b", fontSize: 13 }}>No pending driver requests at this time.</div>
          ) : (
            requests
              .filter((r) => r.status === "pending")
              .map((request) => (
                <div
                  key={request.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "center",
                    padding: "12px 0",
                    borderBottom: `1px solid ${dark ? "#1f2937" : "#e5e7eb"}`,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800 }}>{request.driverName}</div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      Requested: {formatXlm(Number(request.amount))} XLM | Duration: {request.durationValue}{" "}
                      {request.durationUnit}
                    </div>
                  </div>
                  <PrimaryButton dark={dark} onClick={() => handleApprove(request)} disabled={busy}>
                    Approve & Release
                  </PrimaryButton>
                </div>
              ))
          )}
        </div>

        {/* Overdue Loans Detail List */}
        <div
          style={{
            background: dark ? "#08111f" : "#ffffff",
            borderRadius: 22,
            padding: 20,
            border: `1px solid ${dark ? "#1f2937" : "#e5e7eb"}`,
          }}
        >
          <h3 style={{ marginTop: 0, color: overdue.length > 0 ? "#EF4444" : undefined }}>Overdue Repayments Details</h3>
          {overdue.length === 0 ? (
            <div style={{ color: dark ? "#94a3b8" : "#64748b", fontSize: 13 }}>
              No overdue repayments. Excellent driver health!
            </div>
          ) : (
            overdue.map((request) => (
              <div
                key={request.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                  padding: "10px 0",
                  borderBottom: `1px solid ${dark ? "#1f2937" : "#e5e7eb"}`,
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, color: "#EF4444" }}>{request.driverName} (OVERDUE)</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    Outstanding: {formatXlm(Number(request.approvedAmount || request.amount))} XLM
                  </div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#EF4444" }}>Maturity Term Violated</span>
              </div>
            ))
          )}
        </div>

        {/* Coop Drivers Trust Summary */}
        <div
          style={{
            background: dark ? "#08111f" : "#ffffff",
            borderRadius: 22,
            padding: 20,
            border: `1px solid ${dark ? "#1f2937" : "#e5e7eb"}`,
          }}
        >
          <h3 style={{ marginTop: 0 }}>Driver Trust Summaries</h3>
          {coopDrivers.length === 0 ? (
            <div style={{ color: dark ? "#94a3b8" : "#64748b", fontSize: 13 }}>
              No drivers registered under this cooperative yet.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {coopDrivers.map((driver) => {
                const personalLimit = Math.min(Number(policy.maxApprovedAmount || 100), Number(driver.trustScore || 0) * 2);
                const balanceString =
                  driverBalances[driver.uid] !== undefined
                    ? `${formatXlm(Number(driverBalances[driver.uid]))} XLM`
                    : `${formatXlm(Number(driver.walletBalance || 0))} XLM (cached)`;

                return (
                  <div
                    key={driver.uid}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "8px 0",
                      borderBottom: `1px solid ${dark ? "#1f2937" : "#e5e7eb"}`,
                      fontSize: 14,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800 }}>{driver.displayName}</div>
                      <div style={{ fontSize: 11, opacity: 0.6 }}>
                        Key: {driver.publicKey.slice(0, 8)}...{driver.publicKey.slice(-8)}
                      </div>
                      <div style={{ fontSize: 11, color: dark ? "#34d399" : "#059669", fontWeight: 700 }}>
                        On-Chain Wallet: {balanceString}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div
                        style={{
                          fontWeight: 800,
                          color:
                            (driver.trustScore || 0) >= 80
                              ? "#10B981"
                              : (driver.trustScore || 0) <= 30
                              ? "#EF4444"
                              : "#F59E0B",
                        }}
                      >
                        {driver.trustScore || 0}/100 Trust
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.6 }}>Limit: {formatXlm(personalLimit)} XLM</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </UserLayout>
  );
};

export default CoopPool;
