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
import { ensureUserProfile, maybeRunDailyTrustUpdate, formatXlm, dayMs, defaultPolicy, type Policy, parseTimestamp, queueBluetoothPayment, scoreDeltaForVault, syncBluetoothQueue, toDurationDays, ADMIN_PUBLIC_KEY } from "../../services/aranovaWorkflow";

const StatCard: React.FC<{ title: string; value: string; note?: string; dark: boolean }> = ({ title, value, note, dark }) => (
    <div style={{ background: dark ? "#08111f" : "#ffffff", border: `1px solid ${dark ? "#1f2937" : "#e5e7eb"}`, borderRadius: 18, padding: 16 }}>
        <div style={{ fontSize: 12, color: dark ? "#94a3b8" : "#64748b", marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 20, fontWeight: 800 }}>{value}</div>
        {note && <div style={{ marginTop: 6, fontSize: 12, color: dark ? "#64748b" : "#94a3b8" }}>{note}</div>}
    </div>
);

const PrimaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { dark: boolean; ghost?: boolean }> = ({ dark, ghost, style, ...props }) => (
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
    background: dark ? "#0f172a" : "#ffffff",
    color: dark ? "#f8fafc" : "#111827",
});

const CommuterPanel: React.FC<{ userData: any; onRefresh: () => void }> = ({ userData, onRefresh }) => {
    const { dark } = useTheme();
    const [recipient, setRecipient] = useState("");
    const [amount, setAmount] = useState("");
    const [lockPercent, setLockPercent] = useState("25");
    const [lockDays, setLockDays] = useState("30");
    const [maturityDate, setMaturityDate] = useState(() => new Date(Date.now() + 30 * dayMs).toISOString().slice(0, 10));
    const [busy, setBusy] = useState(false);

    const availableCredit = useMemo(() => Math.max(25, Number(userData.trustScore || 72) * 2), [userData.trustScore]);

    const handleSend = async () => {
        const value = Number(amount);
        if (!recipient || !value) return alert("Enter a recipient and amount.");
        if (value > Number(userData.walletBalance || 0)) return alert("Insufficient wallet balance.");

        setBusy(true);
        try {
            await addDoc(collection(db, "transactions"), {
                type: "send",
                from: userData.uid,
                to: recipient,
                amount: value,
                channel: "wallet",
                status: "completed",
                createdAt: serverTimestamp(),
            });
            await updateDoc(doc(db, "users", userData.uid), { walletBalance: increment(-value) });
            await updateDoc(doc(db, "users", userData.uid), {
                trustScore: Math.min(100, Number(userData.trustScore || 72) + 1),
                lastTrustUpdate: serverTimestamp(),
            });
            onRefresh();
        } finally {
            setBusy(false);
        }
    };

    const handleBluetoothPay = async () => {
        const value = Number(amount);
        if (!recipient || !value) return alert("Set recipient and amount first.");
        const queued = queueBluetoothPayment(userData.uid, { recipient, amount: value, mode: "bluetooth" });
        await addDoc(collection(db, "offline_payments"), {
            payerId: userData.uid,
            recipient,
            amount: value,
            queueId: queued.id,
            channel: "bluetooth",
            status: navigator.onLine ? "queued-for-sync" : "queued-offline",
            createdAt: serverTimestamp(),
        });
        alert("Bluetooth payment captured locally and will sync automatically.");
    };

    const handleVaultLock = async () => {
        const percent = Number(lockPercent);
        const days = Number(lockDays);
        const walletBalance = Number(userData.walletBalance || 0);
        if (!percent || percent <= 0 || percent > 100 || !days) return alert("Enter valid vault settings.");

        const lockedAmount = (walletBalance * percent) / 100;
        setBusy(true);
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
                trustScore: Math.min(100, Number(userData.trustScore || 72) + scoreDeltaForVault(lockedAmount, days)),
                lastTrustUpdate: serverTimestamp(),
            });
            onRefresh();
            alert("Vault lock saved.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                <StatCard dark={dark} title="Wallet Balance" value={`${formatXlm(Number(userData.walletBalance || 0))} XLM`} note="Send, receive, withdraw" />
                <StatCard dark={dark} title="Vault Balance" value={`${formatXlm(Number(userData.vaultBalance || 0))} XLM`} note="Locked funds improve trust" />
                <StatCard dark={dark} title="Trust Score" value={`${Number(userData.trustScore || 72)}/100`} note={`Credit ceiling ${formatXlm(availableCredit)} XLM`} />
            </div>

            <div style={{ background: dark ? "#08111f" : "#ffffff", borderRadius: 22, padding: 20, border: `1px solid ${dark ? "#1f2937" : "#e5e7eb"}` }}>
                <h3 style={{ marginTop: 0 }}>Wallet Actions</h3>
                <div style={{ display: "grid", gap: 12 }}>
                    <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Scan user, paste public key, or Bluetooth recipient" style={inputStyle(dark)} />
                    <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" placeholder="Amount in XLM" style={inputStyle(dark)} />
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <PrimaryButton dark={dark} onClick={handleSend} disabled={busy}>Send</PrimaryButton>
                        <PrimaryButton dark={dark} ghost onClick={() => alert(`Receive via QR using public key:\n${userData.publicKey}`)}>Receive</PrimaryButton>
                        <PrimaryButton dark={dark} ghost onClick={handleBluetoothPay}>Bluetooth Pay</PrimaryButton>
                        <PrimaryButton dark={dark} ghost onClick={() => alert("Withdraw is reserved for future PDAX integration.")}>Withdraw</PrimaryButton>
                    </div>
                </div>
            </div>

            <div style={{ background: dark ? "#08111f" : "#ffffff", borderRadius: 22, padding: 20, border: `1px solid ${dark ? "#1f2937" : "#e5e7eb"}` }}>
                <h3 style={{ marginTop: 0 }}>Vault</h3>
                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                    <input value={lockPercent} onChange={(e) => setLockPercent(e.target.value)} type="number" placeholder="Lock percentage" style={inputStyle(dark)} />
                    <input value={lockDays} onChange={(e) => setLockDays(e.target.value)} type="number" placeholder="Days to lock" style={inputStyle(dark)} />
                    <input value={maturityDate} onChange={(e) => setMaturityDate(e.target.value)} type="date" style={inputStyle(dark)} />
                </div>
                <div style={{ marginTop: 12 }}>
                    <PrimaryButton dark={dark} onClick={handleVaultLock} disabled={busy}>Lock Funds</PrimaryButton>
                </div>
            </div>
        </div>
    );
};

const DriverPanel: React.FC<{ userData: any; policy: Policy; onRefresh: () => void }> = ({ userData, policy, onRefresh }) => {
    const { dark } = useTheme();
    const [requestedAmount, setRequestedAmount] = useState("");
    const [activeLoan, setActiveLoan] = useState<any>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        const loanQuery = query(collection(db, "fuel_requests"), where("driverId", "==", userData.uid), where("status", "in", ["pending", "active"]));
        return onSnapshot(loanQuery, (snapshot) => {
            setActiveLoan(snapshot.empty ? null : { id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
        });
    }, [userData.uid]);

    const handleRequestCredit = async () => {
        const value = Number(requestedAmount);
        if (!value || value <= 0) return alert("Enter a valid amount.");
        if (value > Number(policy.maxApprovedAmount || 100)) return alert("Amount exceeds the current policy limit.");

        setBusy(true);
        try {
            await addDoc(collection(db, "fuel_requests"), {
                driverId: userData.uid,
                driverName: userData.displayName,
                driverPublicKey: userData.publicKey,
                coopId: userData.cooperativeId || "unknown-coop",
                amount: value,
                approvedAmount: Math.min(value, Number(policy.maxApprovedAmount || 100)),
                interestRate: Number(policy.interestRate || 3),
                durationValue: Number(policy.durationValue || 30),
                durationUnit: policy.durationUnit,
                durationDays: toDurationDays(Number(policy.durationValue || 30), policy.durationUnit),
                status: "pending",
                createdAt: serverTimestamp(),
            });
            onRefresh();
        } finally {
            setBusy(false);
        }
    };

    const handleRepay = async () => {
        if (!activeLoan) return;
        setBusy(true);
        try {
            await updateDoc(doc(db, "fuel_requests", activeLoan.id), { status: "repaid", repaidAt: serverTimestamp() });
            await setDoc(doc(db, "coop_stats", activeLoan.coopId), {
                poolBalance: increment(Number(activeLoan.amount)),
                totalRepaid: increment(Number(activeLoan.amount)),
                outstanding: increment(-Number(activeLoan.amount)),
            }, { merge: true });
            await addDoc(collection(db, "transactions"), {
                type: "repayment",
                from: userData.uid,
                to: activeLoan.coopId,
                amount: Number(activeLoan.amount),
                adminFee: 0.2,
                coopFee: 0.3,
                status: "completed",
                createdAt: serverTimestamp(),
            });
            await updateDoc(doc(db, "users", userData.uid), {
                trustScore: Math.min(100, Number(userData.trustScore || 72) + 4),
                lastTrustUpdate: serverTimestamp(),
            });
            onRefresh();
            alert("Repayment recorded and returned to the cooperative pool.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                <StatCard dark={dark} title="Trust Score" value={`${Number(userData.trustScore || 72)}/100`} note="Updated daily in backend" />
                <StatCard dark={dark} title="Approved Limit" value={`${formatXlm(Number(policy.maxApprovedAmount || 100))} XLM`} note="Policy-managed ceiling" />
                <StatCard dark={dark} title="Duration" value={`${Number(policy.durationValue || 30)} ${policy.durationUnit}`} note="Admin final say on repayment terms" />
            </div>

            <div style={{ background: dark ? "#08111f" : "#ffffff", borderRadius: 22, padding: 20, border: `1px solid ${dark ? "#1f2937" : "#e5e7eb"}` }}>
                <h3 style={{ marginTop: 0 }}>Fuel Credit Request</h3>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <input value={requestedAmount} onChange={(e) => setRequestedAmount(e.target.value)} type="number" placeholder="Requested amount" style={inputStyle(dark)} />
                    <PrimaryButton dark={dark} onClick={handleRequestCredit} disabled={busy}>Request Credit</PrimaryButton>
                    <PrimaryButton dark={dark} ghost onClick={() => alert("Bluetooth receive is handled by the cooperative matching service.")}>Bluetooth Receive</PrimaryButton>
                </div>
            </div>

            <div style={{ background: dark ? "#08111f" : "#ffffff", borderRadius: 22, padding: 20, border: `1px solid ${dark ? "#1f2937" : "#e5e7eb"}` }}>
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
                        <PrimaryButton dark={dark} onClick={handleRepay} disabled={busy}>Repay Credit</PrimaryButton>
                    </div>
                )}
            </div>
        </div>
    );
};

const CooperativePanel: React.FC<{ userData: any; policy: Policy; onPolicyChange: (next: Policy) => void; onRefresh: () => void }> = ({ userData, policy, onPolicyChange, onRefresh }) => {
    const { dark } = useTheme();
    const [depositAmount, setDepositAmount] = useState("");
    const [requests, setRequests] = useState<any[]>([]);
    const [stats, setStats] = useState<any>({
        poolBalance: 0,
        totalDeposited: 0,
        totalReleased: 0,
        totalRepaid: 0,
        outstanding: 0,
        lockedVaultBalance: 0,
    });
    const [history, setHistory] = useState<any[]>([]);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        const statsUnsub = onSnapshot(doc(db, "coop_stats", userData.uid), (snap) => {
            if (snap.exists()) setStats((previous: any) => ({ ...previous, ...(snap.data() as any) }));
        });

        const requestsUnsub = onSnapshot(query(collection(db, "fuel_requests"), where("coopId", "==", userData.uid)), (snap) => {
            setRequests(snap.docs.map((item) => ({ id: item.id, ...item.data() })));
        });

        const historyUnsub = onSnapshot(query(collection(db, "transactions"), where("to", "==", userData.uid)), (snap) => {
            setHistory(snap.docs.map((item) => ({ id: item.id, ...item.data() })));
        });

        const policyUnsub = onSnapshot(doc(db, "app_config", "policy"), (snap) => {
            if (snap.exists()) onPolicyChange({ ...defaultPolicy, ...(snap.data() as any) });
        });

        return () => {
            statsUnsub();
            requestsUnsub();
            historyUnsub();
            policyUnsub();
        };
    }, [userData.uid]);

    const handleDeposit = async () => {
        const value = Number(depositAmount);
        if (!value || value <= 0) return alert("Enter a valid amount.");
        setBusy(true);
        try {
            await setDoc(doc(db, "coop_stats", userData.uid), {
                poolBalance: increment(value),
                totalDeposited: increment(value),
            }, { merge: true });
            await addDoc(collection(db, "transactions"), {
                type: "pool_deposit",
                from: userData.uid,
                to: userData.uid,
                amount: value,
                status: "completed",
                createdAt: serverTimestamp(),
            });
            setDepositAmount("");
            onRefresh();
            alert("Deposited into the cooperative pool.");
        } finally {
            setBusy(false);
        }
    };

    const handleApprove = async (request: any) => {
        setBusy(true);
        try {
            const approvedAmount = Number(request.approvedAmount || request.amount);
            await updateDoc(doc(db, "fuel_requests", request.id), { status: "active", approvedAt: serverTimestamp() });
            await setDoc(doc(db, "coop_stats", userData.uid), {
                poolBalance: increment(-approvedAmount),
                totalReleased: increment(approvedAmount),
                outstanding: increment(approvedAmount),
            }, { merge: true });
            await addDoc(collection(db, "transactions"), {
                type: "credit_release",
                from: userData.uid,
                to: request.driverId,
                amount: approvedAmount,
                status: "completed",
                createdAt: serverTimestamp(),
            });
            onRefresh();
            alert("Credit released from the cooperative pool.");
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

    return (
        <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                <StatCard dark={dark} title="Pool Balance" value={`${formatXlm(Number(stats.poolBalance || 0))} XLM`} note="Always the source of fuel credit" />
                <StatCard dark={dark} title="Deposited" value={`${formatXlm(Number(stats.totalDeposited || 0))} XLM`} />
                <StatCard dark={dark} title="Released" value={`${formatXlm(Number(stats.totalReleased || 0))} XLM`} />
                <StatCard dark={dark} title="Repaid" value={`${formatXlm(Number(stats.totalRepaid || 0))} XLM`} />
            </div>

            <div style={{ background: dark ? "#08111f" : "#ffffff", borderRadius: 22, padding: 20, border: `1px solid ${dark ? "#1f2937" : "#e5e7eb"}` }}>
                <h3 style={{ marginTop: 0 }}>Pool Management</h3>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <input value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} type="number" placeholder="Deposit amount" style={inputStyle(dark)} />
                    <PrimaryButton dark={dark} onClick={handleDeposit} disabled={busy}>Deposit to Pool</PrimaryButton>
                </div>
                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", marginTop: 14 }}>
                    <input value={policy.maxApprovedAmount} onChange={(e) => onPolicyChange({ ...policy, maxApprovedAmount: Number(e.target.value) })} type="number" placeholder="Approved limit" style={inputStyle(dark)} />
                    <input value={policy.interestRate} onChange={(e) => onPolicyChange({ ...policy, interestRate: Number(e.target.value) })} type="number" placeholder="Interest rate" style={inputStyle(dark)} />
                    <input value={policy.durationValue} onChange={(e) => onPolicyChange({ ...policy, durationValue: Number(e.target.value) })} type="number" placeholder="Duration value" style={inputStyle(dark)} />
                    <select value={policy.durationUnit} onChange={(e) => onPolicyChange({ ...policy, durationUnit: e.target.value as Policy["durationUnit"] })} style={inputStyle(dark)}>
                        <option value="days">days</option>
                        <option value="weeks">weeks</option>
                        <option value="months">months</option>
                        <option value="years">years</option>
                    </select>
                    <PrimaryButton dark={dark} ghost onClick={savePolicy}>Save Policy</PrimaryButton>
                </div>
            </div>

            <div style={{ background: dark ? "#08111f" : "#ffffff", borderRadius: 22, padding: 20, border: `1px solid ${dark ? "#1f2937" : "#e5e7eb"}` }}>
                <h3 style={{ marginTop: 0 }}>Pending and Active Requests</h3>
                {requests.length === 0 ? (
                    <div style={{ color: dark ? "#94a3b8" : "#64748b" }}>No requests yet.</div>
                ) : requests.map((request) => (
                    <div key={request.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${dark ? "#1f2937" : "#e5e7eb"}` }}>
                        <div>
                            <div style={{ fontWeight: 800 }}>{request.driverName}</div>
                            <div style={{ fontSize: 12, opacity: 0.75 }}>{request.status} - {formatXlm(Number(request.approvedAmount || request.amount))} XLM</div>
                            {request.status === "active" && <div style={{ fontSize: 12, opacity: 0.75 }}>{overdue.some((item) => item.id === request.id) ? "Overdue" : "On schedule"}</div>}
                        </div>
                        {request.status === "pending" && <PrimaryButton dark={dark} onClick={() => handleApprove(request)} disabled={busy}>Approve</PrimaryButton>}
                    </div>
                ))}
            </div>

            <div style={{ background: dark ? "#08111f" : "#ffffff", borderRadius: 22, padding: 20, border: `1px solid ${dark ? "#1f2937" : "#e5e7eb"}` }}>
                <h3 style={{ marginTop: 0 }}>Trust and Transaction Summary</h3>
                <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                    <StatCard dark={dark} title="Locked Vault Balance" value={`${formatXlm(Number(stats.lockedVaultBalance || 0))} XLM`} />
                    <StatCard dark={dark} title="Admin Address" value={ADMIN_PUBLIC_KEY} note="Hardcoded policy recipient" />
                </div>
                <div style={{ marginTop: 14 }}>
                    {history.slice(0, 8).map((item) => (
                        <div key={item.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${dark ? "#1f2937" : "#e5e7eb"}` }}>
                            <span>{item.type}</span>
                            <span>{formatXlm(Number(item.amount || 0))} XLM</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const UserDashboard: React.FC = () => {
    const [activeTab, setActiveTab] = useState("wallet");
    const [userData, setUserData] = useState<any>(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [policy, setPolicy] = useState<Policy>(defaultPolicy);
    const navigate = useNavigate();

    const refreshUser = async (uid: string) => {
        const snap = await getDoc(doc(db, "users", uid));
        if (snap.exists()) setUserData({ uid, ...snap.data() });
    };

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(async (user) => {
            if (!user) {
                navigate("/auth");
                return;
            }

            const profile = await ensureUserProfile(user);
            setUserData(profile);
            setAuthLoading(false);
            maybeRunDailyTrustUpdate(profile).catch(() => undefined);

            const userUnsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
                if (snap.exists()) setUserData({ uid: user.uid, ...snap.data() });
            });

            return () => userUnsub();
        });

        return () => unsubscribe();
    }, [navigate]);

    useEffect(() => {
        if (!userData?.uid) return;
        syncBluetoothQueue(userData.uid).catch(() => undefined);
    }, [userData?.uid]);

    useEffect(() => {
        const policyUnsub = onSnapshot(doc(db, "app_config", "policy"), (snap) => {
            if (snap.exists()) setPolicy({ ...defaultPolicy, ...(snap.data() as any) });
        });
        return () => policyUnsub();
    }, []);

    if (authLoading || !userData) return <LoadingWorkspace message="Loading Aranova workspace..." />;
    if (userData.approved === false) return <LoadingWorkspace message="Verification pending..." />;

    return (
        <UserLayout activeTab={activeTab} onTabChange={setActiveTab} userData={userData}>
            {userData.role === "cooperative" && <CooperativePanel userData={userData} policy={policy} onPolicyChange={setPolicy} onRefresh={() => refreshUser(userData.uid)} />}
            {userData.role === "driver" && <DriverPanel userData={userData} policy={policy} onRefresh={() => refreshUser(userData.uid)} />}
            {userData.role !== "cooperative" && userData.role !== "driver" && <CommuterPanel userData={userData} onRefresh={() => refreshUser(userData.uid)} />}
        </UserLayout>
    );
};

export default UserDashboard;
