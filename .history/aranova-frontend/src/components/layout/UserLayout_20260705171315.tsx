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
const IconMenu = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>);
const IconGrid = () => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>);
const IconLock = () => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>);
const IconList = () => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>);
const IconSettings = () => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>);
const IconLogout = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>);
const IconChevronDown = ({ open }: { open: boolean }) => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: "transform .3s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}><polyline points="6 9 12 15 18 9" /></svg>);

type NavItem = { key: string; label: string; icon: React.ReactElement; href: string; };

const MAIN_NAV: NavItem[] = [
  { key: "wallet", label: "Home", icon: <IconGrid />, href: "/user" },
  { key: "vault", label: "Vault", icon: <IconLock />, href: "/user/vault" },
  { key: "activity", label: "Activity", icon: <IconList />, href: "/user/activity" },
];

const ACCOUNT_NAV: NavItem[] = [
  { key: "settings", label: "Settings", icon: <IconSettings />, href: "/user/settings" },
];

const MOBILE_NAV: NavItem[] = [
  ...MAIN_NAV,
  { key: "settings", label: "Me", icon: <IconSettings />, href: "/user/settings" },
];

interface UserLayoutProps {
  children: React.ReactNode;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  userData?: any;
}

const UserLayout: React.FC<UserLayoutProps> = ({ children, activeTab = "wallet", userData }) => {
  const [dark, setDark] = useState(false); // Defaulting to light mode to match Atome vibe
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const displayName = userData?.displayName || userData?.coopName || "User";
  const email = userData?.email || "";
  const initials = displayName !== "User" ? displayName.substring(0, 2).toUpperCase() : "UA";

  const dynamicMainNav = [...MAIN_NAV];
  if (userData?.role === "driver") {
    dynamicMainNav.splice(1, 0, { key: "loans", label: "Loans", icon: <IconList />, href: "/user/loans" });
  } else if (userData?.role === "cooperative") {
    dynamicMainNav.splice(1, 0, { key: "coop-pool", label: "Pool", icon: <IconList />, href: "/user/coop-pool" });
  }

  const dynamicMobileNav = [...MOBILE_NAV];
  if (userData?.role === "driver") {
    dynamicMobileNav.splice(1, 0, { key: "loans", label: "Loans", icon: <IconList />, href: "/user/loans" });
  } else if (userData?.role === "cooperative") {
    dynamicMobileNav.splice(1, 0, { key: "coop-pool", label: "Pool", icon: <IconList />, href: "/user/coop-pool" });
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

  // Clean Light Theme (Atome style)
  const t = {
    bgPage: dark ? "#000000" : "#F5F5F7",
    bgHeader: dark ? "#111111" : "#FFFFFF",
    textPrim: dark ? "#FFFFFF" : "#121212",
    textMuted: dark ? "#888888" : "#8A8A8E",
    border: dark ? "#222222" : "#EBEBEB",
    yellowBg: dark ? "#332900" : "#FFF7D4",
    yellowText: dark ? "#FFD60A" : "#D4A000",
  };

  const NavLink = ({ item }: { item: NavItem }) => {
    const isActive = activeTab === item.key;
    return (
      <a
        href={item.href}
        style={{
          display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 16,
          fontWeight: isActive ? 800 : 600, fontSize: 16, textDecoration: "none",
          color: isActive ? t.textPrim : t.textMuted,
          background: isActive ? (dark ? "#222" : "#F5F5F7") : "transparent",
          transition: "all 0.2s ease",
        }}
      >
        <span style={{ color: isActive ? "#25C2A0" : t.textMuted }}>{item.icon}</span>
        {item.label}
      </a>
    );
  };

  return (
    <ThemeContext.Provider value={{ dark, toggleDark: () => setDark((d) => !d) }}>
      <div style={{ minHeight: "100vh", background: t.bgPage, color: t.textPrim, fontFamily: "'Inter', -apple-system, sans-serif", display: "flex", flexDirection: "column", paddingBottom: isMobile ? 85 : 0 }}>

        {/* HEADER - ATOME STYLE */}
        <header style={{ height: 60, background: t.bgHeader, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", position: "sticky", top: 0, zIndex: 100, borderBottom: `1px solid ${t.border}` }}>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {!isMobile && (
              <button onClick={toggleSidebar} style={{ background: "none", border: "none", cursor: "pointer", color: t.textPrim, display: "flex", alignItems: "center" }}>
                <IconMenu />
              </button>
            )}
            <a href="/user" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
              {/* Logo mimicking Atome's bold text logo */}
              <span style={{ fontWeight: 900, fontSize: 24, letterSpacing: "-1px", color: t.textPrim }}>
                aranova <span style={{ color: "#25C2A0" }}>A</span>
              </span>
            </a>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Atome style "Points" Pill -> Network Pill */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: t.yellowBg, color: t.yellowText, borderRadius: 999, padding: "6px 14px", fontSize: 13, fontWeight: 800 }}>
              <span style={{ fontSize: 14 }}>A✦</span>
              {userData?.network === "PUBLIC" ? "Mainnet" : "Testnet"}
            </div>

            <div ref={dropdownRef} style={{ position: "relative" }}>
              <button onClick={() => setDropdownOpen((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${t.border}`, borderRadius: 999, padding: "4px 8px 4px 4px", cursor: "pointer" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#25C2A0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#fff" }}>
                  {initials}
                </div>
                <IconChevronDown open={dropdownOpen} />
              </button>
              {dropdownOpen && (
                <div style={{ position: "absolute", top: "calc(100% + 10px)", right: 0, background: t.bgHeader, border: `1px solid ${t.border}`, borderRadius: 20, minWidth: 200, boxShadow: "0 10px 40px rgba(0,0,0,0.1)", zIndex: 200, padding: 8 }}>
                  <a href="/user/settings" style={{ display: "block", padding: "12px 16px", color: t.textPrim, textDecoration: "none", fontSize: 14, fontWeight: 600, borderRadius: 12 }}>Settings</a>
                  <a href="/" style={{ display: "block", padding: "12px 16px", color: "#FF3B30", textDecoration: "none", fontSize: 14, fontWeight: 600, borderRadius: 12 }}>Sign Out</a>
                </div>
              )}
            </div>
          </div>
        </header>

        <div style={{ display: "flex", flex: 1 }}>
          {!isMobile && (
            <aside style={{ width: 260, background: t.bgHeader, borderRight: `1px solid ${t.border}`, display: "flex", flexDirection: "column", flexShrink: 0, position: "sticky", top: 60, height: "calc(100vh - 60px)", transition: "transform 0.3s", transform: sidebarOpen ? "translateX(0)" : "translateX(-260px)", marginLeft: sidebarOpen ? 0 : -260 }}>
              <div style={{ padding: "24px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                {dynamicMainNav.map((item) => <NavLink key={item.key} item={item} />)}
              </div>
            </aside>
          )}

          <main style={{ flex: 1, padding: isMobile ? "20px 16px" : "32px", maxWidth: 1000, margin: "0 auto", width: "100%" }}>
            {children}
          </main>
        </div>

        {/* MOBILE BOTTOM NAV - ATOME STYLE */}
        {isMobile && (
          <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: 75, background: t.bgHeader, borderTop: `1px solid ${t.border}`, display: "flex", justifyContent: "space-around", alignItems: "center", zIndex: 100, paddingBottom: "env(safe-area-inset-bottom)" }}>
            {dynamicMobileNav.map((item) => {
              const isActive = activeTab === item.key;
              return (
                <a key={item.key} href={item.href} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: isActive ? t.textPrim : t.textMuted, textDecoration: "none", fontSize: 11, fontWeight: isActive ? 800 : 600, flex: 1 }}>
                  <span style={{ color: isActive ? "#25C2A0" : t.textMuted, transform: isActive ? "scale(1.1)" : "none", transition: "0.2s" }}>{item.icon}</span>
                  <span>{item.label}</span>
                </a>
              );
            })}
          </nav>
        )}
      </div>
    </ThemeContext.Provider>
  );
};

export default UserLayout;