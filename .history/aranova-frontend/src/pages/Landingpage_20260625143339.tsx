import React, { useState, useEffect, useRef } from "react";

// ─── Data ────────────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { label: "Problem", href: "#problem" },
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Testimonials", href: "#testimonials" },
];

const STATS = [
  { value: "2.4M+", label: "Informal drivers in PH", sub: "underserved by banks" },
  { value: "15%", label: "Daily income lost", sub: "to 5-6 loan sharks" },
  { value: "₱380", label: "Average daily earnings", sub: "tricycle / jeepney" },
  { value: "0 bars", label: "Signal in dead zones", sub: "where cash still rules" },
];

const FEATURES = [
  {
    icon: (dark: boolean) => (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={dark ? "#7DB3FF" : "#1652C9"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 7V1h-6"/><path d="M1 7V1h6"/><path d="M23 17v6h-6"/><path d="M1 17v6h6"/>
        <line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
      </svg>
    ),
    title: "Scan-and-Beam Protocol",
    desc: "Passengers scan a printed vehicle QR code and silently beam a signed cryptogram to the driver via background Bluetooth — no internet required.",
    tag: "Offline-First",
    tagColor: "blue",
  },
  {
    icon: (dark: boolean) => (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={dark ? "#4ADE80" : "#15803D"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    ),
    title: "Collateralized Personal Vault",
    desc: "Lock savings for 7 or 30 days. The more you lock, the higher your Universal On-Chain Score rises, unlocking automated fuel lines and cooperative loans.",
    tag: "Credit Building",
    tagColor: "green",
  },
  {
    icon: (dark: boolean) => (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={dark ? "#A78BFA" : "#3C3489"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
      </svg>
    ),
    title: "Soroban Smart Contracts",
    desc: "Time-locked maturities, collateral liquidation, credit score math, and multi-party fee distributions — all enforced transparently on-chain.",
    tag: "Stellar / Soroban",
    tagColor: "purple",
  },
  {
    icon: (dark: boolean) => (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={dark ? "#FCD34D" : "#854F0B"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
    title: "Telegraphy Logs",
    desc: "Every vault lock, redemption, and debt settlement emits an unalterable on-chain Stellar event — a public, tamper-proof ledger of your financial history.",
    tag: "Transparency",
    tagColor: "amber",
  },
  {
    icon: (dark: boolean) => (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={dark ? "#F87171" : "#A32D2D"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
    ),
    title: "Instant Debt Clearing",
    desc: "Tap 'Settle from Vault.' Soroban intercepts locked savings, deducts principal + fees, routes them on-chain, and clears your debt in one transaction.",
    tag: "Zero Default Risk",
    tagColor: "red",
  },
  {
    icon: (dark: boolean) => (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={dark ? "#34D399" : "#0F6E56"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
    title: "PIN-Secured Hybrid Wallet",
    desc: "AES-256 encrypted keys cached to iOS Secure Enclave or Android Keystore. Auto-generate wallets with recovery phrases, toggle Testnet/Mainnet safely.",
    tag: "Self-Custody",
    tagColor: "teal",
  },
];

const STEPS = [
  {
    num: "01",
    title: "Lock your savings",
    desc: "Deposit USDC into your Personal Vault for 7 or 30 days. Your Universal On-Chain Score climbs instantly — no bank account needed.",
    accent: "#1652C9",
  },
  {
    num: "02",
    title: "Build your score",
    desc: "A higher score unlocks automated fuel credit lines and Admin-approved loans from the Cooperative pool — on your own terms.",
    accent: "#15803D",
  },
  {
    num: "03",
    title: "Pay offline, anywhere",
    desc: "Board a jeepney or tricycle, scan the QR, and your phone beams a signed payment via Bluetooth. No signal. No problem.",
    accent: "#7C3AED",
  },
  {
    num: "04",
    title: "Clear debts automatically",
    desc: "Tap 'Settle from Vault.' Soroban routes your locked collateral directly to the Cooperative — debt cleared, no default risk.",
    accent: "#B45309",
  },
];

const TESTIMONIALS = [
  {
    quote: "Before Mobilis, I borrowed from a 5-6 every week just to buy fuel. Now my vault covers it automatically. I kept 15% more of my income last month.",
    name: "Rommel D.",
    role: "Tricycle driver, Cavite",
    initials: "RD",
    color: "#1652C9",
  },
  {
    quote: "The QR payment works even in Barangay Mabolo where there's zero signal. My passengers love it — faster than exact change.",
    name: "Maribel S.",
    role: "Jeepney operator, Cebu",
    initials: "MS",
    color: "#15803D",
  },
  {
    quote: "I had no credit history at all. After 30 days with the vault locked, I got approved for a cooperative loan without any paperwork.",
    name: "Jun A.",
    role: "TNVS driver, Metro Manila",
    initials: "JA",
    color: "#7C3AED",
  },
];

const TRUST_BADGES = [
  {
    icon: (dark: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={dark ? "#7DB3FF" : "#1652C9"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
    label: "Stellar Community Fund",
  },
  {
    icon: (dark: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={dark ? "#7DB3FF" : "#1652C9"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    ),
    label: "AES-256 Encrypted",
  },
  {
    icon: (dark: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={dark ? "#7DB3FF" : "#1652C9"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    ),
    label: "Non-custodial",
  },
  {
    icon: (dark: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={dark ? "#7DB3FF" : "#1652C9"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
    label: "5s settlement",
  },
];

const TAG_COLORS_LIGHT: Record<string, { bg: string; text: string; border: string }> = {
  blue:   { bg: "#EBF3FD", text: "#185FA5", border: "#B5D4F4" },
  green:  { bg: "#EAF3DE", text: "#3B6D11", border: "#C0DD97" },
  purple: { bg: "#EEEDFE", text: "#3C3489", border: "#CECBF6" },
  amber:  { bg: "#FAEEDA", text: "#854F0B", border: "#FAC775" },
  red:    { bg: "#FCEBEB", text: "#A32D2D", border: "#F7C1C1" },
  teal:   { bg: "#E1F5EE", text: "#0F6E56", border: "#9FE1CB" },
};
const TAG_COLORS_DARK: Record<string, { bg: string; text: string; border: string }> = {
  blue:   { bg: "#1A2644", text: "#7DB3FF", border: "#2A3D6B" },
  green:  { bg: "#052E16", text: "#4ADE80", border: "#166534" },
  purple: { bg: "#1E1A3A", text: "#A78BFA", border: "#3B3275" },
  amber:  { bg: "#2A1800", text: "#FCD34D", border: "#78350F" },
  red:    { bg: "#200A0A", text: "#F87171", border: "#7F1D1D" },
  teal:   { bg: "#042A1E", text: "#34D399", border: "#065F46" },
};

// ─── Component ────────────────────────────────────────────────────────────────

const LandingPage: React.FC = () => {
  const [dark, setDark] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Derived theme tokens
  const c = {
    bg:          dark ? "#0C0E16" : "#FAF8F5",
    bgCard:      dark ? "#141722" : "#ffffff",
    bgSection:   dark ? "#0F1219" : "#ffffff",
    bgAlt:       dark ? "#0C0E16" : "#FAF8F5",
    border:      dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
    borderMid:   dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)",
    headerBg:    dark
      ? `rgba(12,14,22,${scrolled ? "0.95" : "0.8"})`
      : `rgba(250,248,245,${scrolled ? "0.97" : "0.85"})`,
    text:        dark ? "#F1F5F9" : "#0D1117",
    textMid:     dark ? "#94A3B8" : "#4B5563",
    textFaint:   dark ? "#475569" : "#9CA3AF",
    blue:        dark ? "#4F8EF7" : "#1652C9",
    blueText:    dark ? "#7DB3FF" : "#1652C9",
    blue50:      dark ? "#1A2644" : "#EEF4FF",
    statBg:      dark ? "#141722" : "#ffffff",
    moonBtn:     dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
    tag:         dark ? TAG_COLORS_DARK : TAG_COLORS_LIGHT,
    problemRed:  dark ? { bg: "#200A0A", border: "#7F1D1D", icon: "#3B0A0A" } : { bg: "#fff", border: "#FCA5A5", icon: "#FEF2F2" },
    problemBlue: dark ? { bg: "#0F1B33", border: "#1E3A6E", icon: "#1A2644" } : { bg: "#fff", border: "#93C5FD", icon: "#EFF6FF" },
    ctaBg:       dark ? "linear-gradient(135deg, #040A1A 0%, #0F2456 100%)" : "linear-gradient(135deg, #0A1931 0%, #153677 100%)",
    footerBg:    dark ? "#08090F" : "#0D1117",
    inputBg:     dark ? "#1A1D2E" : "#F9FAFB",
    inputBorder: dark ? "rgba(255,255,255,0.12)" : "#E5E7EB",
  };

  const DarkToggle = () => (
    <button
      onClick={() => setDark(d => !d)}
      aria-label="Toggle dark mode"
      style={{
        background: c.moonBtn,
        border: `1px solid ${c.border}`,
        borderRadius: 50,
        width: 38,
        height: 38,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        color: c.text,
        flexShrink: 0,
        transition: "background 0.2s",
      }}
    >
      {dark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5"/>
          <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      )}
    </button>
  );

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: c.bg, color: c.text, overflowX: "hidden", minHeight: "100vh", transition: "background 0.3s, color 0.3s" }}>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, background: c.headerBg, backdropFilter: "blur(20px)", borderBottom: `1px solid ${c.border}`, padding: "0 2rem", height: 68, display: "flex", alignItems: "center", justifyContent: "space-between", transition: "background 0.3s" }}>
<a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: c.text }}>
          <img 
            src="/logo_1.png" 
            alt="Mobilis Logo" 
            style={{ 
              height: 36, 
              width: "auto", 
              objectFit: "contain",
              flexShrink: 0 
            }} 
          />
          
          <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.5px", color: c.text }}>
            MOBILIS
          </span>
        </a>

        <nav style={{ display: "flex", gap: "2rem", alignItems: "center" }} className="lp-desktop-nav">
          {NAV_LINKS.map(l => (
            <a key={l.label} href={l.href} style={{ fontSize: 14, fontWeight: 600, color: c.textMid, textDecoration: "none", letterSpacing: "0.2px", transition: "color 0.2s" }} className="lp-nav-link">{l.label}</a>
          ))}
        </nav>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <DarkToggle />
          <a href="/auth" style={{ textDecoration: "none" }}>
            <button style={{ background: "transparent", border: `1.5px solid ${c.borderMid}`, borderRadius: 50, padding: "8px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer", color: c.text, transition: "all 0.2s" }} className="lp-btn-outline">Log in</button>
          </a>
          <a href="/auth" style={{ textDecoration: "none" }}>
            <button style={{ background: c.blue, border: "none", borderRadius: 50, padding: "10px 22px", fontSize: 14, fontWeight: 700, cursor: "pointer", color: "#fff", boxShadow: "0 4px 14px rgba(22,82,201,0.35)", transition: "all 0.2s" }} className="lp-btn-primary">Sign up free</button>
          </a>
        </div>
      </header>

      {/* ── HERO ───────────────────────────────────────────────────────────── */}
      <section style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "140px 2rem 60px", position: "relative", overflow: "hidden" }}>
        {/* Ambient blobs */}
        <div style={{ position: "absolute", top: "-5%", left: "5%", width: 700, height: 700, background: dark ? "radial-gradient(circle, rgba(79,142,247,0.07) 0%, transparent 60%)" : "radial-gradient(circle, rgba(245,176,65,0.1) 0%, transparent 60%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: "20%", right: "-5%", width: 500, height: 500, background: dark ? "radial-gradient(circle, rgba(124,58,237,0.06) 0%, transparent 70%)" : "radial-gradient(circle, rgba(22,82,201,0.07) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: "10%", left: "20%", width: 400, height: 400, background: dark ? "radial-gradient(circle, rgba(21,128,61,0.05) 0%, transparent 70%)" : "radial-gradient(circle, rgba(21,128,61,0.05) 0%, transparent 70%)", pointerEvents: "none" }} />

        {/* Eyebrow pill */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 50, padding: "8px 20px", fontSize: 13, fontWeight: 700, color: c.text, marginBottom: "2rem", boxShadow: dark ? "0 4px 20px rgba(0,0,0,0.3)" : "0 4px 12px rgba(0,0,0,0.04)" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#F5B041", display: "inline-block", animation: "lppulse 2s infinite" }} />
          Built on Stellar + Soroban · Offline-first
        </div>

        <h1 style={{ fontSize: "clamp(2.8rem, 6vw, 5.5rem)", fontWeight: 900, lineHeight: 1.04, letterSpacing: "-2.5px", color: c.text, maxWidth: 900, margin: "0 auto 1.5rem" }}>
          Offline transit finance{" "}
          <br />
          <span style={{ background: "linear-gradient(135deg, #1652C9 0%, #C0392B 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            for the unbanked.
          </span>
        </h1>

        <p style={{ fontSize: "clamp(1rem, 2vw, 1.2rem)", color: c.textMid, maxWidth: 580, margin: "0 auto 3rem", lineHeight: 1.65 }}>
          Jeepney drivers, tricycle operators, and daily commuters across Southeast Asia can now save, build credit, and pay — even without a signal.
        </p>

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center", marginBottom: "4rem" }}>
          <a href="/auth" style={{ textDecoration: "none" }}>
            <button style={{ background: c.blue, color: "#fff", border: "none", borderRadius: 50, padding: "16px 40px", fontSize: 16, fontWeight: 700, cursor: "pointer", boxShadow: "0 10px 25px rgba(22,82,201,0.35)", display: "flex", alignItems: "center", gap: 10 }} className="lp-btn-primary">
              Open app
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>
          </a>
          <button style={{ background: "transparent", color: c.textMid, border: `1.5px solid ${c.borderMid}`, borderRadius: 50, padding: "16px 36px", fontSize: 15, fontWeight: 600, cursor: "pointer" }} className="lp-btn-ghost">
            Watch demo
          </button>
        </div>

        {/* Vehicle row */}
        <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: "1rem", width: "100%", maxWidth: 800, zIndex: 10 }}>
          <img src="/tricycle.png" alt="Tricycle" className="lp-vehicle" style={{ width: "28%", objectFit: "contain", filter: dark ? "drop-shadow(0 10px 20px rgba(0,0,0,0.5)) brightness(0.85)" : "drop-shadow(0 10px 15px rgba(0,0,0,0.15))" }} />
          <img src="/taxi.png" alt="Taxi" className="lp-vehicle" style={{ width: "33%", objectFit: "contain", filter: dark ? "drop-shadow(0 10px 20px rgba(0,0,0,0.5)) brightness(0.85)" : "drop-shadow(0 10px 15px rgba(0,0,0,0.15))", transform: "translateY(15px)" }} />
          <img src="/jeep.png" alt="Jeepney" className="lp-vehicle" style={{ width: "33%", objectFit: "contain", filter: dark ? "drop-shadow(0 10px 20px rgba(0,0,0,0.5)) brightness(0.85)" : "drop-shadow(0 10px 15px rgba(0,0,0,0.15))" }} />
        </div>
      </section>

      {/* ── STATS STRIP ────────────────────────────────────────────────────── */}
      <section style={{ background: c.bgSection, borderTop: `1px solid ${c.border}`, borderBottom: `1px solid ${c.border}`, padding: "60px 2rem" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "2rem" }}>
          {STATS.map(s => (
            <div key={s.value} style={{ textAlign: "center" }}>
              <div style={{ fontSize: "clamp(2.2rem, 4vw, 3rem)", fontWeight: 900, letterSpacing: "-1.5px", color: c.text, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: c.textMid, marginTop: 6 }}>{s.label}</div>
              <div style={{ fontSize: 13, color: c.textFaint, marginTop: 3 }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── PROBLEM / SOLUTION ─────────────────────────────────────────────── */}
      <section id="problem" style={{ background: c.bgAlt, padding: "100px 2rem" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "4rem" }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "2px", textTransform: "uppercase", color: c.textFaint, marginBottom: 12 }}>The Problem</div>
            <h2 style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 900, letterSpacing: "-1px", color: c.text, margin: 0 }}>The broken status quo</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "2rem" }}>
            <div className="lp-hover-card" style={{ background: c.problemRed.bg, border: `1px solid ${dark ? "#7F1D1D" : "#FCA5A5"}`, borderRadius: 24, padding: "3rem" }}>
              <div style={{ width: 52, height: 52, background: c.problemRed.icon, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1.5rem" }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={dark ? "#F87171" : "#DC2626"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 1rem", color: c.text }}>Predatory lending traps informal drivers</h3>
              <p style={{ fontSize: 15, lineHeight: 1.7, color: c.textMid, margin: 0 }}>
                Informal transit drivers lose up to <strong style={{ color: dark ? "#F87171" : "#DC2626" }}>15% of their daily income</strong> to "5-6" loan sharks. Traditional digital wallets collapse the moment drivers enter cellular dead zones.
              </p>
            </div>
            <div className="lp-hover-card" style={{ background: c.problemBlue.bg, border: `1px solid ${dark ? "#1E3A6E" : "#93C5FD"}`, borderRadius: 24, padding: "3rem" }}>
              <div style={{ width: 52, height: 52, background: c.problemBlue.icon, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1.5rem" }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={dark ? "#7DB3FF" : "#1652C9"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 1rem", color: c.text }}>Offline-capable credit and payments</h3>
              <p style={{ fontSize: 15, lineHeight: 1.7, color: c.textMid, margin: 0 }}>
                Mobilis introduces a <strong style={{ color: c.blueText }}>Collateralized Personal Vault</strong>. Payments are authorized via Bluetooth "Scan-and-Beam" cryptograms that work offline, settling on Stellar when signal returns.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ───────────────────────────────────────────────────────── */}
      <section id="features" style={{ padding: "100px 2rem", background: c.bgSection }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "4rem" }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "2px", textTransform: "uppercase", color: c.textFaint, marginBottom: 12 }}>What's inside</div>
            <h2 style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 900, letterSpacing: "-1px", color: c.text, margin: 0 }}>Everything you need, on-chain</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.5rem" }}>
            {FEATURES.map(f => {
              const tc = c.tag[f.tagColor];
              return (
                <div key={f.title} className="lp-hover-card" style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 24, padding: "2rem", transition: "all 0.3s ease" }}>
                  <div style={{ width: 52, height: 52, borderRadius: 14, background: tc.bg, border: `1px solid ${tc.border}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1.25rem" }}>
                    {f.icon(dark)}
                  </div>
                  <div style={{ display: "inline-block", background: tc.bg, border: `1px solid ${tc.border}`, color: tc.text, fontSize: 10, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", padding: "4px 12px", borderRadius: 50, marginBottom: "1rem" }}>
                    {f.tag}
                  </div>
                  <h3 style={{ fontSize: 17, fontWeight: 800, margin: "0 0 0.75rem", color: c.text }}>{f.title}</h3>
                  <p style={{ fontSize: 14, lineHeight: 1.65, color: c.textMid, margin: 0 }}>{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ───────────────────────────────────────────────────── */}
      <section id="how-it-works" style={{ padding: "100px 2rem", background: c.bgAlt }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "5rem" }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "2px", textTransform: "uppercase", color: c.textFaint, marginBottom: 12 }}>The flow</div>
            <h2 style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 900, letterSpacing: "-1px", color: c.text, margin: 0 }}>From vault to freedom in four steps</h2>
          </div>

          <div style={{ position: "relative" }}>
            {/* Vertical line */}
            <div style={{ position: "absolute", left: 27, top: 0, bottom: 0, width: 1, background: `linear-gradient(to bottom, ${c.blue}, transparent)`, opacity: 0.3 }} />

            <div style={{ display: "flex", flexDirection: "column", gap: "3rem" }}>
              {STEPS.map((step, i) => (
                <div key={step.num} style={{ display: "flex", gap: "2rem", alignItems: "flex-start" }}>
                  {/* Step number circle */}
                  <div style={{ width: 54, height: 54, borderRadius: "50%", background: step.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13, fontWeight: 900, color: "#fff", zIndex: 1, boxShadow: `0 4px 16px ${step.accent}44` }}>
                    {step.num}
                  </div>
                  <div style={{ paddingTop: 10, flex: 1 }}>
                    <h3 style={{ fontSize: 20, fontWeight: 800, color: c.text, margin: "0 0 0.5rem" }}>{step.title}</h3>
                    <p style={{ fontSize: 15, lineHeight: 1.65, color: c.textMid, margin: 0 }}>{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ───────────────────────────────────────────────────── */}
      <section id="testimonials" style={{ padding: "100px 2rem", background: c.bgSection }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "4rem" }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "2px", textTransform: "uppercase", color: c.textFaint, marginBottom: 12 }}>Stories</div>
            <h2 style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 900, letterSpacing: "-1px", color: c.text, margin: 0 }}>Drivers who already made the switch</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.5rem" }}>
            {TESTIMONIALS.map(t => (
              <div key={t.name} className="lp-hover-card" style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 24, padding: "2rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                {/* Quote mark */}
                <div style={{ fontSize: 48, lineHeight: 1, color: t.color, opacity: 0.25, fontWeight: 900, marginBottom: -16 }}>"</div>
                <p style={{ fontSize: 15, lineHeight: 1.7, color: c.textMid, margin: 0, fontStyle: "italic" }}>"{t.quote}"</p>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: "auto" }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: t.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                    {t.initials}
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: c.text }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: c.textFaint }}>{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TRUST BADGES ───────────────────────────────────────────────────── */}
      <section style={{ background: c.bgAlt, borderTop: `1px solid ${c.border}`, padding: "56px 2rem" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: c.textFaint }}>Built with trust at every layer</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "1.5rem" }}>
            {TRUST_BADGES.map(b => (
              <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 10, background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 50, padding: "10px 20px" }}>
                {b.icon(dark)}
                <span style={{ fontSize: 13, fontWeight: 700, color: c.textMid }}>{b.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── EMAIL CTA ──────────────────────────────────────────────────────── */}
      <section style={{ background: c.bgSection, padding: "80px 2rem", borderTop: `1px solid ${c.border}` }}>
        <div style={{ maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 900, letterSpacing: "-0.8px", color: c.text, margin: "0 0 1rem" }}>
            Get early access
          </h2>
          <p style={{ fontSize: 15, color: c.textMid, margin: "0 0 2rem", lineHeight: 1.6 }}>
            Be the first to know when Mobilis launches in your city. No spam, unsubscribe any time.
          </p>
          <div style={{ display: "flex", gap: 10, maxWidth: 440, margin: "0 auto" }}>
            <input
              type="email"
              placeholder="your@email.com"
              style={{
                flex: 1, padding: "13px 18px", borderRadius: 50, border: `1.5px solid ${c.inputBorder}`,
                background: c.inputBg, color: c.text, fontSize: 14, outline: "none",
                fontFamily: "inherit",
              }}
            />
            <button style={{ background: c.blue, color: "#fff", border: "none", borderRadius: 50, padding: "13px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", boxShadow: "0 4px 14px rgba(22,82,201,0.3)" }} className="lp-btn-primary">
              Notify me
            </button>
          </div>
        </div>
      </section>

      {/* ── MAIN CTA BANNER ────────────────────────────────────────────────── */}
      <section style={{ background: c.ctaBg, padding: "100px 2rem", textAlign: "center" }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <h2 style={{ fontSize: "clamp(2rem, 4vw, 3.5rem)", fontWeight: 900, letterSpacing: "-1.5px", color: "#fff", margin: "0 auto 1.5rem", lineHeight: 1.1 }}>
            Your savings build your credit.
            <br />
            <span style={{ color: "rgba(255,255,255,0.55)" }}>Your credit ends the debt cycle.</span>
          </h2>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 17, maxWidth: 440, margin: "0 auto 3rem", lineHeight: 1.6 }}>
            Free to join. Works offline, anywhere in Southeast Asia.
          </p>
          <a href="/auth" style={{ textDecoration: "none" }}>
            <button style={{ background: "#fff", color: "#1652C9", border: "none", borderRadius: 50, padding: "18px 52px", fontSize: 16, fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 30px rgba(0,0,0,0.25)" }} className="lp-btn-primary">
              Create free account →
            </button>
          </a>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
      <footer style={{ background: c.footerBg, color: "#9CA3AF", padding: "64px 2rem 32px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "3rem", justifyContent: "space-between", marginBottom: "3rem" }}>
            <div style={{ maxWidth: 240 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1rem" }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                  </svg>
                </div>
                <span style={{ color: "#F9FAFB", fontWeight: 900, fontSize: 16, letterSpacing: "-0.5px" }}>MOBILIS</span>
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.7, margin: 0 }}>
                Offline transit finance for Southeast Asia's unbanked. Built for the Stellar Community Fund.
              </p>
            </div>
            {[
              { title: "Product", links: ["Web Wallet", "Offline Payments", "Personal Vault", "Credit Score"] },
              { title: "Company", links: ["About", "Blog", "Careers", "Press Kit"] },
              { title: "Support", links: ["Documentation", "Help Center", "Contact", "Status"] },
            ].map(col => (
              <div key={col.title}>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: "#6B7280", marginBottom: "1rem" }}>{col.title}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                  {col.links.map(l => (
                    <a key={l} href="#" style={{ fontSize: 14, color: "#9CA3AF", textDecoration: "none", transition: "color 0.2s" }} className="lp-footer-link">{l}</a>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "2rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
            <p style={{ fontSize: 13, margin: 0 }}>© 2026 Mobilis. All rights reserved.</p>
            <div style={{ display: "flex", gap: "1.5rem" }}>
              {["Privacy", "Terms", "Cookies"].map(l => (
                <a key={l} href="#" style={{ fontSize: 13, color: "#6B7280", textDecoration: "none" }}>{l}</a>
              ))}
            </div>
          </div>
        </div>
      </footer>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }

        @keyframes lppulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

        .lp-nav-link:hover { color: #1652C9 !important; }
        .lp-footer-link:hover { color: #F9FAFB !important; }

        .lp-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 14px 30px rgba(22,82,201,0.45) !important; }
        .lp-btn-outline:hover { background: rgba(0,0,0,0.05) !important; }
        .lp-btn-ghost:hover { background: rgba(0,0,0,0.04) !important; }

        .lp-hover-card { transition: transform 0.25s ease, box-shadow 0.25s ease; }
        .lp-hover-card:hover { transform: translateY(-5px); box-shadow: 0 16px 40px rgba(0,0,0,0.1) !important; }

        .lp-vehicle { transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        .lp-vehicle:hover { transform: scale(1.06) translateY(-6px) !important; }

        @media (max-width: 768px) {
          .lp-desktop-nav { display: none !important; }
        }
      `}</style>
    </div>
  );
};

export default LandingPage;