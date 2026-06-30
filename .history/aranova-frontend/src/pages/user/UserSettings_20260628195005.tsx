
import React from "react";
import UserLayout, { useTheme } from "../../components/layout/UserLayout";

const UserSettings = () => {
  const { dark } = useTheme();

  const handleNav = (key: string) => {
    const routes: Record<string, string> = { wallet: "/user", vault: "/user/vault", activity: "/user/activity", profile: "/user/profile", settings: "/user/settings" };
    window.location.href = routes[key] || "/user";
  };

  const cardBg = dark ? "bg-[#1A1D27] border-[#2A2D3A]" : "bg-white border-gray-100";
  const textMain = dark ? "text-[#F1F5F9]" : "text-gray-900";
  const textMuted = dark ? "text-[#94A3B8]" : "text-gray-500";

  return (
    <UserLayout activeTab="settings" onTabChange={handleNav}>
      <div className="max-w-2xl mx-auto space-y-6">

        <h1 className={`text-2xl font-black mb-4 ${textMain}`}>Settings</h1>

        {/* Security Settings */}
        <div className={`border rounded-[24px] shadow-sm overflow-hidden ${cardBg}`}>
          <div className={`px-6 py-4 border-b ${dark ? 'border-gray-800' : 'border-gray-100'}`}>
            <h3 className={`font-black text-sm uppercase tracking-wider ${textMuted}`}>Security</h3>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            <div className="p-6 flex justify-between items-center">
              <div>
                <p className={`font-bold ${textMain}`}>Recovery Phrase</p>
                <p className={`text-xs mt-1 ${textMuted}`}>Backup your AES-256 encrypted keys.</p>
              </div>
              <button className="text-blue-500 font-bold text-sm">Reveal</button>
            </div>
            <div className="p-6 flex justify-between items-center">
              <div>
                <p className={`font-bold ${textMain}`}>Biometric Login</p>
                <p className={`text-xs mt-1 ${textMuted}`}>Use FaceID / Fingerprint</p>
              </div>
              {/* Fake Toggle */}
              <div className="w-12 h-6 bg-blue-500 rounded-full relative cursor-pointer">
                <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Developer / Network Settings */}
        <div className={`border rounded-[24px] shadow-sm overflow-hidden ${cardBg}`}>
          <div className={`px-6 py-4 border-b ${dark ? 'border-gray-800' : 'border-gray-100'}`}>
            <h3 className={`font-black text-sm uppercase tracking-wider ${textMuted}`}>Network</h3>
          </div>
          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <p className={`font-bold ${textMain}`}>Stellar Network</p>
              <span className="bg-green-100 text-green-700 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">Mainnet</span>
            </div>
            <p className={`text-xs ${textMuted}`}>
              Currently transacting on live Stellar Mainnet. Testnet switching is disabled for this build.
            </p>
          </div>
        </div>

      </div>
    </UserLayout>
  );
};

export default UserSettings;

export default UserProfile;
C: \Users\Renz Jericho Buday\aranova\aranova - frontend\src\pages\user\UserActivity.tsx
import React from "react";
import UserLayout, { useTheme } from "../../components/layout/UserLayout";

const UserActivity = () => {
  const { dark } = useTheme();

  const handleNav = (key: string) => {
    const routes: Record<string, string> = { wallet: "/user", vault: "/user/vault", activity: "/user/activity", profile: "/user/profile", settings: "/user/settings" };
    window.location.href = routes[key] || "/user";
  };

  const cardBg = dark ? "bg-[#1A1D27] border-[#2A2D3A]" : "bg-white border-gray-100";
  const textMain = dark ? "text-[#F1F5F9]" : "text-gray-900";
  const textMuted = dark ? "text-[#94A3B8]" : "text-gray-500";
  const itemHover = dark ? "hover:bg-white/5" : "hover:bg-gray-50";

  // Dummy Activity Data
  const logs = [
    { title: "Jeepney Fare", sub: "TODAY, 8:42 AM • OFFLINE BLUETOOTH", amt: "-0.25", color: "text-red-500", icon: "🚐", bg: "bg-gray-100 text-gray-800" },
    { title: "Vault Deposit", sub: "OCT 12, 2:15 PM • SMART CONTRACT", amt: "-100.00", color: "text-blue-500", icon: "🔒", bg: "bg-blue-50 text-blue-600" },
    { title: "Coop Fuel Loan", sub: "OCT 10, 6:00 AM • ON-CHAIN", amt: "+50.00", color: "text-green-500", icon: "⛽", bg: "bg-amber-50 text-amber-600" },
    { title: "Tricycle Fare", sub: "OCT 09, 5:30 PM • OFFLINE BLUETOOTH", amt: "-0.50", color: "text-red-500", icon: "🛺", bg: "bg-gray-100 text-gray-800" },
  ];

  return (
    <UserLayout activeTab="activity" onTabChange={handleNav}>
      <div className="max-w-3xl mx-auto space-y-6">

        <div className="flex justify-between items-center mb-4">
          <h1 className={`text-2xl font-black ${textMain}`}>Activity Logs</h1>
          <button className={`p-2 border rounded-lg text-sm font-bold ${dark ? 'border-gray-700 text-gray-300' : 'border-gray-200 text-gray-600'}`}>
            Filter
          </button>
        </div>

        <div className={`border rounded-[24px] shadow-sm overflow-hidden ${cardBg}`}>
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {logs.map((item, i) => (
              <div key={i} className={`flex items-center justify-between p-5 cursor-pointer transition-colors ${itemHover}`}>
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl ${item.bg}`}>
                    {item.icon}
                  </div>
                  <div>
                    <p className={`font-bold text-base ${textMain}`}>{item.title}</p>
                    <p className={`text-[10px] font-bold tracking-wider uppercase mt-1 ${textMuted}`}>{item.sub}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-black text-lg ${item.color}`}>{item.amt}</p>
                  <p className={`text-[10px] font-bold ${textMuted}`}>USDC</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </UserLayout>
  );
};

export default UserActivity;


C: \Users\Renz Jericho Buday\aranova\aranova - frontend\src\pages\user\UserDashboard.tsximport React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc, collection, query, where, getDocs, updateDoc, deleteDoc } from "firebase/firestore";
import { auth, db } from "../../firebase/config";
import UserLayout, { useTheme } from "../../components/layout/UserLayout";

// ---------------------------------------------------------------------------
// SVG Icons
// ---------------------------------------------------------------------------
const IconScan = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M23 7V1h-6" /><path d="M1 7V1h6" /><path d="M23 17v6h-6" /><path d="M1 17v6h6" /><line x1="9" y1="9" x2="15" y2="9" /><line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="15" x2="15" y2="15" /></svg>);
const IconLock = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>);
const IconAdd = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>);
const IconSend = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>);
const IconPending = () => (<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>);
const IconExternalLink = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 4 }}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>);
const IconFuel = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 22v-8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8" /><path d="M4 12V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6" /><rect x="6" y="7" width="8" height="3" rx="1" /><path d="M17 10h1.5a1.5 1.5 0 0 1 1.5 1.5V14a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2v-2a4 4 0 0 0-4-4h-3" /></svg>);

// ---------------------------------------------------------------------------
// 1. DRIVER DASHBOARD
// ---------------------------------------------------------------------------
const DriverContent: React.FC<{ userData: any }> = ({ userData }) => {
  const { dark } = useTheme();
  const [balance, setBalance] = useState("...");

  const t = {
    bgCard: dark ? "#1A1D27" : "#ffffff", bgPage: dark ? "#0F1117" : "#F8F9FA",
    border: dark ? "#2A2D3A" : "#E5E7EB", textPrim: dark ? "#F1F5F9" : "#111827",
    textMuted: dark ? "#94A3B8" : "#6B7280", textFaint: dark ? "#475569" : "#9CA3AF",
    blueText: dark ? "#7DB3FF" : "#1652C9", blue50: dark ? "#1A2644" : "#EEF4FF",
  };

  useEffect(() => {
    if (!userData?.publicKey) {
      setBalance("0.00");
      return;
    }
    // Automatically read network preference from Profile, default to Public
    const networkUrl = userData?.network === "TESTNET"
      ? "https://horizon-testnet.stellar.org"
      : "https://horizon.stellar.org";

    fetch(`${networkUrl}/accounts/${userData.publicKey}`)
      .then(res => res.json())
      .then(data => {
        if (data.balances) {
          const xlm = data.balances.find((b: any) => b.asset_type === 'native');
          setBalance(xlm ? parseFloat(xlm.balance).toFixed(2) : "0.00");
        } else {
          setBalance("0.00");
        }
      })
      .catch(() => setBalance("0.00"));
  }, [userData]);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: dark ? "#1A2644" : "#EEF4FF", border: `1px solid ${dark ? "rgba(79,142,247,.3)" : "rgba(22,82,201,.2)"}`, borderRadius: 20, padding: "6px 14px" }}>
          <span style={{ position: "relative", width: 10, height: 10, borderRadius: "50%", background: t.blueText, display: "inline-block", animation: "aranovapulse 2s infinite" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: t.blueText, letterSpacing: ".4px", textTransform: "uppercase" }}>Bluetooth Ready — Offline Mode</span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }} className="dash-grid">
        <div className="dash-col-main" style={{ gridColumn: "1 / 3", display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ background: "linear-gradient(135deg, #1652C9 0%, #0A1931 100%)", borderRadius: 24, padding: 28, color: "#fff", position: "relative", overflow: "hidden" }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.65)", marginBottom: 6 }}>Available Balance</p>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, margin: "6px 0" }}>
              <span style={{ fontSize: 52, fontWeight: 900, letterSpacing: -2, lineHeight: 1 }}>{balance}</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,.55)", marginLeft: 4 }}>XLM</span>
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
              <button
                onClick={() => window.open('https://laboratory.stellar.org/#account-creator', '_blank')}
                style={{ flex: 1, background: "#fff", color: "#1652C9", border: "none", borderRadius: 14, padding: 14, fontWeight: 800, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <IconAdd /> Fund via Stellar Lab <IconExternalLink />
              </button>
              <button style={{ flex: 1, background: "rgba(255,255,255,.1)", color: "#fff", border: "1px solid rgba(255,255,255,.2)", borderRadius: 14, padding: 14, fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><IconSend /> Send / Settle</button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ background: dark ? "#1F1A0A" : "#FFFBEB", border: `1px solid ${dark ? "#78350F" : "#F4D03F"}`, borderRadius: 20, padding: 22, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: dark ? "#292200" : "#FEF9C3", color: dark ? "#FBBF24" : "#92400E", display: "flex", alignItems: "center", justifyContent: "center" }}><IconScan /></div>
              <span style={{ fontWeight: 800, fontSize: 15, color: t.textPrim }}>Receive Fare</span>
              <span style={{ fontSize: 11, color: t.textMuted, textAlign: "center" }}>Scan offline payments</span>
            </div>
            <div style={{ background: dark ? "#200A0A" : "#FFF5F5", border: `1px solid ${dark ? "#7F1D1D" : "#FECACA"}`, borderRadius: 20, padding: 22, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: dark ? "#3B0A0A" : "#FEE2E2", color: dark ? "#F87171" : "#991B1B", display: "flex", alignItems: "center", justifyContent: "center" }}><IconLock /></div>
              <span style={{ fontWeight: 800, fontSize: 15, color: dark ? "#F87171" : "#991B1B" }}>My Vault</span>
              <span style={{ fontSize: 11, color: t.textMuted, textAlign: "center" }}>Lock & earn</span>
            </div>
          </div>
        </div>
        <div className="dash-col-side" style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderLeft: "4px solid #22C55E", borderRadius: "0 20px 20px 0", padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14, color: t.textPrim }}>Trust Score</div>
                <div style={{ display: "inline-block", marginTop: 4, background: dark ? "#052E16" : "#F0FDF4", color: dark ? "#4ADE80" : "#15803D", fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 12, letterSpacing: ".4px" }}>EXCELLENT</div>
              </div>
              <span style={{ fontSize: 38, fontWeight: 900, color: t.blueText }}>720</span>
            </div>
          </div>

          {/* NEW: Cooperative Fuel Credit Block */}
          <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderLeft: "4px solid #F59E0B", borderRadius: "0 20px 20px 0", padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14, color: t.textPrim, display: "flex", alignItems: "center", gap: 6 }}><IconFuel /> Coop Fuel Credit</div>
                <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4 }}>Maximum limit set by your Cooperative</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, margin: "6px 0" }}>
              <span style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1, color: "#F59E0B" }}>150.00</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: t.textMuted, marginLeft: 2 }}>XLM Available</span>
            </div>
            <button style={{ width: "100%", marginTop: 10, background: dark ? "#451A03" : "#FEF3C7", color: dark ? "#FCD34D" : "#92400E", border: "none", borderRadius: 8, padding: "8px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              Request Fuel Advance
            </button>
          </div>

          <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 20, padding: 20, flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontWeight: 800, fontSize: 15, color: t.textPrim }}>Recent Fares</span>
            </div>
            <div style={{ textAlign: "center", padding: "20px", color: t.textMuted, fontSize: 13 }}>No recent transactions.</div>
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
  const [balance, setBalance] = useState("...");

  const t = {
    bgCard: dark ? "#1A1D27" : "#ffffff", border: dark ? "#2A2D3A" : "#E5E7EB",
    textPrim: dark ? "#F1F5F9" : "#111827", textMuted: dark ? "#94A3B8" : "#6B7280"
  };

  useEffect(() => {
    if (!userData?.publicKey) {
      setBalance("0.00");
      return;
    }
    const networkUrl = userData?.network === "TESTNET"
      ? "https://horizon-testnet.stellar.org"
      : "https://horizon.stellar.org";

    fetch(`${networkUrl}/accounts/${userData.publicKey}`)
      .then(res => res.json())
      .then(data => {
        if (data.balances) {
          const xlm = data.balances.find((b: any) => b.asset_type === 'native');
          setBalance(xlm ? parseFloat(xlm.balance).toFixed(2) : "0.00");
        } else {
          setBalance("0.00");
        }
      })
      .catch(() => setBalance("0.00"));
  }, [userData]);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }} className="dash-grid">
        <div className="dash-col-main" style={{ gridColumn: "1 / 3", display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ background: "linear-gradient(135deg, #10B981 0%, #064E3B 100%)", borderRadius: 24, padding: 28, color: "#fff", position: "relative", overflow: "hidden" }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.8)", marginBottom: 6 }}>Live Wallet Balance</p>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, margin: "6px 0" }}>
              <span style={{ fontSize: 52, fontWeight: 900, letterSpacing: -2, lineHeight: 1 }}>{balance}</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,.8)", marginLeft: 4 }}>XLM</span>
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
              <button
                onClick={() => window.open('https://laboratory.stellar.org/#account-creator', '_blank')}
                style={{ flex: 1, background: "#fff", color: "#064E3B", border: "none", borderRadius: 14, padding: 14, fontWeight: 800, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <IconAdd /> Fund via Stellar Lab <IconExternalLink />
              </button>
              <button style={{ flex: 1, background: "rgba(255,255,255,.15)", color: "#fff", border: "1px solid rgba(255,255,255,.2)", borderRadius: 14, padding: 14, fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><IconSend /> Transfer</button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
            <div style={{ background: dark ? "#1F1A0A" : "#FFFBEB", border: `1px solid ${dark ? "#78350F" : "#F4D03F"}`, borderRadius: 20, padding: 22, display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
              <div>
                <span style={{ fontWeight: 800, fontSize: 18, color: t.textPrim, display: "block", marginBottom: 4 }}>Scan to Pay Fare</span>
                <span style={{ fontSize: 13, color: t.textMuted }}>Tap your phone or scan driver's QR</span>
              </div>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: dark ? "#292200" : "#FEF9C3", color: dark ? "#FBBF24" : "#92400E", display: "flex", alignItems: "center", justifyContent: "center" }}><IconScan /></div>
            </div>
          </div>
        </div>
        <div className="dash-col-side" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 20, padding: 20, flex: 1 }}>
            <span style={{ fontWeight: 800, fontSize: 15, color: t.textPrim, display: "block", marginBottom: 16 }}>Loyalty Points</span>
            <div style={{ fontSize: 32, fontWeight: 900, color: "#10B981" }}>450 <span style={{ fontSize: 12, color: t.textMuted, fontWeight: 600 }}>PTS</span></div>
            <p style={{ fontSize: 12, color: t.textMuted, marginTop: 8 }}>Only 50 more points for a free Jeepney ride!</p>
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
  const [pendingDrivers, setPendingDrivers] = useState<any[]>([]);
  const [approvedDriversCount, setApprovedDriversCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const t = {
    bgCard: dark ? "#1A1D27" : "#ffffff", border: dark ? "#2A2D3A" : "#E5E7EB",
    textPrim: dark ? "#F1F5F9" : "#111827", textMuted: dark ? "#94A3B8" : "#6B7280"
  };

  const fetchDrivers = async () => {
    try {
      setLoading(true);
      const qPending = query(collection(db, "users"), where("role", "==", "driver"), where("cooperativeId", "==", userData.uid), where("approved", "==", false));
      const snapshotPending = await getDocs(qPending);
      const drivers: any[] = [];
      snapshotPending.forEach(docSnap => drivers.push({ id: docSnap.id, ...docSnap.data() }));
      setPendingDrivers(drivers);

      const qApproved = query(collection(db, "users"), where("role", "==", "driver"), where("cooperativeId", "==", userData.uid), where("approved", "==", true));
      const snapshotApproved = await getDocs(qApproved);
      setApprovedDriversCount(snapshotApproved.size);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDrivers(); }, []);

  const handleApprove = async (id: string) => {
    try {
      await updateDoc(doc(db, "users", id), { approved: true, coopStatus: "approved" });
      setPendingDrivers(prev => prev.filter(d => d.id !== id));
      setApprovedDriversCount(prev => prev + 1);
    } catch (error) {
      console.error("Failed to approve driver:", error);
      alert("Error: You do not have permission to approve this driver.");
    }
  };

  const handleDecline = async (id: string) => {
    if (!window.confirm("Delete this driver application?")) return;
    try {
      await deleteDoc(doc(db, "users", id));
      setPendingDrivers(prev => prev.filter(d => d.id !== id));
    } catch (error) {
      console.error("Failed to decline driver:", error);
      alert("Error: You do not have permission to delete this driver.");
    }
  };

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: t.textPrim, marginBottom: 20 }}>Cooperative Management</h2>

      {/* Set Fuel Credit Master Control (Static UI block for now) */}
      <div style={{ background: dark ? "#3B210B" : "#FFFBEB", border: `1px solid ${dark ? "#78350F" : "#FDE68A"}`, borderRadius: 16, padding: "16px 20px", marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14, color: dark ? "#FCD34D" : "#92400E" }}>Driver Fuel Credit Limit</div>
          <div style={{ fontSize: 12, color: dark ? "#D97706" : "#B45309", marginTop: 4 }}>Set the max available XLM advance for verified drivers.</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input type="number" defaultValue={150} style={{ width: 80, padding: "8px", borderRadius: 8, border: `1px solid ${dark ? "#78350F" : "#FDE68A"}`, background: dark ? "#451A03" : "#fff", color: t.textPrim, fontWeight: 700 }} />
          <button style={{ background: "#F59E0B", color: "#fff", border: "none", padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Save</button>
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
                    <button onClick={() => handleApprove(d.id)} style={{ background: "#10B981", color: "#fff", border: "none", padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, marginRight: 8, cursor: "pointer" }}>Approve</button>
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
          }
        } catch (error) {
          console.error("Error fetching user status:", error);
        }
      } else {
        navigate("/auth");
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, [navigate]);

  if (authLoading || userData === null) {
    return <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "#F8F9FA", color: "#6B7280", fontFamily: "'Inter', sans-serif" }}>Loading your workspace...</div>;
  }

  if (userData.approved === false) {
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

  if (userData.approved === true && userData.walletCreated === false) {
    navigate("/auth");
    return null;
  }

  return (
    <>
      <style>{`
        @media (max-width: 700px) {
          .dash-grid { grid-template-columns: 1fr !important; }
          .dash-col-main { grid-column: 1 !important; }
          .dash-col-side { grid-column: 1 !important; }
        }
      `}</style>
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


C: \Users\Renz Jericho Buday\aranova\aranova - frontend\src\pages\user\UserSettings.tsximport React from "react";
import UserLayout, { useTheme } from "../../components/layout/UserLayout";

const UserSettings = () => {
  const { dark } = useTheme();

  const handleNav = (key: string) => {
    const routes: Record<string, string> = { wallet: "/user", vault: "/user/vault", activity: "/user/activity", profile: "/user/profile", settings: "/user/settings" };
    window.location.href = routes[key] || "/user";
  };

  const cardBg = dark ? "bg-[#1A1D27] border-[#2A2D3A]" : "bg-white border-gray-100";
  const textMain = dark ? "text-[#F1F5F9]" : "text-gray-900";
  const textMuted = dark ? "text-[#94A3B8]" : "text-gray-500";

  return (
    <UserLayout activeTab="settings" onTabChange={handleNav}>
      <div className="max-w-2xl mx-auto space-y-6">

        <h1 className={`text-2xl font-black mb-4 ${textMain}`}>Settings</h1>

        {/* Security Settings */}
        <div className={`border rounded-[24px] shadow-sm overflow-hidden ${cardBg}`}>
          <div className={`px-6 py-4 border-b ${dark ? 'border-gray-800' : 'border-gray-100'}`}>
            <h3 className={`font-black text-sm uppercase tracking-wider ${textMuted}`}>Security</h3>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            <div className="p-6 flex justify-between items-center">
              <div>
                <p className={`font-bold ${textMain}`}>Recovery Phrase</p>
                <p className={`text-xs mt-1 ${textMuted}`}>Backup your AES-256 encrypted keys.</p>
              </div>
              <button className="text-blue-500 font-bold text-sm">Reveal</button>
            </div>
            <div className="p-6 flex justify-between items-center">
              <div>
                <p className={`font-bold ${textMain}`}>Biometric Login</p>
                <p className={`text-xs mt-1 ${textMuted}`}>Use FaceID / Fingerprint</p>
              </div>
              {/* Fake Toggle */}
              <div className="w-12 h-6 bg-blue-500 rounded-full relative cursor-pointer">
                <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Developer / Network Settings */}
        <div className={`border rounded-[24px] shadow-sm overflow-hidden ${cardBg}`}>
          <div className={`px-6 py-4 border-b ${dark ? 'border-gray-800' : 'border-gray-100'}`}>
            <h3 className={`font-black text-sm uppercase tracking-wider ${textMuted}`}>Network</h3>
          </div>
          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <p className={`font-bold ${textMain}`}>Stellar Network</p>
              <span className="bg-green-100 text-green-700 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">Mainnet</span>
            </div>
            <p className={`text-xs ${textMuted}`}>
              Currently transacting on live Stellar Mainnet. Testnet switching is disabled for this build.
            </p>
          </div>
        </div>

      </div>
    </UserLayout>
  );
};

export default UserSettings;