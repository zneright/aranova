import React, { useState, useEffect, useRef, createContext, useContext } from "react";

// ---------------------------------------------------------------------------
// Dark Mode Context
// ---------------------------------------------------------------------------
interface ThemeContextType {
  dark: boolean;
  toggleDark: () => void;
}

export const ThemeContext = createContext<ThemeContextType>({
  dark: false,
  toggleDark: () => { },
});

export const useTheme = () => useContext(ThemeContext);

// ---------------------------------------------------------------------------
// SVG Icon Components
// ---------------------------------------------------------------------------
const IconMenu = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>);
const IconGrid = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>);
const IconLock = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>);
const IconList = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>);
const IconSettings = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>);
const IconLogout = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>);
const IconMoon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>);
const IconSun = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>);
const IconChevronDown = ({ open }: { open: boolean }) => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: "transform .3s cubic-bezier(0.175, 0.885, 0.32, 1.275)", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}><polyline points="6 9 12 15 18 9" /></svg>);

// ---------------------------------------------------------------------------
// Sidebar nav items config
// ---------------------------------------------------------------------------
type NavItem = { key: string; label: string; icon: React.ReactElement; href: string; };

const MAIN_NAV: NavItem[] = [
  { key: "wallet", label: "Wallet", icon: <IconGrid />, href: "/user" },
  { key: "vault", label: "My Vault", icon: <IconLock />, href: "/user/vault" },
  { key: "activity", label: "Activity", icon: <IconList />, href: "/user/activity" },
];

const ACCOUNT_NAV: NavItem[] = [
  { key: "settings", label: "Profile & Settings", icon: <IconSettings />, href: "/user/settings" },
];

// Combine for Mobile Bottom Nav
const MOBILE_NAV: NavItem[] = [
  ...MAIN_NAV,
  { key: "settings", label: "Settings", icon: <IconSettings />, href: "/user/settings" },
];

// ---------------------------------------------------------------------------
// UserLayout
// ---------------------------------------------------------------------------
interface UserLayoutProps {
  children: React.ReactNode;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  userData?: any;
}

const UserLayout: React.FC<UserLayoutProps> = ({ children, activeTab = "wallet", userData }) => {
  const [dark, setDark] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Dynamic user fields
  const displayName = userData?.displayName || userData?.coopName || "Loading...";
  const email = userData?.email || "";
  const initials = displayName !== "Loading..." ? displayName.substring(0, 2).toUpperCase() : "...";
  const roleDisplay = userData?.role ? userData.role.charAt(0).toUpperCase() + userData.role.slice(1) : "";

  const dynamicMainNav = [...MAIN_NAV];
  if (userData?.role === "driver") {
    dynamicMainNav.push({ key: "loans", label: "Driver Panel", icon: <IconList />, href: "/user/loans" });
  } else if (userData?.role === "cooperative") {
    dynamicMainNav.push({ key: "coop-pool", label: "Coop Pool", icon: <IconList />, href: "/user/coop-pool" });
  }

  const dynamicMobileNav = [...MOBILE_NAV];
  if (userData?.role === "driver") {
    dynamicMobileNav.splice(2, 0, { key: "loans", label: "Driver Panel", icon: <IconList />, href: "/user/loans" });
  } else if (userData?.role === "cooperative") {
    dynamicMobileNav.splice(2, 0, { key: "coop-pool", label: "Coop Pool", icon: <IconList />, href: "/user/coop-pool" });
  }

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggleSidebar = () => setSidebarOpen((v) => !v);

  // Refined Color Palette
  const t = {
    bgPage: dark ? "#090A0F" : "#F3F4F6",
    bgCard: dark ? "#11131C" : "#FFFFFF",
    bgHeader: dark ? "rgba(17, 19, 28, 0.85)" : "rgba(255, 255, 255, 0.85)",
    bgSidebar: dark ? "#11131C" : "#FFFFFF",
    border: dark ? "#24283B" : "#E5E7EB",
    textPrim: dark ? "#F8FAFC" : "#0F172A",
    textMuted: dark ? "#94A3B8" : "#64748B",
    textFaint: dark ? "#475569" : "#94A3B8",
    blue: dark ? "#3B82F6" : "#2563EB",
    blue50: dark ? "rgba(59, 130, 246, 0.1)" : "#EFF6FF",
    blueText: dark ? "#60A5FA" : "#1D4ED8",
    greenBg: dark ? "rgba(16, 185, 129, 0.1)" : "#ECFDF5",
    greenText: dark ? "#34D399" : "#059669",
    greenBrd: dark ? "rgba(16, 185, 129, 0.2)" : "#A7F3D0",
  };

  const sidebarW = 260;

  const NavLink = ({ item }: { item: NavItem }) => {
    const isActive = activeTab === item.key;
    const [isHovered, setIsHovered] = useState(false);

    return (
      <a
        href={item.href}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderRadius: 12,
          fontWeight: isActive ? 700 : 500, fontSize: 15, textDecoration: "none",
          color: isActive ? t.blueText : (isHovered ? t.textPrim : t.textMuted),
          background: isActive ? t.blue50 : (isHovered ? (dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)") : "transparent"),
          transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
          transform: isHovered && !isActive ? "translateX(4px)" : "none",
        }}
      >
        <span style={{ transition: "transform 0.2s", transform: isActive ? "scale(1.1)" : "scale(1)" }}>
          {item.icon}
        </span>
        {item.label}
      </a>
    );
  };

  return (
    <ThemeContext.Provider value={{ dark, toggleDark: () => setDark((d) => !d) }}>
      <div style={{ minHeight: "100vh", background: t.bgPage, color: t.textPrim, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", display: "flex", flexDirection: "column", paddingBottom: isMobile ? 80 : 0 }}>

        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <header
          style={{
            height: 72, background: t.bgHeader, borderBottom: `1px solid ${t.border}`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0 24px", position: "sticky", top: 0, zIndex: 100, flexShrink: 0,
            backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)"
          }}
        >
          {/* Left: burger + logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {!isMobile && (
              <button
                onClick={toggleSidebar}
                style={{ background: "transparent", border: `1px solid ${t.border}`, borderRadius: 10, width: 40, height: 40, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t.textMuted, transition: "all 0.2s" }}
                onMouseEnter={(e) => e.currentTarget.style.background = dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                aria-label="Toggle Sidebar"
              >
                <IconMenu />
              </button>
            )}
            <a href="/user" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none" }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: t.blue, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 4px 12px ${dark ? "rgba(59, 130, 246, 0.3)" : "rgba(37, 99, 235, 0.2)"}` }}>
                <img src="/logo_1.png" alt="Aranova Logo" style={{ height: 22, width: "auto", objectFit: "contain", filter: "brightness(0) invert(1)" }} />
              </div>
              <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: "-0.02em", color: t.textPrim }}>ARANOVA</span>
            </a>
          </div>

          {/* Right: offline pill + dark mode + profile */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {!isMobile && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: dark ? "rgba(245, 158, 11, 0.1)" : "#FEF3C7", color: dark ? "#FCD34D" : "#D97706", border: `1px solid ${dark ? "rgba(245, 158, 11, 0.2)" : "#FDE68A"}`, borderRadius: 999, padding: "6px 16px", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                {userData?.network === "PUBLIC" ? "Mainnet" : "Testnet"}
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 8, background: t.greenBg, color: t.greenText, border: `1px solid ${t.greenBrd}`, borderRadius: 999, padding: "6px 16px", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: t.greenText, animation: "aranovapulse 2s infinite", display: "inline-block" }} />
              {!isMobile && "Offline Ready"}
            </div>

            <button onClick={() => setDark((d) => !d)} style={{ background: "transparent", border: `1px solid ${t.border}`, borderRadius: 10, width: 40, height: 40, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t.textMuted, transition: "all 0.2s" }} aria-label="Toggle Dark Mode">
              {dark ? <IconSun /> : <IconMoon />}
            </button>

            {/* Profile dropdown */}
            <div ref={dropdownRef} style={{ position: "relative" }}>
              <button onClick={() => setDropdownOpen((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 10, background: "transparent", border: `1px solid ${t.border}`, borderRadius: 999, padding: "4px 12px 4px 4px", cursor: "pointer", color: t.textPrim, transition: "background 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.background = dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: t.blue, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                  {initials}
                </div>
                {!isMobile && <span style={{ fontWeight: 600, fontSize: 14, color: t.textPrim }}>{displayName.split(' ')[0]}</span>}
                <IconChevronDown open={dropdownOpen} />
              </button>

              {dropdownOpen && (
                <div style={{ position: "absolute", top: "calc(100% + 12px)", right: 0, background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 16, minWidth: 240, boxShadow: dark ? "0 10px 40px rgba(0,0,0,0.5)" : "0 10px 40px -10px rgba(0,0,0,0.1)", zIndex: 200, overflow: "hidden", animation: "dropdownFade 0.2s ease-out" }}>
                  <div style={{ padding: "20px 16px", borderBottom: `1px solid ${t.border}`, background: dark ? "rgba(255,255,255,0.02)" : "#F8FAFC" }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: t.textPrim }}>{displayName}</div>
                    <div style={{ fontSize: 13, color: t.textMuted, marginTop: 4 }}>{email}</div>
                  </div>
                  <div style={{ padding: 8 }}>
                    <a href="/user/settings" style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", color: t.textPrim, textDecoration: "none", fontSize: 14, fontWeight: 500, borderRadius: 10, transition: "background 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.background = dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                      <span style={{ color: t.textMuted }}><IconSettings /></span> Profile Settings
                    </a>
                  </div>
                  <div style={{ borderTop: `1px solid ${t.border}`, padding: 8 }}>
                    <a href="/" style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", color: "#EF4444", textDecoration: "none", fontSize: 14, fontWeight: 600, borderRadius: 10, transition: "background 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.background = dark ? "rgba(239, 68, 68, 0.1)" : "#FEF2F2"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                      <IconLogout /> Sign out
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ── FLEX WRAPPER ────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flex: 1, position: "relative" }}>

          {/* ── DESKTOP SIDEBAR ────────────────────────────────────────────── */}
          {!isMobile && (
            <aside style={{ width: sidebarW, background: t.bgSidebar, borderRight: `1px solid ${t.border}`, display: "flex", flexDirection: "column", flexShrink: 0, transition: "transform .3s cubic-bezier(0.16, 1, 0.3, 1), margin .3s cubic-bezier(0.16, 1, 0.3, 1)", transform: sidebarOpen ? "translateX(0)" : `translateX(-${sidebarW}px)`, marginLeft: sidebarOpen ? 0 : -sidebarW, position: "sticky", top: 72, height: "calc(100vh - 72px)" }}>
              <div style={{ padding: "32px 16px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "1px", color: t.textFaint, textTransform: "uppercase", padding: "0 16px", marginBottom: 8 }}>Main Navigation</div>
                {dynamicMainNav.map((item) => <NavLink key={item.key} item={item} />)}
              </div>
              <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "1px", color: t.textFaint, textTransform: "uppercase", padding: "0 16px", marginBottom: 8 }}>Preferences</div>
                {ACCOUNT_NAV.map((item) => <NavLink key={item.key} item={item} />)}
              </div>

              {/* Sidebar Footer Profile Area */}
              <div style={{ marginTop: "auto", padding: 20, borderTop: `1px solid ${t.border}`, background: dark ? "rgba(255,255,255,0.01)" : "#F8FAFC" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: `linear-gradient(135deg, ${t.blue}, #8B5CF6)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: "#fff", flexShrink: 0, boxShadow: "0 4px 10px rgba(0,0,0,0.1)" }}>
                    {initials}
                  </div>
                  <div style={{ overflow: "hidden" }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: t.textPrim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayName}</div>
                    <div style={{ fontSize: 12, color: t.textMuted, fontWeight: 500, marginTop: 2 }}>{roleDisplay || "User"}</div>
                  </div>
                </div>
              </div>
            </aside>
          )}

          {/* ── MAIN CONTENT ─────────────────────────────────────────────── */}
          <main style={{ flex: 1, padding: isMobile ? "24px 16px" : "40px", maxWidth: "100%", overflowX: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ maxWidth: 1200, width: "100%", margin: "0 auto", flex: 1 }}>
              {children}
            </div>
          </main>
        </div>

        {/* ── MOBILE BOTTOM NAVIGATION (FIXED TO BOTTOM OF SCREEN) ────────── */}
        {isMobile && (
          <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: 80, background: t.bgHeader, borderTop: `1px solid ${t.border}`, display: "flex", justifyContent: "space-around", alignItems: "center", zIndex: 100, paddingBottom: "env(safe-area-inset-bottom)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
            {dynamicMobileNav.map((item) => {
              const isActive = activeTab === item.key;
              return (
                <a key={item.key} href={item.href} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: isActive ? t.blueText : t.textMuted, textDecoration: "none", fontSize: 11, fontWeight: isActive ? 700 : 500, flex: 1, height: "100%", position: "relative" }}>
                  {isActive && <div style={{ position: "absolute", top: 0, width: 32, height: 3, background: t.blueText, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 }} />}
                  <span style={{ transition: "transform 0.2s", transform: isActive ? "translateY(2px)" : "none" }}>
                    {item.icon}
                  </span>
                  <span style={{ transition: "transform 0.2s", transform: isActive ? "translateY(2px)" : "none" }}>{item.label}</span>
                </a>
              );
            })}
          </nav>
        )}

        {/* ── GLOBAL STYLES & ANIMATIONS ────────────────────────────────── */}
        <style>{`
          @keyframes aranovapulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.2); } }
          @keyframes dropdownFade { from { opacity: 0; transform: translateY(-8px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
          * { box-sizing: border-box; }
          body { margin: 0; padding: 0; }
        `}</style>
      </div>
    </ThemeContext.Provider>
  );
};

export default UserLayout;