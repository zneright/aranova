import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
          </div>
        )}
      </div>
    </div>
  );
};

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
          </div>
        ))}
      </div>
    </div>
  );
};

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
    });
    return () => unsubscribe();
  }, [navigate]);

  if (authLoading || userData === null) return <LoadingWorkspace message="Loading ecosystem data..." />;
  if (userData.approved === false) return <LoadingWorkspace message="Verification pending..." />;

  return (
    <UserLayout activeTab={activeTab} onTabChange={setActiveTab} userData={userData}>
      {userData.role === "driver" && <DriverContent userData={userData} policy={{ maxApprovedAmount: 100, interestRate: 3, durationDays: 30 }} onRefresh={() => refreshUser(userData.uid)} />}
      {userData.role === "cooperative" && <CooperativeContent userData={userData} onRefresh={() => refreshUser(userData.uid)} />}
      {!["driver", "cooperative"].includes(userData.role) && <CommuterContent userData={userData} onRefresh={() => refreshUser(userData.uid)} />}
    </UserLayout>
  );
};

export default UserDashboard;