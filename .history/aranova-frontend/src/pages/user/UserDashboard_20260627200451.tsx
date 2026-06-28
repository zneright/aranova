// C:\Users\Renz Jericho Buday\aranova\aranova-frontend\src\pages\user\UserDashboard.tsx
import React, { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../firebase/config";
import UserLayout, { useTheme } from "../../components/layouT/UserLayout";

// ---------------------------------------------------------------------------
// SVG Icons (local to dashboard)
// ---------------------------------------------------------------------------
const IconScan = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M23 7V1h-6" /><path d="M1 7V1h6" /><path d="M23 17v6h-6" /><path d="M1 17v6h6" /><line x1="9" y1="9" x2="15" y2="9" /><line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="15" x2="15" y2="15" /></svg>);
const IconLock = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>);
const IconBus = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="1" /><path d="M16 8h4l3 5v3h-7V8z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>);
const IconTrendUp = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>);
const IconLockSm = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>);
const IconAdd = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>);
const IconSend = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>);
const IconPending = () => (<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>);

// ---------------------------------------------------------------------------
// Activity item type
// ---------------------------------------------------------------------------
interface TxItem { id: number; icon: "bus" | "trend" | "lock"; name: string; meta: string; amount: string; positive: boolean; color: "gray" | "green" | "blue"; }

const TRANSACTIONS: TxItem[] = [
  { id: 1, icon: "bus", name: "Jeepney Fare", meta: "Today · Offline", amount: "-0.25", positive: false, color: "gray" },
  { id: 2, icon: "trend", name: "Savings Interest", meta: "Yesterday · Vault", amount: "+1.50", positive: true, color: "green" },
  { id: 3, icon: "lock", name: "Vault Deposit", meta: "Oct 12 · Smart Contract", amount: "-100.00", positive: false, color: "blue" },
];

// ---------------------------------------------------------------------------
// Inner dashboard (accesses ThemeContext)
// ---------------------------------------------------------------------------
const DashboardContent: React.FC = () => {
  const { dark } = useTheme();

  const t = {
    bgCard: dark ? "#1A1D27" : "#ffffff", bgPage: dark ? "#0F1117" : "#F8F9FA",
    border: dark ? "#2A2D3A" : "#E5E7EB", textPrim: dark ? "#F1F5F9" : "#111827",
    textMuted: dark ? "#94A3B8" : "#6B7280", textFaint: dark ? "#475569" : "#9CA3AF",
    blueText: dark ? "#7DB3FF" : "#1652C9", blue50: dark ? "#1A2644" : "#EEF4FF",
  };

  const txIconStyle = (color: TxItem["color"]): React.CSSProperties => {
    const map = {
      gray: { background: t.bgPage, color: t.textMuted, border: `1px solid ${t.border}` },
      green: { background: dark ? "#052E16" : "#F0FDF4", color: dark ? "#4ADE80" : "#15803D", border: `1px solid ${dark ? "#166534" : "#BBF7D0"}` },
      blue: { background: t.blue50, color: t.blueText, border: `1px solid ${dark ? "rgba(79,142,247,.2)" : "rgba(22,82,201,.15)"}` },
    };
    return { width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, ...map[color] };
  };

  const txAmtColor = (item: TxItem) => {
    if (item.color === "green") return dark ? "#4ADE80" : "#15803D";
    if (item.color === "blue") return t.blueText;
    return dark ? "#F87171" : "#E24B4A";
  };

  const TxIcon = ({ icon }: { icon: TxItem["icon"] }) => icon === "bus" ? <IconBus /> : icon === "trend" ? <IconTrendUp /> : <IconLockSm />;

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      {/* Mobile offline badge */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: dark ? "#1A2644" : "#EEF4FF", border: `1px solid ${dark ? "rgba(79,142,247,.3)" : "rgba(22,82,201,.2)"}`, borderRadius: 20, padding: "6px 14px" }}>
          <span style={{ position: "relative", width: 10, height: 10, borderRadius: "50%", background: t.blueText, display: "inline-block", animation: "mobilispulse 2s infinite" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: t.blueText, letterSpacing: ".4px", textTransform: "uppercase" }}>Bluetooth Ready — Offline Mode</span>
        </div>
      </div>

      {/* Main grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }} className="dash-grid">
        {/* ── LEFT COLUMN (2/3) ── */}
        <div className="dash-col-main" style={{ gridColumn: "1 / 3", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Balance card */}
          <div style={{ background: "linear-gradient(135deg, #1652C9 0%, #0A1931 100%)", borderRadius: 24, padding: 28, color: "#fff", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -30, right: -30, width: 180, height: 180, background: "rgba(255,255,255,.07)", borderRadius: "50%" }} />
            <p style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.65)", marginBottom: 6 }}>Available to Spend</p>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, margin: "6px 0" }}>
              <span style={{ fontSize: 52, fontWeight: 900, letterSpacing: -2, lineHeight: 1 }}>42.50</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,.55)", marginLeft: 4 }}>USDC</span>
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
              <button style={{ flex: 1, background: "#fff", color: "#1652C9", border: "none", borderRadius: 14, padding: 14, fontWeight: 800, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><IconAdd /> Add Funds</button>
              <button style={{ flex: 1, background: "rgba(255,255,255,.1)", color: "#fff", border: "1px solid rgba(255,255,255,.2)", borderRadius: 14, padding: 14, fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><IconSend /> Send / Settle</button>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {/* Scan & Beam */}
            <div style={{ background: dark ? "#1F1A0A" : "#FFFBEB", border: `1px solid ${dark ? "#78350F" : "#F4D03F"}`, borderRadius: 20, padding: 22, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: dark ? "#292200" : "#FEF9C3", color: dark ? "#FBBF24" : "#92400E", display: "flex", alignItems: "center", justifyContent: "center" }}><IconScan /></div>
              <span style={{ fontWeight: 800, fontSize: 15, color: t.textPrim }}>Scan & Beam</span>
              <span style={{ fontSize: 11, color: t.textMuted, textAlign: "center" }}>Pay fare offline</span>
            </div>
            {/* My Vault */}
            <div style={{ background: dark ? "#200A0A" : "#FFF5F5", border: `1px solid ${dark ? "#7F1D1D" : "#FECACA"}`, borderRadius: 20, padding: 22, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: dark ? "#3B0A0A" : "#FEE2E2", color: dark ? "#F87171" : "#991B1B", display: "flex", alignItems: "center", justifyContent: "center" }}><IconLock /></div>
              <span style={{ fontWeight: 800, fontSize: 15, color: dark ? "#F87171" : "#991B1B" }}>My Vault</span>
              <span style={{ fontSize: 11, color: t.textMuted, textAlign: "center" }}>Lock & earn</span>
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN (1/3) ── */}
        <div className="dash-col-side" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Trust Score */}
          <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderLeft: "4px solid #22C55E", borderRadius: "0 20px 20px 0", padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14, color: t.textPrim }}>Trust Score</div>
                <div style={{ display: "inline-block", marginTop: 4, background: dark ? "#052E16" : "#F0FDF4", color: dark ? "#4ADE80" : "#15803D", fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 12, letterSpacing: ".4px" }}>EXCELLENT</div>
              </div>
              <span style={{ fontSize: 38, fontWeight: 900, color: t.blueText }}>720</span>
            </div>
            <div style={{ background: t.bgPage, borderRadius: 10, padding: "10px 12px", fontSize: 12, color: t.textMuted, lineHeight: 1.5 }}>You qualify for an automated <strong style={{ color: t.textPrim }}>50 USDC</strong> fuel loan based on your collateral.</div>
          </div>

          {/* Activity Feed */}
          <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 20, padding: 20, flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontWeight: 800, fontSize: 15, color: t.textPrim }}>Activity</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: t.blueText, cursor: "pointer" }}>View all</span>
            </div>
            {TRANSACTIONS.map((tx, i) => (
              <div key={tx.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderBottom: i < TRANSACTIONS.length - 1 ? `1px solid ${t.border}` : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={txIconStyle(tx.color)}><TxIcon icon={tx.icon} /></div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: t.textPrim }}>{tx.name}</div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: t.textFaint, textTransform: "uppercase", letterSpacing: ".4px", marginTop: 1 }}>{tx.meta}</div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: txAmtColor(tx) }}>{tx.amount}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: t.textFaint }}>USDC</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 700px) {
          .dash-grid { grid-template-columns: 1fr !important; }
          .dash-col-main { grid-column: 1 !important; }
          .dash-col-side { grid-column: 1 !important; }
        }
      `}</style>
    </div>
  );
};

// ---------------------------------------------------------------------------
// UserDashboard (entry point — wraps with layout)
// ---------------------------------------------------------------------------
const UserDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState("wallet");
  const [approvalStatus, setApprovalStatus] = useState<boolean | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      const user = auth.currentUser;
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            setApprovalStatus(userDoc.data().approved);
          }
        } catch (error) {
          console.error("Error fetching approval status:", error);
        }
      }
    };
    fetchStatus();
  }, []);

  // Show nothing or a loading spinner while fetching
  if (approvalStatus === null) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "#F8F9FA", color: "#6B7280", fontFamily: "'Inter', sans-serif" }}>
        Loading your workspace...
      </div>
    );
  }

  // Intercept the dashboard if the user is flagged as pending
  if (approvalStatus === false) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "#F8F9FA", fontFamily: "'Inter', sans-serif", padding: 20 }}>
        <div style={{ background: "#ffffff", padding: "40px", borderRadius: 24, boxShadow: "0 10px 40px rgba(0,0,0,0.05)", maxWidth: 400, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ width: 80, height: 80, background: "#FEF3C7", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
            <IconPending />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: "#111827", margin: "0 0 10px", letterSpacing: "-0.5px" }}>Verification Pending</h2>
          <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.6, margin: 0 }}>
            Your account documentation is currently under review. You will be granted access to the dashboard once your cooperative or system administrator approves your application.
          </p>
        </div>
      </div>
    );
  }

  return (
    <UserLayout activeTab={activeTab} onTabChange={setActiveTab}>
      <DashboardContent />
    </UserLayout>
  );
};

export default UserDashboard;