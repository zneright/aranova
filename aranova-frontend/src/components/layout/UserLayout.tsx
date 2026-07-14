import React, { useState, useEffect, useRef } from "react";
import AnnouncementBell from "../ui/AnnouncementBell";
import { useTheme } from "../../contexts/ThemeContext";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase/config";

// ---------------------------------------------------------------------------
// SVG Icon Components
// ---------------------------------------------------------------------------
const IconMenu = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>);
const IconGrid = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>);
const IconLock = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>);
const IconList = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>);
const IconSettings = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>);
const IconLogout = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>);
const IconCredit = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>);
const IconMoon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>);
const IconSun = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>);
const IconChevronDown = ({ open }: { open: boolean }) => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ transition: "transform .2s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}><polyline points="6 9 12 15 18 9" /></svg>);

// ---------------------------------------------------------------------------
// Sidebar nav items config
// ---------------------------------------------------------------------------
type NavItem = { key: string; label: string; icon: React.ReactElement; href: string; };

const NAV_OVERVIEW: NavItem[] = [
  { key: "wallet", label: "Wallet", icon: <IconGrid />, href: "/user" },
];

const NAV_ASSETS: NavItem[] = [
  { key: "vault", label: "My Vault", icon: <IconLock />, href: "/user/vault" },
  { key: "loans", label: "Loans", icon: <IconCredit />, href: "/user/loans" },
];

const NAV_HISTORY: NavItem[] = [
  { key: "activity", label: "Activity", icon: <IconList />, href: "/user/activity" },
];

const NAV_SYSTEM: NavItem[] = [
  { key: "settings", label: "Profile & Settings", icon: <IconSettings />, href: "/user/settings" },
];

// Combine for Mobile Bottom Nav
const MOBILE_NAV: NavItem[] = [
  ...NAV_OVERVIEW,
  ...NAV_ASSETS,
  ...NAV_HISTORY,
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
  const { dark, toggleDark } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleSignOut = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      const uid = userData?.uid;
      await signOut(auth);
      localStorage.removeItem("aranova_auth_user");
      if (uid) {
        localStorage.removeItem(`aranova_auth_profile_${uid}`);
      }
      // Clear all active auth profile caches to prevent any leak
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("aranova_auth_profile_")) {
          localStorage.removeItem(key);
          i--;
        }
      }
      window.location.href = "/";
    } catch (err) {
      console.error("Sign out failed:", err);
    }
  };

  // Dynamic user fields
  const displayName = userData?.displayName || userData?.coopName || "Loading...";
  const email = userData?.email || "";
  const initials = displayName !== "Loading..." ? displayName.substring(0, 2).toUpperCase() : "...";


  const dynamicAssetsNav = [...NAV_ASSETS];
  if (userData?.role === "cooperative") {
    dynamicAssetsNav.push({ key: "coop-pool", label: "Coop Pool", icon: <IconList />, href: "/user/coop-pool" });
  }

  const dynamicMobileNav = [...MOBILE_NAV];
  if (userData?.role === "cooperative") {
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

  const role = userData?.role || "commuter";

  const getThemeColors = (userRole: string, isDark: boolean) => {
    switch (userRole) {
      case "driver":
        return {
          bgPage: isDark ? "#0A0B0E" : "#FAF8F5",
          bgCard: isDark ? "#141620" : "#ffffff",
          bgHeader: isDark ? "rgba(10, 11, 14, 0.75)" : "rgba(255, 255, 255, 0.75)",
          bgSidebar: isDark ? "#0E0F14" : "#ffffff",
          border: isDark ? "rgba(255,255,255,0.06)" : "#EAE6DF",
          textPrim: isDark ? "#F5F3F0" : "#1F1D1A",
          textMuted: isDark ? "#9C9AA8" : "#7C776E",
          textFaint: isDark ? "#5D5C6B" : "#B2ADA1",
          accent: "#FF6B00",
          accentLight: isDark ? "rgba(255, 107, 0, 0.1)" : "rgba(255, 107, 0, 0.05)",
          accentText: isDark ? "#FF8833" : "#D45600",
          greenBg: isDark ? "rgba(16, 185, 129, 0.1)" : "#ECFDF5",
          greenText: isDark ? "#34D399" : "#047857",
          greenBrd: isDark ? "rgba(16, 185, 129, 0.2)" : "#A7F3D0",
        };
      case "cooperative":
        return {
          bgPage: isDark ? "#040814" : "#F4F7F9",
          bgCard: isDark ? "#0A1128" : "#ffffff",
          bgHeader: isDark ? "rgba(4, 8, 20, 0.75)" : "rgba(255, 255, 255, 0.75)",
          bgSidebar: isDark ? "#060D1E" : "#ffffff",
          border: isDark ? "rgba(255,255,255,0.06)" : "#D5E2EC",
          textPrim: isDark ? "#E6F1FA" : "#0F1A30",
          textMuted: isDark ? "#8295B4" : "#506784",
          textFaint: isDark ? "#4F6484" : "#98AEC6",
          accent: "#10B981",
          accentLight: isDark ? "rgba(16, 185, 129, 0.1)" : "rgba(16, 185, 129, 0.05)",
          accentText: isDark ? "#34D399" : "#059669",
          greenBg: isDark ? "rgba(16, 185, 129, 0.1)" : "#ECFDF5",
          greenText: isDark ? "#34D399" : "#059669",
          greenBrd: isDark ? "rgba(16, 185, 129, 0.2)" : "#A7F3D0",
        };
      case "commuter":
      default:
        return {
          bgPage: isDark ? "#050608" : "#FBFBFA",
          bgCard: isDark ? "#0E0F14" : "#ffffff",
          bgHeader: isDark ? "rgba(5, 6, 8, 0.75)" : "rgba(255, 255, 255, 0.75)",
          bgSidebar: isDark ? "#08090C" : "#ffffff",
          border: isDark ? "rgba(255,255,255,0.05)" : "#E2E2DF",
          textPrim: isDark ? "#F3F4F6" : "#0B0C10",
          textMuted: isDark ? "#9CA3AF" : "#555A64",
          textFaint: isDark ? "#4B5563" : "#A3A7AF",
          accent: "#FFE600",
          accentLight: isDark ? "rgba(255, 230, 0, 0.08)" : "rgba(255, 230, 0, 0.06)",
          accentText: isDark ? "#FFE600" : "#8A7D00",
          greenBg: isDark ? "rgba(16, 185, 129, 0.1)" : "#ECFDF5",
          greenText: isDark ? "#34D399" : "#059669",
          greenBrd: isDark ? "rgba(16, 185, 129, 0.2)" : "#A7F3D0",
        };
    }
  };

  const t = getThemeColors(role, dark);

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
          display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 16,
          fontWeight: isActive ? 700 : 600, fontSize: 14, textDecoration: "none",
          color: isActive ? (role === "commuter" && !dark ? "#0B0C10" : t.accentText) : (isHovered ? t.textPrim : t.textMuted),
          background: isActive ? (role === "commuter" ? t.accent : t.accentLight) : (isHovered ? (dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.02)") : "transparent"),
          transition: "all 0.2s ease-out", transform: isHovered && !isActive ? "translateX(4px)" : "none",
          border: isActive && role === "commuter" ? "1px solid rgba(0,0,0,0.05)" : "1px solid transparent"
        }}
      >
        {item.icon} {item.label}
      </a>
    );
  };

  return (
    <>
      {/* NATIVE SCROLL LAYOUT WRAPPER */}
      <div style={{ 
        minHeight: "100vh", background: t.bgPage, color: t.textPrim, display: "flex", flexDirection: "column",
        "--role-accent-rgb": role === "driver" ? "255, 107, 0" : role === "cooperative" ? "16, 185, 129" : "255, 230, 0" 
      } as React.CSSProperties}>

        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <header
          style={{
            height: 64, background: t.bgHeader, borderBottom: `1px solid ${t.border}`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0 24px", position: "sticky", top: 0, zIndex: 100, flexShrink: 0,
            backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)"
          }}
        >
          {/* Role-specific top accent stripe */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 3,
            background: role === "driver" ? "linear-gradient(90deg, #FF6B00, #FF8833)" : role === "cooperative" ? "linear-gradient(90deg, #10B981, #34D399)" : "linear-gradient(90deg, #FFE600, #FFEE55)",
            zIndex: 1,
          }} />
          {/* Left: burger + logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {!isMobile && (
              <button
                onClick={toggleSidebar}
                style={{ background: "none", border: `1px solid ${t.border}`, borderRadius: 12, width: 36, height: 36, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t.textMuted, transition: "all 0.2s" }}
              >
                <IconMenu />
              </button>
            )}
            <a href="/user" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
              <img src="/logo_svg.svg" alt="Aranova Logo" style={{ height: 44, width: 44 }} />
              <span style={{ fontWeight: 900, fontSize: 18, letterSpacing: -0.5, color: t.textPrim }}>ARANOVA</span>
            </a>
            {/* Role badge next to logo */}
            {!isMobile && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: t.accentLight, border: `1px solid ${t.border}`, borderRadius: 20, padding: "4px 12px", fontSize: 10, fontWeight: 800, color: t.accentText, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {role === "driver" ? "🛺" : role === "cooperative" ? "🏢" : "💳"}{" "}
                {role === "driver" ? "Driver" : role === "cooperative" ? "Cooperative" : "Commuter"}
              </div>
            )}
          </div>

          {/* Right: offline pill + dark mode + profile */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: dark ? "#3B210B" : "#FEF3C7", color: dark ? "#FCD34D" : "#92400E", border: `1px solid ${dark ? "#78350F" : "#FDE68A"}`, borderRadius: 20, padding: "5px 14px", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>
              {userData?.network === "PUBLIC" ? "Mainnet" : "Testnet"}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, background: t.greenBg, color: t.greenText, border: `1px solid ${t.greenBrd}`, borderRadius: 20, padding: "5px 14px", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: t.greenText, animation: "aranovapulse 2s infinite", display: "inline-block" }} />
              {!isMobile && "Offline Ready"}
            </div>

            <button onClick={toggleDark} style={{ background: "none", border: `1px solid ${t.border}`, borderRadius: 12, width: 36, height: 36, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t.textMuted, transition: "all 0.2s" }}>
              {dark ? <IconSun /> : <IconMoon />}
            </button>

            {/* Announcement Bell */}
            {userData && <AnnouncementBell userData={userData} />}

            {/* Profile dropdown */}
            <div ref={dropdownRef} style={{ position: "relative" }}>
              <button onClick={() => setDropdownOpen((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: `1px solid ${t.border}`, borderRadius: 24, padding: "4px 10px 4px 4px", cursor: "pointer", color: t.textPrim, transition: "all 0.2s" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: `linear-gradient(135deg, ${role === "commuter" ? "#FFE600" : t.accent}, ${t.accentText})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: role === "commuter" && !dark ? "#000" : "#fff", flexShrink: 0 }}>
                  {initials}
                </div>
                {!isMobile && <span style={{ fontWeight: 600, fontSize: 13, color: t.textPrim }}>{displayName.split(' ')[0]}</span>}
                <IconChevronDown open={dropdownOpen} />
              </button>

              {dropdownOpen && (
                <div style={{ position: "absolute", top: "calc(100% + 10px)", right: 0, background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 20, minWidth: 220, boxShadow: dark ? "0 10px 40px rgba(0,0,0,0.5)" : "0 10px 40px rgba(0,0,0,0.06)", zIndex: 200, overflow: "hidden", padding: 6 }}>
                  <div style={{ padding: "16px", borderBottom: `1px solid ${t.border}` }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: t.textPrim }}>{displayName}</div>
                    <div style={{ fontSize: 12, color: t.textMuted, marginTop: 4, wordBreak: "break-all" }}>{email}</div>
                  </div>
                  <div style={{ padding: 4 }}>
                    <a href="/user/settings" style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", color: t.textPrim, textDecoration: "none", fontSize: 13, fontWeight: 600, borderRadius: 12, transition: "all 0.2s" }} className="hover:bg-black/5 dark:hover:bg-white/5">
                      <span style={{ color: t.textMuted }}><IconSettings /></span> Profile & Settings
                    </a>
                  </div>
                  <div style={{ borderTop: `1px solid ${t.border}`, padding: 4 }}>
                    <button 
                      onClick={handleSignOut} 
                      style={{ 
                        display: "flex", 
                        alignItems: "center", 
                        gap: 12, 
                        padding: "10px 14px", 
                        color: "#E24B4A", 
                        background: "none", 
                        border: "none", 
                        width: "100%", 
                        textAlign: "left", 
                        fontFamily: "inherit", 
                        fontSize: 13, 
                        fontWeight: 700, 
                        borderRadius: 12, 
                        cursor: "pointer", 
                        transition: "all 0.2s" 
                      }} 
                      className="hover:bg-red-500/10"
                    >
                      <IconLogout /> Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ── FLEX WRAPPER ────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flex: 1 }}>

          {/* ── DESKTOP SIDEBAR ────────────────────────────────────────────── */}
          {!isMobile && (
            <aside style={{ width: sidebarW, background: t.bgSidebar, borderRight: `1px solid ${t.border}`, display: "flex", flexDirection: "column", flexShrink: 0, transition: "transform .3s cubic-bezier(0.4, 0, 0.2, 1), margin .3s cubic-bezier(0.4, 0, 0.2, 1)", transform: sidebarOpen ? "translateX(0)" : `translateX(-${sidebarW}px)`, marginLeft: sidebarOpen ? 0 : -sidebarW, position: "sticky", top: 64, height: "calc(100vh - 64px)", padding: 10 }}>
              <div style={{ padding: "14px 12px 6px", display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 10, fontWeight: 850, letterSpacing: "1.5px", color: t.textFaint, textTransform: "uppercase", padding: "0 14px", marginBottom: 6 }}>Overview</div>
                {NAV_OVERVIEW.map((item) => <NavLink key={item.key} item={item} />)}
              </div>
              
              <div style={{ padding: "12px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 10, fontWeight: 850, letterSpacing: "1.5px", color: t.textFaint, textTransform: "uppercase", padding: "0 14px", marginBottom: 6 }}>Liquidity & Assets</div>
                {dynamicAssetsNav.map((item) => <NavLink key={item.key} item={item} />)}
              </div>
              <div style={{ padding: "12px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 10, fontWeight: 850, letterSpacing: "1.5px", color: t.textFaint, textTransform: "uppercase", padding: "0 14px", marginBottom: 6 }}>History</div>
                {NAV_HISTORY.map((item) => <NavLink key={item.key} item={item} />)}
              </div>
              <div style={{ padding: "12px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 10, fontWeight: 850, letterSpacing: "1.5px", color: t.textFaint, textTransform: "uppercase", padding: "0 14px", marginBottom: 6 }}>System</div>
                {NAV_SYSTEM.map((item) => <NavLink key={item.key} item={item} />)}
              </div>
              <div style={{ marginTop: "auto", padding: 12, borderTop: `1px solid ${t.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px", borderRadius: 16, background: t.accentLight, border: `1px solid ${t.border}` }}>
                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: `linear-gradient(135deg, ${role === "commuter" ? "#FFE600" : t.accent}, ${t.accentText})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: role === "commuter" && !dark ? "#000" : "#fff", flexShrink: 0 }}>
                    {initials}
                  </div>
                  <div style={{ overflow: "hidden", flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: t.textPrim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayName}</div>
                    <div style={{ fontSize: 10, color: t.accentText, fontWeight: 800, marginTop: 2 }}>
                      {role === "driver" ? "🛺 Driver" : role === "cooperative" ? "🏢 Cooperative" : "💳 Commuter"}
                    </div>
                  </div>
                </div>
              </div>
            </aside>
          )}

          {/* ── MAIN CONTENT ─────────────────────────────────────────────── */}
          <main style={{ flex: 1, padding: isMobile ? "20px 16px 88px" : "32px", maxWidth: "100%", overflowX: "hidden" }}>
            {children}
          </main>
        </div>

        {/* ── MOBILE BOTTOM NAVIGATION (FIXED TO BOTTOM OF SCREEN) ────────── */}
        {isMobile && (
          <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: 68, background: t.bgHeader, borderTop: `1px solid ${t.border}`, display: "flex", justifyContent: "space-around", alignItems: "center", zIndex: 100, paddingBottom: "env(safe-area-inset-bottom)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
            {/* Role accent stripe top of mobile nav */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: role === "driver" ? "linear-gradient(90deg, #FF6B00, #FF8833)" : role === "cooperative" ? "linear-gradient(90deg, #10B981, #34D399)" : "linear-gradient(90deg, #FFE600, #FFEE55)" }} />
            {dynamicMobileNav.map((item) => {
              const isActive = activeTab === item.key;
              return (
                <a key={item.key} href={item.href} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, color: isActive ? t.accentText : t.textMuted, textDecoration: "none", fontSize: 10, fontWeight: isActive ? 800 : 600, flex: 1, height: "100%", transition: "all 0.2s", position: "relative" }}>
                  {/* Active indicator dot */}
                  {isActive && <div style={{ position: "absolute", top: 4, width: 4, height: 4, borderRadius: "50%", background: t.accent }} />}
                  <span style={{ transform: isActive ? "scale(1.15)" : "scale(1)", transition: "transform 0.25s cubic-bezier(0.16,1,0.3,1)", marginTop: 8 }}>{item.icon}</span>
                  <span style={{ letterSpacing: "0.03em" }}>{item.label}</span>
                </a>
              );
            })}
          </nav>
        )}

        <style>{`@keyframes aranovapulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
      </div>
    </>
  );
};

export default UserLayout;