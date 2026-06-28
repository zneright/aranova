import React, {
  useState,
  useEffect,
  useRef,
  createContext,
  useContext,
} from "react";

// ─── Theme Context ────────────────────────────────────────────────────────────
interface AdminThemeCtx {
  dark: boolean;
  toggleDark: () => void;
}
export const AdminThemeContext = createContext<AdminThemeCtx>({
  dark: false,
  toggleDark: () => {},
});
export const useAdminTheme = () => useContext(AdminThemeContext);

// ─── Active Page Context ──────────────────────────────────────────────────────
interface AdminPageCtx {
  activePage: string;
  setActivePage: (p: string) => void;
}
export const AdminPageContext = createContext<AdminPageCtx>({
  activePage: "dashboard",
  setActivePage: () => {},
});
export const useAdminPage = () => useContext(AdminPageContext);

// ─── SVG Icons ────────────────────────────────────────────────────────────────
const Ico = ({
  d,
  size = 18,
  color = "currentColor",
  extra,
}: {
  d: string | React.ReactNode;
  size?: number;
  color?: string;
  extra?: React.ReactNode;
}) =>
  typeof d === "string" ? (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
      {extra}
    </svg>
  ) : (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {d}
    </svg>
  );

// Named icons
const IcoDashboard = ({ c }: { c: string }) => <Ico color={c} d={<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>} />;
const IcoPool = ({ c }: { c: string }) => <Ico color={c} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />;
const IcoLoans = ({ c }: { c: string }) => <Ico color={c} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />;
const IcoLogs = ({ c }: { c: string }) => <Ico color={c} d="M13 10V3L4 14h7v7l9-11h-7z" />;
const IcoMembers = ({ c }: { c: string }) => <Ico color={c} d={<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>} />;
const IcoVaults = ({ c }: { c: string }) => <Ico color={c} d={<><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>} />;
const IcoCredit = ({ c }: { c: string }) => <Ico color={c} d={<><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>} />;
const IcoTransactions = ({ c }: { c: string }) => <Ico color={c} d={<><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></>} />;
const IcoReports = ({ c }: { c: string }) => <Ico color={c} d={<><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></>} />;
const IcoDisputes = ({ c }: { c: string }) => <Ico color={c} d={<><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>} />;
const IcoNode = ({ c }: { c: string }) => <Ico color={c} d={<><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>} />;
const IcoSettings = ({ c }: { c: string }) => <Ico color={c} d={<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>} />;
const IcoAudit = ({ c }: { c: string }) => <Ico color={c} d={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></>} />;
const IcoBell = ({ c }: { c: string }) => <Ico color={c} d={<><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>} />;
const IcoChevron = ({ open, c }: { open: boolean; c: string }) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform .2s" }}><polyline points="6 9 12 15 18 9" /></svg>;
const IcoMenu = ({ c }: { c: string }) => <Ico color={c} d={<><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>} />;
const IcoX = ({ c }: { c: string }) => <Ico color={c} d={<><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>} />;
const IcoLogout = ({ c }: { c: string }) => <Ico color={c} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />;
const IcoSun = ({ c }: { c: string }) => <Ico color={c} d={<><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></>} />;
const IcoMoon = ({ c }: { c: string }) => <Ico color={c} d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />;
const IcoUser = ({ c }: { c: string }) => <Ico color={c} d={<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>} />;

// ─── Nav Config ───────────────────────────────────────────────────────────────
interface NavItem {
  key: string;
  label: string;
  icon: (c: string) => React.ReactNode;
  badge?: number;
}
interface NavGroup {
  section: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    section: "Core",
    items: [
      { key: "dashboard",    label: "Dashboard",        icon: (c) => <IcoDashboard c={c} /> },
      { key: "coop-pool",    label: "Coop Pool",        icon: (c) => <IcoPool c={c} /> },
      { key: "loan-requests",label: "Loan Requests",    icon: (c) => <IcoLoans c={c} />, badge: 3 },
    ],
  },
  {
    section: "Members",
    items: [
      { key: "members",      label: "Members",          icon: (c) => <IcoMembers c={c} /> },
      { key: "vaults",       label: "Vaults",           icon: (c) => <IcoVaults c={c} /> },
      { key: "credit-scores",label: "Credit Scores",    icon: (c) => <IcoCredit c={c} /> },
    ],
  },
  {
    section: "Finance",
    items: [
      { key: "transactions", label: "Transactions",     icon: (c) => <IcoTransactions c={c} /> },
      { key: "telegraphy",   label: "Telegraphy Logs",  icon: (c) => <IcoLogs c={c} />, badge: 8 },
      { key: "reports",      label: "Reports",          icon: (c) => <IcoReports c={c} /> },
      { key: "disputes",     label: "Disputes",         icon: (c) => <IcoDisputes c={c} />, badge: 1 },
    ],
  },
  {
    section: "System",
    items: [
      { key: "node",         label: "Node Status",      icon: (c) => <IcoNode c={c} /> },
      { key: "audit",        label: "Audit Trail",      icon: (c) => <IcoAudit c={c} /> },
      { key: "settings",     label: "Settings",         icon: (c) => <IcoSettings c={c} /> },
    ],
  },
];

// ─── AdminLayout ──────────────────────────────────────────────────────────────
interface AdminLayoutProps {
  children: React.ReactNode;
  activePage?: string;
  onPageChange?: (p: string) => void;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({
  children,
  activePage = "dashboard",
  onPageChange,
}) => {
  const [dark, setDark] = useState(true); // admin defaults dark
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Sync dark mode to the global document object so Tailwind dark classes work
  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [dark]);

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
      else setSidebarOpen(true);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node))
        setProfileOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleNav = (key: string) => {
    onPageChange?.(key);
    if (isMobile) setSidebarOpen(false);
  };

  const SB_W = 260;

  // ── Corrected Color tokens ───────────────────────────────────────────────
  const tk = {
    sbBg:       dark ? "#0E1016" : "#ffffff",
    sbBorder:   dark ? "rgba(255,255,255,0.07)" : "#E5E7EB",
    sbText:     dark ? "#94A3B8" : "#64748B",
    sbActive:   "#3B82F6",
    sbActiveBg: dark ? "rgba(59,130,246,0.12)" : "#EFF6FF",
    sbActiveBdr:dark ? "rgba(59,130,246,0.3)" : "#BFDBFE",
    sbHoverBg:  dark ? "rgba(255,255,255,0.05)" : "#F8FAFC",
    sbSection:  dark ? "#475569" : "#94A3B8",
    headerBg:   dark ? "#13151E" : "#ffffff",
    headerBdr:  dark ? "rgba(255,255,255,0.07)" : "#E5E7EB",
    mainBg:     dark ? "#0C0E16" : "#F8F9FA",
    mainBdr:    dark ? "rgba(255,255,255,0.07)" : "#E5E7EB",
    text:       dark ? "#F1F5F9" : "#0D1117",
    textMid:    dark ? "#94A3B8" : "#4B5563",
    textFaint:  dark ? "#475569" : "#9CA3AF",
    card:       dark ? "#141722" : "#ffffff",
    cardBdr:    dark ? "rgba(255,255,255,0.07)" : "#E5E7EB",
    blue:       "#3B82F6",
    blueText:   dark ? "#60A5FA" : "#2563EB",
    green:      dark ? "#34D399" : "#059669",
    red:        dark ? "#F87171" : "#DC2626",
    amber:      dark ? "#FBBF24" : "#D97706",
    badge:      "#3B82F6",
  };

  const NavLink = ({ item }: { item: NavItem }) => {
    const isActive = activePage === item.key;
    return (
      <button
        onClick={() => handleNav(item.key)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: "9px 12px",
          borderRadius: 10,
          border: isActive ? `1px solid ${tk.sbActiveBdr}` : "1px solid transparent",
          background: isActive ? tk.sbActiveBg : "transparent",
          cursor: "pointer",
          textAlign: "left",
          transition: "background .12s, border .12s",
        }}
        onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = tk.sbHoverBg; }}
        onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {item.icon(isActive ? tk.sbActive : tk.sbText)}
          <span style={{ fontSize: 13, fontWeight: isActive ? 700 : 500, color: isActive ? tk.text : tk.sbText, letterSpacing: "0.1px" }}>
            {item.label}
          </span>
        </div>
        {item.badge && (
          <span style={{ background: tk.badge, color: "#fff", fontSize: 10, fontWeight: 800, padding: "1px 7px", borderRadius: 20, minWidth: 20, textAlign: "center" }}>
            {item.badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <AdminThemeContext.Provider value={{ dark, toggleDark: () => setDark((d) => !d) }}>
      <AdminPageContext.Provider value={{ activePage, setActivePage: (p) => onPageChange?.(p) }}>
        <div style={{ display: "flex", height: "100vh", overflow: "hidden", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: tk.mainBg, color: tk.text, transition: "background .2s, color .2s" }}>

          {/* ── MOBILE OVERLAY ─────────────────────────────────────────── */}
          {isMobile && sidebarOpen && (
            <div
              onClick={() => setSidebarOpen(false)}
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)", zIndex: 90 }}
            />
          )}

          {/* ── SIDEBAR ────────────────────────────────────────────────── */}
          <aside
            style={{
              width: SB_W,
              background: tk.sbBg,
              borderRight: `1px solid ${tk.sbBorder}`,
              display: "flex",
              flexDirection: "column",
              flexShrink: 0,
              transition: "transform .25s ease, margin .25s ease, background .2s, border .2s",
              zIndex: isMobile ? 95 : 1,
              ...(isMobile
                ? { position: "fixed", top: 0, left: 0, bottom: 0, transform: sidebarOpen ? "translateX(0)" : `translateX(-${SB_W}px)` }
                : { transform: sidebarOpen ? "translateX(0)" : "translateX(0)", marginLeft: sidebarOpen ? 0 : -SB_W }),
            }}
          >
            {/* Brand (Fixed Logo_1) */}
            <div style={{ height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px 0 20px", borderBottom: `1px solid ${tk.sbBorder}`, flexShrink: 0, transition: "border .2s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {/* Replaced Icon with logo_1.png */}
                <div style={{ width: 32, height: 32, borderRadius: 8, background: dark ? "rgba(59,130,246,0.15)" : "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <img src="/logo_1.png" alt="Mobilis Logo" style={{ height: 20, width: "auto", objectFit: "contain", filter: dark ? "brightness(0) invert(1)" : "none" }} />
                </div>
                <span style={{ color: tk.text, fontWeight: 900, fontSize: 16, letterSpacing: "-0.3px", transition: "color .2s" }}>MOBILIS</span>
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "1.5px", color: "#3B82F6", background: dark ? "rgba(59,130,246,0.15)" : "#EFF6FF", padding: "2px 6px", borderRadius: 4, textTransform: "uppercase" }}>ADMIN</span>
              </div>
              {isMobile && (
                <button onClick={() => setSidebarOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: tk.sbText }}>
                  <IcoX c={tk.sbText} />
                </button>
              )}
            </div>

            {/* Nav groups */}
            <nav style={{ flex: 1, overflowY: "auto", padding: "16px 10px 8px" }}>
              {NAV_GROUPS.map((group, gi) => (
                <div key={group.section} style={{ marginBottom: gi < NAV_GROUPS.length - 1 ? 24 : 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1.2px", color: tk.sbSection, textTransform: "uppercase", padding: "0 12px", marginBottom: 6, transition: "color .2s" }}>
                    {group.section}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {group.items.map((item) => (
                      <NavLink key={item.key} item={item} />
                    ))}
                  </div>
                </div>
              ))}
            </nav>

            {/* Sidebar footer */}
            <div style={{ padding: "12px 10px", borderTop: `1px solid ${tk.sbBorder}`, flexShrink: 0, transition: "border .2s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg,#3B82F6,#C0392B)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, color: "#fff", flexShrink: 0 }}>A</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: tk.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", transition: "color .2s" }}>Admin User</div>
                  <div style={{ fontSize: 11, color: tk.sbText, transition: "color .2s" }}>admin@mobilis.ph</div>
                </div>
                <a href="/" title="Sign out" style={{ color: tk.sbText, display: "flex", alignItems: "center", justifyContent: "center", padding: 6, borderRadius: 8, textDecoration: "none", transition: "color .15s, background .15s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "#F87171"; e.currentTarget.style.background = "rgba(248,113,113,0.1)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = tk.sbText; e.currentTarget.style.background = "transparent"; }}>
                  <IcoLogout c="currentColor" />
                </a>
              </div>
            </div>
          </aside>

          {/* ── MAIN ───────────────────────────────────────────────────── */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

            {/* ── TOP HEADER ───────────────────────────────────────────── */}
            <header style={{ height: 64, background: tk.headerBg, borderBottom: `1px solid ${tk.headerBdr}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", flexShrink: 0, zIndex: 30, gap: 12, transition: "background .2s, border .2s" }}>
              {/* Left: burger + title */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button
                  onClick={() => setSidebarOpen((v) => !v)}
                  aria-label="Toggle sidebar"
                  style={{ background: dark ? "rgba(255,255,255,0.06)" : "#F1F5F9", border: `1px solid ${tk.sbBorder}`, borderRadius: 8, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: tk.sbText, flexShrink: 0, transition: "background .2s, border .2s" }}
                >
                  <IcoMenu c={tk.sbText} />
                </button>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: tk.text, transition: "color .2s" }}>Cooperative Admin Center</div>
                  <div style={{ fontSize: 11, color: tk.sbText, transition: "color .2s" }}>
                    {NAV_GROUPS.flatMap((g) => g.items).find((i) => i.key === activePage)?.label ?? "Dashboard"}
                  </div>
                </div>
              </div>

              {/* Right: status + dark + bell + profile */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {/* Node status */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, background: dark ? "rgba(52,211,153,0.1)" : "#ECFDF5", border: `1px solid ${dark ? "rgba(52,211,153,0.2)" : "#A7F3D0"}`, borderRadius: 20, padding: "4px 12px", fontSize: 11, fontWeight: 700, color: "#34D399", transition: "background .2s, border .2s" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#34D399", display: "inline-block", animation: "adminpulse 2s infinite" }} />
                  Node Live
                </div>

                {/* Dark toggle */}
                <button
                  onClick={() => setDark((d) => !d)}
                  aria-label="Toggle dark mode"
                  style={{ background: dark ? "rgba(255,255,255,0.06)" : "#F1F5F9", border: `1px solid ${tk.sbBorder}`, borderRadius: 8, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "background .2s, border .2s" }}
                >
                  {dark ? <IcoSun c={tk.sbText} /> : <IcoMoon c={tk.sbText} />}
                </button>

                {/* Bell */}
                <button
                  style={{ background: dark ? "rgba(255,255,255,0.06)" : "#F1F5F9", border: `1px solid ${tk.sbBorder}`, borderRadius: 8, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative", transition: "background .2s, border .2s" }}
                >
                  <IcoBell c={tk.sbText} />
                  <span style={{ position: "absolute", top: 6, right: 6, width: 8, height: 8, background: "#F87171", borderRadius: "50%", border: "2px solid " + tk.headerBg, transition: "border .2s" }} />
                </button>

                {/* Profile dropdown */}
                <div ref={profileRef} style={{ position: "relative" }}>
                  <button
                    onClick={() => setProfileOpen((v) => !v)}
                    style={{ display: "flex", alignItems: "center", gap: 8, background: dark ? "rgba(255,255,255,0.06)" : "#F1F5F9", border: `1px solid ${tk.sbBorder}`, borderRadius: 22, padding: "4px 10px 4px 4px", cursor: "pointer", transition: "background .2s, border .2s" }}
                  >
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#3B82F6,#C0392B)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: "#fff" }}>A</div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: tk.text, transition: "color .2s" }}>Admin</span>
                    <IcoChevron open={profileOpen} c={tk.sbText} />
                  </button>

                  {profileOpen && (
                    <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, background: dark ? "#1A1D2E" : "#fff", border: `1px solid ${tk.cardBdr}`, borderRadius: 12, minWidth: 190, boxShadow: "0 8px 30px rgba(0,0,0,0.3)", zIndex: 200, overflow: "hidden" }}>
                      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${tk.cardBdr}` }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: tk.text }}>Admin User</div>
                        <div style={{ fontSize: 11, color: tk.textMid, marginTop: 2 }}>admin@mobilis.ph</div>
                      </div>
                      {[
                        { icon: (c: string) => <IcoUser c={c} />, label: "Profile" },
                        { icon: (c: string) => <IcoSettings c={c} />, label: "Settings" },
                        { icon: (c: string) => <IcoAudit c={c} />, label: "Audit Trail" },
                      ].map(({ icon, label }) => (
                        <button key={label}
                          style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", color: tk.textMid, fontSize: 13, border: "none", background: "none", width: "100%", textAlign: "left", cursor: "pointer" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = dark ? "rgba(255,255,255,0.05)" : "#F9FAFB")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                        >
                          {icon(tk.sbText)} {label}
                        </button>
                      ))}
                      <div style={{ borderTop: `1px solid ${tk.cardBdr}` }}>
                        <button
                          style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", color: "#F87171", fontSize: 13, border: "none", background: "none", width: "100%", textAlign: "left", cursor: "pointer" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(248,113,113,0.1)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                        >
                          <IcoLogout c="#F87171" /> Sign out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </header>

            {/* ── PAGE CONTENT ─────────────────────────────────────────── */}
            <div style={{ flex: 1, overflowY: "auto", padding: 28, paddingBottom: 40 }}>
              {children}
            </div>
          </div>
        </div>

        <style>{`@keyframes adminpulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
      </AdminPageContext.Provider>
    </AdminThemeContext.Provider>
  );
};

export default AdminLayout;