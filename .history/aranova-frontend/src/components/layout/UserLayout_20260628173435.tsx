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
const IconMenu = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);
const IconGrid = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);
const IconLock = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const IconList = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);
const IconUser = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);
const IconSettings = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);
const IconLogout = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);
const IconMoon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);
const IconSun = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);
const IconChevronDown = ({ open }: { open: boolean }) => (
  <svg
    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    style={{ transition: "transform .2s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

// ---------------------------------------------------------------------------
// Sidebar nav items config
// ---------------------------------------------------------------------------
type NavItem = {
  key: string;
  label: string;
  icon: React.ReactNode;
  href: string;
};

const MAIN_NAV: NavItem[] = [
  { key: "wallet", label: "Wallet", icon: <IconGrid />, href: "/user" },
  { key: "vault", label: "My Vault", icon: <IconLock />, href: "/user/vault" },
  { key: "activity", label: "Activity", icon: <IconList />, href: "/user/activity" },
];

const ACCOUNT_NAV: NavItem[] = [
  { key: "profile", label: "Profile", icon: <IconUser />, href: "/user/profile" },
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

const UserLayout: React.FC<UserLayoutProps> = ({
  children,
  activeTab = "wallet",
  userData
}) => {
  const [dark, setDark] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Dynamic user fields
  const displayName = userData?.displayName || userData?.coopName || "User";
  const email = userData?.email || "user@aranova.ph";
  const initials = displayName.substring(0, 2).toUpperCase();
  const roleDisplay = userData?.role ? userData.role.charAt(0).toUpperCase() + userData.role.slice(1) : "Commuter";

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

  // ── Theme tokens ──────────────────────────────────────────────────────────
  const t = {
    bgPage: dark ? "#0F1117" : "#F8F9FA",
    bgCard: dark ? "#1A1D27" : "#ffffff",
    bgHeader: dark ? "#13151F" : "#ffffff",
    bgSidebar: dark ? "#13151F" : "#ffffff",
    border: dark ? "#2A2D3A" : "#E5E7EB",
    textPrim: dark ? "#F1F5F9" : "#111827",
    textMuted: dark ? "#94A3B8" : "#6B7280",
    textFaint: dark ? "#475569" : "#9CA3AF",
    blue: dark ? "#4F8EF7" : "#1652C9",
    blue50: dark ? "#1A2644" : "#EEF4FF",
    blueText: dark ? "#7DB3FF" : "#1652C9",
    greenBg: dark ? "#052E16" : "#F0FDF4",
    greenText: dark ? "#4ADE80" : "#15803D",
    greenBrd: dark ? "#166534" : "#BBF7D0",
  };

  const sidebarW = 240;

  // ── Reusable NavLink Component with Hover Effects ─────────────────────────
  const NavLink = ({ item }: { item: NavItem }) => {
    const isActive = activeTab === item.key;
    const [isHovered, setIsHovered] = useState(false);

    return (
      <a
        href={item.href}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 14px",
          borderRadius: 12,
          fontWeight: isActive ? 700 : 600,
          fontSize: 14,
          color: isActive ? t.blueText : (isHovered ? t.textPrim : t.textMuted),
          background: isActive ? t.blue50 : (isHovered ? (dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)") : "transparent"),
          textDecoration: "none",
          transition: "all 0.2s ease",
          transform: isHovered && !isActive ? "translateX(4px)" : "none", // Slide effect on hover
        }}
      >
        {item.icon} {item.label}
      </a>
    );
  };

  return (
    <ThemeContext.Provider value={{ dark, toggleDark: () => setDark((d) => !d) }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100dvh", // Forces strict height for mobile sizing
          background: t.bgPage,
          color: t.textPrim,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          transition: "background .2s, color .2s",
        }}
      >
        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <header
          style={{
            height: 64,
            background: t.bgHeader,
            borderBottom: `1px solid ${t.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 24px",
            flexShrink: 0,
            zIndex: 100,
            gap: 12,
            transition: "background .2s, border .2s",
          }}
        >
          {/* Left: burger + logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {!isMobile && (
              <button
                onClick={toggleSidebar}
                aria-label="Toggle sidebar"
                style={{
                  background: "none",
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  width: 36,
                  height: 36,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: t.textMuted,
                  flexShrink: 0,
                  transition: "background .2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                <IconMenu />
              </button>
            )}
            <a href="/user" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
              <div
                style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: t.blue50, border: `1px solid ${t.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <img
                  src="/logo_1.png"
                  alt="Aranova Logo"
                  style={{
                    height: 20,
                    width: "auto",
                    objectFit: "contain",
                    filter: dark ? "brightness(0) invert(1)" : "none"
                  }}
                />
              </div>
              <span style={{ fontWeight: 900, fontSize: 18, letterSpacing: -0.5, color: t.textPrim }}>
                ARANOVA
              </span>
            </a>
          </div>

          {/* Right: offline pill + dark mode + profile */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>

            {/* ─── TESTNET INDICATOR ─── */}
            <div
              style={{
                display: "flex", alignItems: "center", gap: 8,
                background: dark ? "#3B210B" : "#FEF3C7", color: dark ? "#FCD34D" : "#92400E",
                border: `1px solid ${dark ? "#78350F" : "#FDE68A"}`,
                borderRadius: 20, padding: "5px 14px",
                fontSize: 11, fontWeight: 800, letterSpacing: 0.3,
                textTransform: "uppercase"
              }}
            >
              Testnet
            </div>

            {/* Offline pill */}
            <div
              style={{
                display: "flex", alignItems: "center", gap: 8,
                background: t.greenBg, color: t.greenText,
                border: `1px solid ${t.greenBrd}`,
                borderRadius: 20, padding: "5px 14px",
                fontSize: 11, fontWeight: 800, letterSpacing: 0.3,
                textTransform: "uppercase"
              }}
            >
              <span
                style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: t.greenText,
                  animation: "aranovapulse 2s infinite",
                  display: "inline-block",
                }}
              />
              {!isMobile && "Offline Ready"}
            </div>

            {/* Dark mode toggle */}
            <button
              onClick={() => setDark((d) => !d)}
              aria-label="Toggle dark mode"
              style={{
                background: "none",
                border: `1px solid ${t.border}`,
                borderRadius: 8,
                width: 36, height: 36,
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: t.textMuted,
                transition: "background .2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              {dark ? <IconSun /> : <IconMoon />}
            </button>

            {/* Profile dropdown */}
            <div ref={dropdownRef} style={{ position: "relative" }}>
              <button
                onClick={() => setDropdownOpen((v) => !v)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: "none",
                  border: `1px solid ${t.border}`,
                  borderRadius: 24, padding: "4px 10px 4px 4px",
                  cursor: "pointer", color: t.textPrim,
                  transition: "background .2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                <div
                  style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: "#4F8EF7", display: "flex",
                    alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 800, color: "#fff", flexShrink: 0,
                  }}
                >
                  {initials}
                </div>
                {!isMobile && <span style={{ fontWeight: 600, fontSize: 13, color: t.textPrim }}>{displayName.split(' ')[0]}</span>}
                <IconChevronDown open={dropdownOpen} />
              </button>

              {/* Dropdown menu */}
              {dropdownOpen && (
                <div
                  style={{
                    position: "absolute", top: "calc(100% + 10px)", right: 0,
                    background: t.bgCard,
                    border: `1px solid ${t.border}`,
                    borderRadius: 16, minWidth: 200,
                    boxShadow: dark ? "0 10px 40px rgba(0,0,0,0.5)" : "0 10px 40px rgba(0,0,0,0.08)",
                    zIndex: 200, overflow: "hidden",
                  }}
                >
                  {/* Header */}
                  <div style={{ padding: "16px", borderBottom: `1px solid ${t.border}` }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: t.textPrim }}>{displayName}</div>
                    <div style={{ fontSize: 12, color: t.textMuted, marginTop: 4 }}>{email}</div>
                  </div>

                  <div style={{ padding: 8 }}>
                    {[
                      { icon: <IconUser />, label: "Profile", href: "/user/profile" },
                      { icon: <IconSettings />, label: "Settings", href: "/user/settings" },
                    ].map(({ icon, label, href }) => (
                      <a
                        key={label}
                        href={href}
                        style={{
                          display: "flex", alignItems: "center", gap: 12,
                          padding: "10px 14px", color: t.textPrim,
                          textDecoration: "none", fontSize: 13, fontWeight: 600,
                          borderRadius: 8, transition: "background .2s",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <span style={{ color: t.textMuted }}>{icon}</span> {label}
                      </a>
                    ))}
                  </div>

                  <div style={{ borderTop: `1px solid ${t.border}`, padding: 8 }}>
                    <a
                      href="/"
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "10px 14px", color: "#E24B4A",
                        textDecoration: "none", fontSize: 13, fontWeight: 700,
                        borderRadius: 8, transition: "background .2s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = dark ? "rgba(226, 75, 74, 0.1)" : "#FCEBEB")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <IconLogout /> Sign out
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ── BODY FLEX CONTAINER ────────────────────────────────────────── */}
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

          {/* ── DESKTOP SIDEBAR ──────────────────────────────────────────── */}
          {!isMobile && (
            <aside
              style={{
                width: sidebarW,
                background: t.bgSidebar,
                borderRight: `1px solid ${t.border}`,
                display: "flex",
                flexDirection: "column",
                flexShrink: 0,
                transition: "transform .3s cubic-bezier(0.4, 0, 0.2, 1), margin .3s cubic-bezier(0.4, 0, 0.2, 1)",
                transform: sidebarOpen ? "translateX(0)" : `translateX(-${sidebarW}px)`,
                marginLeft: sidebarOpen ? 0 : -sidebarW,
              }}
            >
              {/* Main nav */}
              <div style={{ padding: "24px 16px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1px", color: t.textFaint, textTransform: "uppercase", padding: "0 12px", marginBottom: 8 }}>
                  Main Menu
                </div>
                {MAIN_NAV.map((item) => (
                  <NavLink key={item.key} item={item} />
                ))}
              </div>

              {/* Account nav */}
              <div style={{ padding: "16px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1px", color: t.textFaint, textTransform: "uppercase", padding: "0 12px", marginBottom: 8 }}>
                  Account
                </div>
                {ACCOUNT_NAV.map((item) => (
                  <NavLink key={item.key} item={item} />
                ))}
              </div>

              {/* Sidebar footer (Dynamic User Info) */}
              <div style={{ marginTop: "auto", padding: 16, borderTop: `1px solid ${t.border}`, transition: "border .2s" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 4px" }}>
                  <div
                    style={{
                      width: 38, height: 38, borderRadius: "50%",
                      background: "linear-gradient(135deg, #1652C9, #4F8EF7)", display: "flex",
                      alignItems: "center", justifyContent: "center",
                      fontSize: 13, fontWeight: 800, color: "#fff", flexShrink: 0,
                      boxShadow: "0 4px 10px rgba(22, 82, 201, 0.3)"
                    }}
                  >
                    {initials}
                  </div>
                  <div style={{ overflow: "hidden" }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: t.textPrim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayName}</div>
                    <div style={{ fontSize: 12, color: t.textMuted, fontWeight: 500 }}>{roleDisplay}</div>
                  </div>
                </div>
              </div>
            </aside>
          )}

          {/* ── MAIN CONTENT ─────────────────────────────────────────────── */}
          <main
            style={{
              flex: 1,
              overflowY: "auto",
              padding: isMobile ? "20px 16px 40px" : "32px",
            }}
          >
            {children}
          </main>
        </div>

        {/* ── MOBILE BOTTOM NAVIGATION (FLEX, NOT FIXED) ────────────────── */}
        {isMobile && (
          <nav
            style={{
              flexShrink: 0,
              height: 64,
              background: t.bgHeader,
              borderTop: `1px solid ${t.border}`,
              display: "flex",
              justifyContent: "space-around",
              alignItems: "center",
              zIndex: 100,
              paddingBottom: "env(safe-area-inset-bottom)", // Support for iOS home bar
            }}
          >
            {MAIN_NAV.map((item) => {
              const isActive = activeTab === item.key;
              return (
                <a
                  key={item.key}
                  href={item.href}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    color: isActive ? t.blueText : t.textMuted,
                    textDecoration: "none",
                    fontSize: 11,
                    fontWeight: isActive ? 700 : 500,
                    flex: 1,
                    height: "100%",
                  }}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </a>
              );
            })}
          </nav>
        )}

        {/* Pulse animation */}
        <style>{`@keyframes aranovapulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
      </div>
    </ThemeContext.Provider>
  );
};

export default UserLayout;