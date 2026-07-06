import React, { useState, useEffect } from "react";
import { useTheme } from "../contexts/ThemeContext";

// ─── Southeast Asian Statistics ──────────────────────────────────────────────
const STATS = [
  { value: "120M+", label: "Transit Workers in SEA", sub: "Underserved by digital banking" },
  { value: "18%", label: "Average Income Saved", sub: "By bypassing informal loan sharks" },
  { value: "$8 – $12", label: "Daily Ride Earnings", sub: "Tuk-tuk, angkot, and jeepney fleet avg" },
  { value: "0 Bars", label: "Signal Required", sub: "Seamless Bluetooth transactions" },
];

// ─── Features Configuration ──────────────────────────────────────────────────
const FEATURES = [
  {
    icon: (color: string) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 7V1h-6M1 7V1h6M23 17v6h-6M1 17v6h6" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    ),
    title: "Scan-and-Beam Protocol",
    desc: "Commuters scan a vehicle QR code and silently beam signed transaction cryptograms via Bluetooth directly to the driver's device.",
    tag: "Offline-First",
    color: "#FF6B00",
  },
  {
    icon: (color: string) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
    title: "Personal Savings Vault",
    desc: "Lock assets inside a time-locked Soroban contract. Locked savings boost your credit rating and unlock higher microcredit limits.",
    tag: "On-Chain Collateral",
    color: "#10B981",
  },
  {
    icon: (color: string) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    title: "Dynamic Trust Scoring",
    desc: "Calculated deterministically from actual ledger entries. Repayment habits, vault balances, and compliance adjust credit limits in real-time.",
    tag: "Credit Rating",
    color: "#FFE600",
  },
];

// ─── Legal Modal Component ───────────────────────────────────────────────────
const LegalModal: React.FC<{ type: "terms" | "privacy" | null; onClose: () => void; dark: boolean }> = ({ type, onClose, dark }) => {
  if (!type) return null;
  const isTerms = type === "terms";
  const content = isTerms
    ? [
        { title: "1. Decentralized Non-Custodial Agreement", body: "Aranova operates as a fully decentralized, non-custodial financial platform deployed on the Stellar blockchain network. By generating a wallet or connecting an existing public key, you acknowledge that Aranova possesses no direct access to, or custody of, your private key, seed phrases, or transaction PIN code. Keys are stored local-only in encrypted browser structures using AES-256." },
        { title: "2. Role: Commuter Obligations", body: "Commuters utilize the Scan-and-Beam protocol to pay transit fares. Commuters authorize transaction cryptograms signed locally with their private key, and agree that once these signatures are broadcasted to the Stellar network by a receiving driver or node, the transaction is irreversible and permanently recorded on the blockchain ledger." },
        { title: "3. Role: Driver Microcredit & Collateral Vaults", body: "Drivers may lock personal assets (XLM/USDC) inside time-locked Soroban smart contract vaults to build their credit rating. By requesting microloans from their Cooperative, drivers explicitly agree that their locked vault assets serve as debt collateral. In the event of default or overdue loan status past the defined settlement date, the system is authorized to trigger on-chain collateral liquidation to reconcile the outstanding debt." },
        { title: "4. Role: Cooperative Fund Responsibilities", body: "Approved Cooperatives oversee microloan allocations from their pooled on-chain reserves. Cooperatives are responsible for verifying the credentials of linked drivers. Interests and repayment fees accrued from driver settlements are routed directly to the Cooperative's public Stellar wallet via automated smart contracts." },
        { title: "5. Offline Bluetooth Transmission", body: "All offline transactions signed in zones without internet cellular service represent binding payment instructions. Drivers agree to sync their device's transaction queues to Stellar Horizon endpoints within 72 hours of receiving offline payments." }
      ]
    : [
        { title: "1. Zero Personal Data Collection", body: "We do not track, collect, or store any personally identifiable information (PII). Aranova has no centralized databases containing your name, physical address, geographical coordinate tracking, device identifiers, IP addresses, or transit route histories." },
        { title: "2. Local Device Sandboxed Storage", body: "All transaction logs, secret key caches, recovery seed phrases, and offline Bluetooth transit payment queues are stored strictly within the user's localized browser storage (localStorage). This data remains inside your device's sandboxed environment and is cleared if the browser memory or cache is wiped." },
        { title: "3. Public Ledger Disclosures", body: "Because Aranova operates on the public Stellar network, your public wallet address, transaction amounts, timestamps, deposit vaults, and credit borrowing logs are publicly visible. This information is immutable and cannot be deleted, modified, or scrubbed." },
        { title: "4. Third-Party Analytics & Cookies", body: "Aranova uses no third-party marketing cookies, trackers, or analytical hooks. All interface operations run serverless, communicating directly with Firebase Auth for basic account syncing and Stellar Horizon nodes for blockchain ledger operations." }
      ];

  const bgColor = dark ? "#11131E" : "#ffffff";
  const textColor = dark ? "#f8fafc" : "#0f172a";
  const textMutedColor = dark ? "#94a3b8" : "#475569";
  const borderColor = dark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.08)";

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(8,9,14,0.75)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: "1rem" }} onClick={onClose}>
      <div className="animate-scale-up" style={{ background: bgColor, borderRadius: 24, border: `1px solid ${borderColor}`, width: "100%", maxWidth: 640, maxHeight: "85vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "1.5rem 2rem", borderBottom: `1px solid ${borderColor}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: textColor }}>{isTerms ? "Terms of Service" : "Privacy Policy"}</h2>
          <button onClick={onClose} style={{ background: dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)", border: "none", borderRadius: "50%", width: 36, height: 36, cursor: "pointer", fontSize: 18, color: textColor }}>×</button>
        </div>
        <div style={{ overflowY: "auto", padding: "2rem", flex: 1 }}>
          {content.map((section) => (
            <div key={section.title} style={{ marginBottom: "1.5rem" }}>
              <h3 style={{ fontSize: 15, fontWeight: 900, color: textColor, margin: "0 0 8px" }}>{section.title}</h3>
              <p style={{ fontSize: 14, color: textMutedColor, margin: 0, lineHeight: 1.6 }}>{section.body}</p>
            </div>
          ))}
        </div>
        <div style={{ padding: "1.5rem 2rem", borderTop: `1px solid ${borderColor}`, display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ background: "#FF6B00", color: "#fff", border: "none", borderRadius: 12, padding: "10px 24px", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>I understand</button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Landing Page ───────────────────────────────────────────────────────
const LandingPage: React.FC = () => {
  const { dark, toggleDark } = useTheme();
  const [scrolled, setScrolled] = useState(false);
  const [legal, setLegal] = useState<"terms" | "privacy" | null>(null);
  
  // Interactive Simulator State
  const [simStep, setSimStep] = useState<"idle" | "beaming" | "queued" | "syncing" | "settled">("idle");
  const [simProgress, setSimProgress] = useState(0);

  // Persona Matrix State
  const [activePersona, setActivePersona] = useState<"commuter" | "driver" | "cooperative">("commuter");

  // Projection Calculator States
  const [calcTrustScore, setCalcTrustScore] = useState(75);
  const [calcFareSplitBps, setCalcFareSplitBps] = useState(20);
  const [calcMonthlyFareSpend, setCalcMonthlyFareSpend] = useState(300);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Run Simulator Animation Loop
  const triggerSimulation = () => {
    if (simStep !== "idle" && simStep !== "settled") return;
    
    setSimStep("beaming");
    setSimProgress(0);
    
    let p = 0;
    const interval = setInterval(() => {
      p += 5;
      setSimProgress(p);
      if (p >= 100) {
        clearInterval(interval);
        setSimStep("queued");
        
        setTimeout(() => {
          setSimStep("syncing");
          setTimeout(() => {
            setSimStep("settled");
          }, 2000);
        }, 1500);
      }
    }, 100);
  };

  // Color Palette Tokens
  const theme = {
    bg: dark ? "#06070B" : "#F8F9FD",
    bgCard: dark ? "rgba(15, 17, 28, 0.7)" : "rgba(255, 255, 255, 0.8)",
    border: dark ? "rgba(255, 255, 255, 0.05)" : "rgba(15, 23, 42, 0.06)",
    text: dark ? "#F8FAFC" : "#0F172A",
    textMuted: dark ? "#94A3B8" : "#55647C",
    accent: "#FF6B00",
    green: "#10B981",
    yellow: "#FFE600",
  };

  return (
    <div style={{
      background: theme.bg,
      color: theme.text,
      fontFamily: "'Outfit', 'Inter', sans-serif",
      overflowX: "hidden",
      minHeight: "100vh",
      transition: "background 0.4s ease, color 0.4s ease",
      position: "relative"
    }}>
      {/* Dynamic Grid Overlay Background */}
      <div className="grid-overlay" />

      {/* ─── STICKY HEADER ─── */}
      <header className={`landing-header ${scrolled ? "scrolled" : ""}`} style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        height: 80,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 3rem",
        transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        borderBottom: `1px solid ${scrolled ? theme.border : "transparent"}`
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img src="/logo_svg.svg" alt="Aranova Logo" style={{ height: 52, width: 52 }} className="header-logo" />
          <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.8px" }}>ARANOVA</span>
        </div>

        <nav className="desktop-only" style={{ display: "flex", gap: "3rem", alignItems: "center" }}>
          <a href="#features" className="nav-link" style={{ color: theme.textMuted }}>Features</a>
          <a href="#personas" className="nav-link" style={{ color: theme.textMuted }}>Roles</a>
          <a href="#projection" className="nav-link" style={{ color: theme.textMuted }}>Calculator</a>
          <a href="#simulator" className="nav-link" style={{ color: theme.textMuted }}>Simulator</a>
          <button onClick={() => setLegal("terms")} className="nav-link" style={{ background: "none", border: "none", color: theme.textMuted, cursor: "pointer", padding: 0, font: "inherit" }}>Agreement</button>
        </nav>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Theme Toggler Button */}
          <button 
            onClick={toggleDark} 
            className="theme-toggle"
            style={{
              background: dark ? "rgba(255,255,255,0.03)" : "rgba(15,23,42,0.04)",
              border: `1px solid ${theme.border}`,
              color: theme.text
            }}
          >
            {dark ? "☀️" : "🌙"}
          </button>
          
          <a href="/auth" className="btn-secondary" style={{ color: theme.text, border: `1px solid ${theme.border}` }}>Log In</a>
          <a href="/auth" className="btn-primary">Launch App</a>
        </div>
      </header>

      {/* ─── HERO SECTION ─── */}
      <section style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "180px 2rem 100px",
        position: "relative"
      }}>
        {/* Glow Spheres */}
        <div className="glow-sphere sphere-orange" />
        <div className="glow-sphere sphere-green" />
        <div className="glow-sphere sphere-blue" />
        <div className="glow-sphere sphere-yellow" />

        <div className="animate-slide-up badge-eyebrow" style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          background: dark ? "rgba(255,255,255,0.03)" : "rgba(15,23,42,0.04)",
          border: `1px solid ${theme.border}`,
          borderRadius: 100,
          padding: "8px 22px",
          fontSize: 13,
          fontWeight: 700,
          marginBottom: "2.5rem",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)"
        }}>
          <span className="live-dot" />
          Offline-first microcredit built on Stellar + Soroban
        </div>

        <h1 className="animate-slide-up hero-title" style={{
          fontSize: "clamp(2.8rem, 7vw, 6rem)",
          fontWeight: 900,
          lineHeight: 1.02,
          letterSpacing: "-3px",
          maxWidth: 1000,
          margin: "0 auto 2rem"
        }}>
          Financial pipelines for transit workers,{" "}
          <br className="desktop-only" />
          <span style={{
            background: "linear-gradient(135deg, #FFE600 0%, #FF6B00 50%, #10B981 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent"
          }}>
            even without signal.
          </span>
        </h1>

        <p className="animate-slide-up-delayed hero-desc" style={{
          color: theme.textMuted,
          fontSize: "clamp(1.1rem, 2.2vw, 1.35rem)",
          maxWidth: 680,
          margin: "0 auto 4rem",
          lineHeight: 1.65
        }}>
          A non-custodial decentralized PWA providing offline-first credit lines, personal vaults, and transit payments for daily operators in Southeast Asia.
        </p>

        <div className="animate-slide-up-delayed hero-buttons" style={{ display: "flex", gap: 20, flexWrap: "wrap", justifyContent: "center" }}>
          <a href="/auth" className="btn-hero-primary">Enter Dashboard &rarr;</a>
          <a href="#simulator" className="btn-hero-secondary" style={{ color: theme.text, border: `1px solid ${theme.border}` }}>Simulate Offline Pay</a>
        </div>

        {/* On-Chain Deployed Contract Banner */}
        <div className="animate-slide-up-delayed" style={{
          marginTop: "4rem",
          display: "inline-flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 24px",
          borderRadius: 16,
          background: dark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
          border: `1px solid ${theme.border}`,
          maxWidth: "90%",
          flexWrap: "wrap",
          justifyContent: "center",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
          position: "relative",
          zIndex: 5
        }}>
          <span style={{ fontSize: 10, color: theme.green, fontWeight: 900, textTransform: "uppercase", background: "rgba(16, 185, 129, 0.12)", padding: "4px 10px", borderRadius: 50, letterSpacing: "0.5px" }}>● Testnet Deployed</span>
          <span style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }}>
            CCXX5IPHC2I6U36ZP2PALB6YPP2G36D2MBDGEYYXF3YQVS75BPMINCNE
          </span>
          <a 
            href="https://stellar.expert/explorer/testnet/contract/CCXX5IPHC2I6U36ZP2PALB6YPP2G36D2MBDGEYYXF3YQVS75BPMINCNE" 
            target="_blank" 
            rel="noopener noreferrer" 
            style={{ fontSize: 11, fontWeight: 800, color: theme.accent, textDecoration: "none" }}
            className="nav-link"
          >
            Explorer &rarr;
          </a>
        </div>
      </section>


      {/* ─── INTERACTIVE PERSONA MATRIX ─── */}
      <section id="personas" style={{ padding: "120px 2rem", position: "relative" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "4rem" }}>
            <span style={{ fontSize: 13, fontWeight: 900, color: theme.accent, textTransform: "uppercase", letterSpacing: "2.5px" }}>Choose Your Role</span>
            <h2 style={{ fontSize: "clamp(2.2rem, 4.5vw, 3.25rem)", fontWeight: 900, letterSpacing: "-1.2px", margin: "10px 0" }}>Tailored Interfaces for All Actors</h2>
            <p style={{ color: theme.textMuted, maxWidth: 540, margin: "0 auto", fontSize: 16 }}>Switch roles below to see how Aranova customizes itself for daily commuters, drivers, and cooperatives.</p>
          </div>

          <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: "3rem", flexWrap: "wrap" }}>
            <button 
              onClick={() => setActivePersona("commuter")}
              style={{
                background: activePersona === "commuter" ? "rgba(255, 230, 0, 0.1)" : "transparent",
                border: `1px solid ${activePersona === "commuter" ? theme.yellow : theme.border}`,
                color: theme.text,
                padding: "12px 30px",
                borderRadius: 100,
                fontWeight: 900,
                fontSize: 14,
                cursor: "pointer",
                transition: "all 0.25s ease"
              }}
            >
              💳 Commuter
            </button>
            <button 
              onClick={() => setActivePersona("driver")}
              style={{
                background: activePersona === "driver" ? "rgba(255, 107, 0, 0.1)" : "transparent",
                border: `1px solid ${activePersona === "driver" ? theme.accent : theme.border}`,
                color: theme.text,
                padding: "12px 30px",
                borderRadius: 100,
                fontWeight: 900,
                fontSize: 14,
                cursor: "pointer",
                transition: "all 0.25s ease"
              }}
            >
              🛺 Driver
            </button>
            <button 
              onClick={() => setActivePersona("cooperative")}
              style={{
                background: activePersona === "cooperative" ? "rgba(16, 185, 129, 0.1)" : "transparent",
                border: `1px solid ${activePersona === "cooperative" ? theme.green : theme.border}`,
                color: theme.text,
                padding: "12px 30px",
                borderRadius: 100,
                fontWeight: 900,
                fontSize: 14,
                cursor: "pointer",
                transition: "all 0.25s ease"
              }}
            >
              🏢 Cooperative
            </button>
          </div>

          <div className="glass-card" style={{
            background: theme.bgCard,
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: `1px solid ${theme.border}`,
            borderRadius: 36,
            padding: "44px",
            boxShadow: dark ? "0 30px 60px rgba(0,0,0,0.4)" : "0 30px 60px rgba(15,23,42,0.04)",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "50px",
            alignItems: "center"
          }}>
            {/* Interactive mockup showing dashboard view */}
            <div style={{ background: dark ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.5)", border: `1px solid ${theme.border}`, borderRadius: 28, padding: "28px", display: "flex", flexDirection: "column", gap: "20px", minHeight: 280, justifyContent: "space-between" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${theme.border}`, paddingBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: activePersona === "commuter" ? theme.yellow : activePersona === "driver" ? theme.accent : theme.green }} />
                  <span style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "1px" }}>
                    {activePersona === "commuter" ? "Commuter Wallet" : activePersona === "driver" ? "Driver Console" : "Coop Pool Admin"}
                  </span>
                </div>
                <div style={{ fontSize: 11, background: dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)", padding: "4px 12px", borderRadius: 50, fontWeight: 800 }}>
                  Active standing
                </div>
              </div>

              {activePersona === "commuter" && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "16px" }}>
                    <div style={{ flex: 1, padding: "16px", borderRadius: 16, background: dark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", border: `1px solid ${theme.border}` }}>
                      <span style={{ fontSize: 10, color: theme.textMuted, fontWeight: 800, textTransform: "uppercase" }}>Wallet Balance</span>
                      <h4 style={{ fontSize: 24, fontWeight: 900, margin: "6px 0 0", color: theme.text }}>142.50 XLM</h4>
                    </div>
                    <div style={{ flex: 1, padding: "16px", borderRadius: 16, background: dark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", border: `1px solid ${theme.border}` }}>
                      <span style={{ fontSize: 10, color: theme.textMuted, fontWeight: 800, textTransform: "uppercase" }}>Savings Vault</span>
                      <h4 style={{ fontSize: 24, fontWeight: 900, margin: "6px 0 0", color: theme.yellow }}>40.00 XLM</h4>
                    </div>
                  </div>
                  <div style={{ padding: "16px", borderRadius: 16, background: "rgba(255, 230, 0, 0.04)", border: `1px solid rgba(255, 230, 0, 0.15)`, fontSize: 13, fontWeight: 700, display: "flex", justifyContent: "space-between" }}>
                    <span>🔄 Automated Vault Split Allocation:</span>
                    <span style={{ color: theme.yellow, fontWeight: 900 }}>20% of every payment</span>
                  </div>
                </>
              )}

              {activePersona === "driver" && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "16px" }}>
                    <div style={{ flex: 1, padding: "16px", borderRadius: 16, background: dark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", border: `1px solid ${theme.border}` }}>
                      <span style={{ fontSize: 10, color: theme.textMuted, fontWeight: 800, textTransform: "uppercase" }}>Trust Rating</span>
                      <h4 style={{ fontSize: 24, fontWeight: 900, margin: "6px 0 0", color: theme.accent }}>88 pts</h4>
                    </div>
                    <div style={{ flex: 1, padding: "16px", borderRadius: 16, background: dark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", border: `1px solid ${theme.border}` }}>
                      <span style={{ fontSize: 10, color: theme.textMuted, fontWeight: 800, textTransform: "uppercase" }}>Fuel credit limit</span>
                      <h4 style={{ fontSize: 24, fontWeight: 900, margin: "6px 0 0", color: theme.green }}>176.00 XLM</h4>
                    </div>
                  </div>
                  <div style={{ padding: "16px", borderRadius: 16, background: "rgba(255, 107, 0, 0.04)", border: `1px solid rgba(255, 107, 0, 0.15)`, fontSize: 13, fontWeight: 700, display: "flex", justifyContent: "space-between" }}>
                    <span>⚡ Instant Auto-Allocation:</span>
                    <span style={{ color: theme.accent, fontWeight: 900 }}>Bypasses review / Approved</span>
                  </div>
                </>
              )}

              {activePersona === "cooperative" && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "16px" }}>
                    <div style={{ flex: 1, padding: "16px", borderRadius: 16, background: dark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", border: `1px solid ${theme.border}` }}>
                      <span style={{ fontSize: 10, color: theme.textMuted, fontWeight: 800, textTransform: "uppercase" }}>Treasury pool</span>
                      <h4 style={{ fontSize: 24, fontWeight: 900, margin: "6px 0 0", color: theme.green }}>5,000.00 XLM</h4>
                    </div>
                    <div style={{ flex: 1, padding: "16px", borderRadius: 16, background: dark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", border: `1px solid ${theme.border}` }}>
                      <span style={{ fontSize: 10, color: theme.textMuted, fontWeight: 800, textTransform: "uppercase" }}>Active drivers</span>
                      <h4 style={{ fontSize: 24, fontWeight: 900, margin: "6px 0 0", color: theme.text }}>42</h4>
                    </div>
                  </div>
                  <div style={{ padding: "16px", borderRadius: 16, background: "rgba(16, 185, 129, 0.04)", border: `1px solid rgba(16, 185, 129, 0.15)`, fontSize: 13, fontWeight: 700, display: "flex", justifyContent: "space-between" }}>
                    <span>📊 Accumulated microfinance fees:</span>
                    <span style={{ color: theme.green, fontWeight: 900 }}>+126.00 XLM (Coop Profit)</span>
                  </div>
                </>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <h3 style={{ fontSize: 28, fontWeight: 900, margin: 0, letterSpacing: "-0.5px" }}>
                {activePersona === "commuter" && "Automatic Micro-Savings Splitting"}
                {activePersona === "driver" && "Seamless Zero-Collateral Fuel Credit"}
                {activePersona === "cooperative" && "On-chain Treasury Management Pools"}
              </h3>
              <p style={{ color: theme.textMuted, fontSize: 15, lineHeight: 1.7, margin: 0 }}>
                {activePersona === "commuter" && "Commuters sign fare transactions which splits automatically to savings and spending accounts. Building locked vault balances builds decentralized credit score points dynamically."}
                {activePersona === "driver" && "Drivers receive immediate auto-approval allocations from their Cooperative's liquidity pool, governed up to their maximum score ceiling limit. Repayments build ratings automatically."}
                {activePersona === "cooperative" && "Cooperatives deploy capital on-chain to provide regional transport drivers with immediate credit. All transaction feeds, disbursal histories, and risk limits are stored on the public ledger."}
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "10px", fontSize: 14, fontWeight: 700 }}>
                {activePersona === "commuter" && (
                  <>
                    <li>💳 Tap-and-Go Bluetooth payments</li>
                    <li>🔒 Programmatic time-locked savings vault</li>
                    <li>📈 Trust score updates automatically</li>
                  </>
                )}
                {activePersona === "driver" && (
                  <>
                    <li>⛽ Direct fuel credit allocations</li>
                    <li>❌ Zero paperwork or collateral locks</li>
                    <li>⚡ 1-click repayments built inside driver dashboard</li>
                  </>
                )}
                {activePersona === "cooperative" && (
                  <>
                    <li>💰 Yield-accruing liquidity pools</li>
                    <li>🕵️ Real-time audit logs of driver statuses</li>
                    <li>⚙️ Dynamic interest-free policy controls</li>
                  </>
                )}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ─── INTERACTIVE VAULT & CREDIT PROJECTION CALCULATOR ─── */}
      <section id="projection" style={{ padding: "120px 2rem", borderTop: `1px solid ${theme.border}`, background: dark ? "rgba(10,12,20,0.4)" : "rgba(240,242,250,0.4)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "5rem" }}>
            <span style={{ fontSize: 13, fontWeight: 900, color: theme.accent, textTransform: "uppercase", letterSpacing: "2.5px" }}>Visual Calculator</span>
            <h2 style={{ fontSize: "clamp(2.2rem, 4.5vw, 3.25rem)", fontWeight: 900, letterSpacing: "-1.2px", margin: "10px 0" }}>Project Your Savings & Credit Ceiling</h2>
            <p style={{ color: theme.textMuted, maxWidth: 540, margin: "0 auto", fontSize: 16 }}>Drag the sliders to see how vault configurations and trust score standings dynamically modify credit limits and savings outcomes.</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "50px", alignItems: "center" }}>
            
            {/* Input Sliders */}
            <div className="glass-card" style={{
              background: theme.bgCard,
              backdropFilter: "blur(20px)",
              border: `1px solid ${theme.border}`,
              borderRadius: 32,
              padding: "40px",
              display: "flex",
              flexDirection: "column",
              gap: "28px"
            }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px", fontSize: 14, fontWeight: 800 }}>
                  <span>Trust Score Rating:</span>
                  <span style={{ color: theme.accent }}>{calcTrustScore} pts</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="500" 
                  value={calcTrustScore}
                  onChange={(e) => setCalcTrustScore(Number(e.target.value))}
                  style={{ width: "100%", accentColor: theme.accent, cursor: "pointer" }}
                />
                <span style={{ fontSize: 10, color: theme.textMuted }}>Directly impacts maximum credit limits (Trust Score × 2). Standing score is uncapped on-chain.</span>
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px", fontSize: 14, fontWeight: 800 }}>
                  <span>Monthly Fare Spend:</span>
                  <span style={{ color: theme.yellow }}>{calcMonthlyFareSpend} XLM</span>
                </div>
                <input 
                  type="range" 
                  min="50" 
                  max="1000" 
                  step="10"
                  value={calcMonthlyFareSpend}
                  onChange={(e) => setCalcMonthlyFareSpend(Number(e.target.value))}
                  style={{ width: "100%", accentColor: theme.yellow, cursor: "pointer" }}
                />
                <span style={{ fontSize: 10, color: theme.textMuted }}>Average daily/monthly budget split for transit costs.</span>
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px", fontSize: 14, fontWeight: 800 }}>
                  <span>Vault Allocation Split:</span>
                  <span style={{ color: theme.green }}>{calcFareSplitBps}%</span>
                </div>
                <input 
                  type="range" 
                  min="5" 
                  max="50" 
                  step="1"
                  value={calcFareSplitBps}
                  onChange={(e) => setCalcFareSplitBps(Number(e.target.value))}
                  style={{ width: "100%", accentColor: theme.green, cursor: "pointer" }}
                />
                <span style={{ fontSize: 10, color: theme.textMuted }}>Percentage of transit spend routed to locked Soroban Vault savings.</span>
              </div>
            </div>

            {/* Calculations & Results */}
            <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
              <div style={{ padding: "24px", borderRadius: 20, background: dark ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.015)", border: `1px solid ${theme.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: 13, color: theme.textMuted, textTransform: "uppercase", fontWeight: 800 }}>Max Auto-Credit Limit</h4>
                  <p style={{ margin: "4px 0 0", fontSize: 11, color: theme.textMuted }}>Determined dynamically from score standing</p>
                </div>
                <div style={{ fontSize: 32, fontWeight: 900, color: theme.accent }}>
                  {(calcTrustScore * 2).toFixed(2)} <span style={{ fontSize: 14, fontWeight: 700 }}>XLM</span>
                </div>
              </div>

              <div style={{ padding: "24px", borderRadius: 20, background: dark ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.015)", border: `1px solid ${theme.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: 13, color: theme.textMuted, textTransform: "uppercase", fontWeight: 800 }}>1-Year Vault Accumulation</h4>
                  <p style={{ margin: "4px 0 0", fontSize: 11, color: theme.textMuted }}>Automatic savings generated from P2P splits</p>
                </div>
                <div style={{ fontSize: 32, fontWeight: 900, color: theme.green }}>
                  {((calcMonthlyFareSpend * (calcFareSplitBps / 100)) * 12).toFixed(2)} <span style={{ fontSize: 14, fontWeight: 700 }}>XLM</span>
                </div>
              </div>

              <div style={{ padding: "24px", borderRadius: 20, background: dark ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.015)", border: `1px solid ${theme.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: 13, color: theme.textMuted, textTransform: "uppercase", fontWeight: 800 }}>Estimated Credit Rating</h4>
                  <p style={{ margin: "4px 0 0", fontSize: 11, color: theme.textMuted }}>Projected risk grade level status</p>
                </div>
                <div style={{
                  fontSize: 16,
                  fontWeight: 900,
                  color: calcTrustScore >= 150 ? theme.green : calcTrustScore >= 80 ? theme.green : calcTrustScore >= 50 ? theme.yellow : theme.accent,
                  background: calcTrustScore >= 150 ? "rgba(16, 185, 129, 0.2)" : calcTrustScore >= 80 ? "rgba(16, 185, 129, 0.12)" : calcTrustScore >= 50 ? "rgba(255, 230, 0, 0.12)" : "rgba(255, 107, 0, 0.12)",
                  padding: "8px 18px",
                  borderRadius: 100,
                  border: `1px solid ${calcTrustScore >= 150 ? theme.green : calcTrustScore >= 80 ? theme.green : calcTrustScore >= 50 ? theme.yellow : theme.accent}`
                }}>
                  {calcTrustScore >= 150 ? "💎 Tier S Elite" : calcTrustScore >= 80 ? "🔥 Tier A Premium" : calcTrustScore >= 50 ? "⚡ Tier B Standard" : "⚠️ Tier C High Risk"}
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ─── INTERACTIVE SIMULATOR (No mockups, live SVG interaction) ─── */}
      <section id="simulator" style={{ padding: "120px 2rem", position: "relative" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "5rem" }}>
            <span style={{ fontSize: 13, fontWeight: 900, color: theme.accent, textTransform: "uppercase", letterSpacing: "2.5px" }}>Live Simulator</span>
            <h2 style={{ fontSize: "clamp(2.2rem, 4.5vw, 3.25rem)", fontWeight: 900, letterSpacing: "-1.2px", margin: "10px 0" }}>Experience Offline-First</h2>
            <p style={{ color: theme.textMuted, maxWidth: 540, margin: "0 auto", fontSize: 16 }}>Click the simulator below to trace a secure offline Bluetooth payment beamed from commuter to driver.</p>
          </div>

          <div className="glass-card" style={{
            background: theme.bgCard,
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: `1px solid ${theme.border}`,
            borderRadius: 36,
            padding: "50px",
            boxShadow: dark ? "0 30px 70px rgba(0,0,0,0.6)" : "0 30px 70px rgba(15,23,42,0.06)"
          }}>
            <div className="simulator-grid" style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "60px", alignItems: "center" }}>
              
              {/* Interactive SVG Diagram */}
              <div style={{ background: dark ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.4)", border: `1px solid ${theme.border}`, borderRadius: 28, padding: "30px", display: "flex", justifyContent: "center", position: "relative", overflow: "hidden" }}>
                
                {/* Glowing Bluetooth Ring Waves */}
                {simStep === "beaming" && (
                  <div className="bluetooth-wave-glow" />
                )}

                <svg width="100%" height="260" viewBox="0 0 400 260" style={{ position: "relative", zIndex: 2 }}>
                  {/* Commuter Node */}
                  <g className="commuter-node" transform="translate(60, 130)">
                    <circle cx="0" cy="0" r="45" fill={dark ? "#121422" : "#FFFFFF"} stroke={theme.border} strokeWidth="1.5" />
                    <circle cx="0" cy="0" r="35" fill={theme.yellow} opacity="0.12" />
                    <text x="0" y="8" textAnchor="middle" fill={theme.text} fontSize="32">📱</text>
                    <text x="0" y="65" textAnchor="middle" fill={theme.textMuted} fontSize="11" fontWeight="800" letterSpacing="0.5px">PASSENGER</text>
                  </g>

                  {/* Driver Node */}
                  <g className="driver-node" transform="translate(340, 130)">
                    <circle cx="0" cy="0" r="45" fill={dark ? "#121422" : "#FFFFFF"} stroke={theme.border} strokeWidth="1.5" />
                    <circle cx="0" cy="0" r="35" fill={theme.green} opacity="0.12" />
                    <text x="0" y="8" textAnchor="middle" fill={theme.text} fontSize="32">🛺</text>
                    <text x="0" y="65" textAnchor="middle" fill={theme.textMuted} fontSize="11" fontWeight="800" letterSpacing="0.5px">DRIVER CONSOLE</text>
                  </g>

                  {/* Bluetooth Beam Signal Path */}
                  <path d="M 115 130 L 285 130" fill="none" stroke={theme.border} strokeWidth="2.5" strokeDasharray="8 6" />
                  
                  {/* Beaming Wave Packet */}
                  {simStep === "beaming" && (
                    <circle cx={115 + (simProgress * 1.7)} cy="130" r="10" fill={theme.accent}>
                      <animate attributeName="opacity" values="0.9;0.4;0.9" dur="0.8s" repeatCount="indefinite" />
                    </circle>
                  )}

                  {/* Connection Ring Waves */}
                  {simStep === "beaming" && (
                    <>
                      <circle cx="60" cy="130" r="50" fill="none" stroke={theme.accent} strokeWidth="2" opacity="0.5" className="beam-ripple" />
                    </>
                  )}
                </svg>

                {/* Status Indicator Badge */}
                <div style={{
                  position: "absolute",
                  bottom: 24,
                  left: "50%",
                  transform: "translateX(-50%)",
                  padding: "8px 20px",
                  borderRadius: 100,
                  fontSize: 11,
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "1.5px",
                  background: simStep === "idle" ? theme.border : simStep === "beaming" ? theme.accent : simStep === "queued" ? theme.yellow : theme.green,
                  color: simStep === "idle" ? theme.textMuted : "#fff",
                  boxShadow: "0 10px 20px rgba(0,0,0,0.15)",
                  transition: "all 0.3s ease",
                  zIndex: 3
                }}>
                  {simStep === "idle" && "Simulator Ready"}
                  {simStep === "beaming" && "Beaming Packet..."}
                  {simStep === "queued" && "Offline Queued (No Signal)"}
                  {simStep === "syncing" && "Broadcasting to Stellar..."}
                  {simStep === "settled" && "On-Chain Settled"}
                </div>
              </div>

              {/* Interaction Details Panel */}
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                <h3 style={{ fontSize: 26, fontWeight: 900, margin: 0, letterSpacing: "-0.5px" }}>Bluetooth Offline Clearing</h3>
                <p style={{ color: theme.textMuted, fontSize: 15, lineHeight: 1.7, margin: 0 }}>
                  In Southeast Asian transit routes, drivers frequently enter cell dead zones. Aranova solves this by creating signed offline payment transactions that are stored securely in local device storage and cleared automatically when connection resumes.
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14, fontWeight: 700 }}>
                    <span className="bullet-check" style={{ color: simStep === "beaming" || simStep === "queued" || simStep === "syncing" || simStep === "settled" ? theme.green : theme.textMuted }}>✓</span>
                    Commuter signs fare packet locally (Private Key Encrypted)
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14, fontWeight: 700 }}>
                    <span className="bullet-check" style={{ color: simStep === "queued" || simStep === "syncing" || simStep === "settled" ? theme.green : theme.textMuted }}>✓</span>
                    Transaction beamed via Bluetooth (Zero cellular data used)
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14, fontWeight: 700 }}>
                    <span className="bullet-check" style={{ color: simStep === "settled" ? theme.green : theme.textMuted }}>✓</span>
                    Automatic on-chain reconciliation upon signal capture
                  </div>
                </div>

                <button 
                  onClick={triggerSimulation} 
                  disabled={simStep !== "idle" && simStep !== "settled"}
                  className="btn-primary" 
                  style={{ alignSelf: "flex-start", marginTop: "10px", width: "100%", minHeight: 48 }}
                >
                  {simStep === "idle" && "Simulate Offline Pay"}
                  {simStep === "beaming" && "Beaming..."}
                  {simStep === "queued" && "Offline Saved"}
                  {simStep === "syncing" && "Broadcasting..."}
                  {simStep === "settled" && "Run Simulation Again"}
                </button>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* ─── STATS BENTO SECTION ─── */}
      <section style={{ padding: "80px 2rem", borderTop: `1px solid ${theme.border}`, borderBottom: `1px solid ${theme.border}` }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "3rem" }}>
          {STATS.map(s => (
            <div key={s.value} className="stat-item" style={{ textAlign: "center", transition: "all 0.3s ease" }}>
              <div className="stat-value" style={{ fontSize: "clamp(2.8rem, 5vw, 3.8rem)", fontWeight: 900, letterSpacing: "-2px", color: theme.text, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: theme.accent, marginTop: 12, letterSpacing: "0.2px" }}>{s.label}</div>
              <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 6, lineHeight: 1.4 }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── FEATURES BENTO GRID ─── */}
      <section id="features" style={{ padding: "120px 2rem" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "6rem" }}>
            <span style={{ fontSize: 13, fontWeight: 900, color: theme.accent, textTransform: "uppercase", letterSpacing: "2.5px" }}>Protocol Specs</span>
            <h2 style={{ fontSize: "clamp(2.2rem, 4.5vw, 3.25rem)", fontWeight: 900, letterSpacing: "-1.2px", margin: "10px 0" }}>Decentralized Architecture</h2>
          </div>

          <div className="bento-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "2rem" }}>
            {FEATURES.map(f => (
              <div key={f.title} className="bento-card" style={{
                background: theme.bgCard,
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: `1px solid ${theme.border}`,
                borderRadius: 28,
                padding: "44px",
                position: "relative",
                overflow: "hidden"
              }}>
                {/* Glow border background decoration */}
                <div className="card-border-glow" style={{ borderColor: `${f.color}33` }} />

                <div className="feature-icon-wrapper" style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  background: `${f.color}12`,
                  border: `1px solid ${f.color}25`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: f.color,
                  marginBottom: "24px"
                }}>
                  {f.icon(f.color)}
                </div>
                <div style={{
                  display: "inline-block",
                  background: `${f.color}10`,
                  color: f.color,
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: "1.2px",
                  textTransform: "uppercase",
                  padding: "4px 14px",
                  borderRadius: 50,
                  marginBottom: "20px"
                }}>
                  {f.tag}
                </div>
                <h3 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 12px", color: theme.text }}>{f.title}</h3>
                <p style={{ color: theme.textMuted, fontSize: 14.5, lineHeight: 1.65, margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── DYNAMIC HERO CALL-TO-ACTION ─── */}
      <section style={{
        padding: "140px 2rem",
        background: dark ? "linear-gradient(180deg, #06070B 0%, #0F1222 100%)" : "linear-gradient(180deg, #F8F9FD 0%, #ECEFF9 100%)",
        textAlign: "center",
        borderTop: `1px solid ${theme.border}`,
        position: "relative",
        overflow: "hidden"
      }}>
        {/* Soft Radial Accent */}
        <div style={{ position: "absolute", bottom: "-30%", left: "50%", transform: "translateX(-50%)", width: 600, height: 400, background: "radial-gradient(circle, rgba(255,107,0,0.06) 0%, transparent 70%)", pointerEvents: "none" }} />

        <div style={{ maxWidth: 850, margin: "0 auto", position: "relative", zIndex: 2 }}>
          <h2 style={{ fontSize: "clamp(2.2rem, 5vw, 3.8rem)", fontWeight: 900, letterSpacing: "-1.8px", margin: "0 auto 24px", lineHeight: 1.1 }}>
            Align your savings.
            <br />
            <span style={{ opacity: 0.45 }}>Break the debt cycle on-chain.</span>
          </h2>
          <p style={{ color: theme.textMuted, fontSize: 18, maxWidth: 500, margin: "0 auto 48px", lineHeight: 1.65 }}>
            Free account setup. Works offline across all Southeast Asian municipal transport lines.
          </p>
          <a href="/auth" className="btn-hero-primary" style={{ display: "inline-block" }}>Get Started Free &rarr;</a>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer style={{ background: dark ? "#030406" : "#0A0B0E", color: "#64748B", padding: "100px 3rem 40px", borderTop: `1px solid ${theme.border}` }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "60px", marginBottom: "80px" }}>
            <div style={{ flex: "1 1 300px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: "20px" }}>
                <img src="/logo_svg.svg" alt="Aranova Logo" style={{ height: 44, width: 44 }} />
                <span style={{ color: "#fff", fontWeight: 900, fontSize: 20, letterSpacing: "-0.8px" }}>ARANOVA</span>
              </div>
              <p style={{ fontSize: 13.5, lineHeight: 1.7, margin: 0, color: "#475569", maxWidth: 320 }}>
                Decentralized microcredit and offline clearing protocols built for Southeast Asia's transport networks.
              </p>
            </div>
            
            <div style={{ display: "flex", gap: "80px", flexWrap: "wrap" }}>
              {[
                { title: "Protocol", links: ["Web Wallet", "Soroban Vaults", "Dynamic Scoring"] },
                { title: "Ecosystem", links: ["Stellar Horizon", "Freighter Kit", "SCF Project"] },
                { title: "Resources", links: ["Integration Docs", "Security Audit", "Brand Assets"] }
              ].map(c => (
                <div key={c.title}>
                  <h4 style={{ color: "#F8FAFC", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "24px" }}>{c.title}</h4>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "14px" }}>
                    {c.links.map(l => (
                      <li key={l}><a href="#" className="footer-link">{l}</a></li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: "40px", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "20px", fontSize: 13.5, color: "#334155" }}>
            <span>© 2026 Aranova. Enforcing trust and transit.</span>
            <div style={{ display: "flex", gap: "24px" }}>
              <button onClick={() => setLegal("privacy")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0, textDecoration: "underline", font: "inherit" }} className="footer-link-btn">Privacy</button>
              <button onClick={() => setLegal("terms")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0, textDecoration: "underline", font: "inherit" }} className="footer-link-btn">Terms</button>
            </div>
          </div>
        </div>
      </footer>

      {/* Legal terms modal popup */}
      <LegalModal type={legal} onClose={() => setLegal(null)} dark={dark} />

      {/* ─── GLOBAL STYLE CUSTOMIZATIONS & ANIMATIONS ─── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; }

        /* Scrolled Header Style */
        .landing-header.scrolled {
          background: ${dark ? "rgba(6, 7, 11, 0.82)" : "rgba(248, 249, 253, 0.85)"};
          backdrop-filter: blur(24px);
          WebkitBackdropFilter: blur(24px);
          height: 68px !important;
          padding: 0 2.5rem !important;
          box-shadow: 0 10px 30px -10px rgba(0,0,0,${dark ? "0.3" : "0.03)"});
        }
        @keyframes scrollGrid {
          0% { background-position: 0 0; }
          100% { background-position: 100px 100px; }
        }
        .grid-overlay {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          background-image: 
            linear-gradient(${dark ? 'rgba(255,255,255,0.012)' : 'rgba(15,23,42,0.018)'} 1px, transparent 1px),
            linear-gradient(90deg, ${dark ? 'rgba(255,255,255,0.012)' : 'rgba(15,23,42,0.018)'} 1px, transparent 1px);
          background-size: 50px 50px;
          animation: scrollGrid 20s linear infinite;
          mask-image: radial-gradient(circle at 50% 30%, black 20%, transparent 85%);
          -webkit-mask-image: radial-gradient(circle at 50% 30%, black 20%, transparent 85%);
          pointer-events: none;
          z-index: 0;
        }

        /* Ambient Glowing Aurora Blobs */
        .glow-sphere {
          position: absolute;
          border-radius: 50%;
          filter: blur(130px);
          pointer-events: none;
          opacity: 0.16;
          z-index: 0;
          mix-blend-mode: ${dark ? "screen" : "multiply"};
        }
        
        @keyframes floatBlob1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(65px, -45px) scale(1.15); }
        }
        @keyframes floatBlob2 {
          0%, 100% { transform: translate(0, 0) scale(1.1); }
          50% { transform: translate(-45px, 65px) scale(0.9); }
        }
        @keyframes floatBlob3 {
          0%, 100% { transform: translate(0, 0) scale(0.95); }
          50% { transform: translate(50px, 50px) scale(1.12); }
        }
        @keyframes floatBlob4 {
          0%, 100% { transform: translate(0, 0) scale(1.05); }
          50% { transform: translate(-50px, -50px) scale(0.88); }
        }

        .sphere-orange {
          top: 10%;
          left: 5%;
          width: 550px;
          height: 550px;
          background: radial-gradient(circle, #FF6B00 0%, transparent 70%);
          animation: floatBlob1 22s infinite ease-in-out;
        }
        .sphere-green {
          bottom: 15%;
          right: 2%;
          width: 500px;
          height: 500px;
          background: radial-gradient(circle, #10B981 0%, transparent 70%);
          animation: floatBlob2 26s infinite ease-in-out;
        }
        .sphere-blue {
          top: 40%;
          left: 45%;
          width: 450px;
          height: 450px;
          background: radial-gradient(circle, #1652C9 0%, transparent 70%);
          animation: floatBlob3 18s infinite ease-in-out;
        }
        .sphere-yellow {
          top: 5%;
          right: 15%;
          width: 400px;
          height: 400px;
          background: radial-gradient(circle, #FFE600 0%, transparent 70%);
          animation: floatBlob4 24s infinite ease-in-out;
        }

        /* Entrance Animations */
        @keyframes slideUpReveal {
          from { opacity: 0; transform: translateY(40px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes livePulse {
          0%, 100% { transform: scale(0.9); opacity: 0.65; }
          50% { transform: scale(1.2); opacity: 1; }
        }

        .animate-slide-up {
          animation: slideUpReveal 1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-slide-up-delayed {
          animation: slideUpReveal 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          opacity: 0;
        }
        .live-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: ${theme.accent};
          animation: livePulse 2s infinite ease-in-out;
        }

        /* 3D Floating Animations for Simulator */
        @keyframes floatCommuter {
          0%, 100% { transform: translate(60px, 130px) translateY(0); }
          50% { transform: translate(60px, 130px) translateY(-8px); }
        }
        @keyframes floatDriver {
          0%, 100% { transform: translate(340px, 130px) translateY(0); }
          50% { transform: translate(340px, 130px) translateY(-8px); }
        }
        .commuter-node {
          animation: floatCommuter 4s infinite ease-in-out;
        }
        .driver-node {
          animation: floatDriver 4s infinite ease-in-out;
          animation-delay: 0.5s;
        }

        /* Bluetooth wave pulse glow */
        .bluetooth-wave-glow {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 50% 50%, rgba(255, 107, 0, 0.04) 0%, transparent 60%);
          pointer-events: none;
          z-index: 1;
        }

        @keyframes ripple {
          0% { r: 50; opacity: 0.6; }
          100% { r: 155; opacity: 0; }
        }
        .beam-ripple {
          animation: ripple 2s infinite cubic-bezier(0.16, 1, 0.3, 1);
        }

        /* Premium Buttons */
        .btn-primary {
          background: #FF6B00;
          color: #fff;
          border: none;
          border-radius: 12px;
          padding: 12px 26px;
          font-size: 14px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 4px 20px rgba(255, 107, 0, 0.25);
          text-decoration: none;
          text-align: center;
        }
        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 30px rgba(255, 107, 0, 0.4);
          background: #E05E00;
        }

        .btn-secondary {
          background: transparent;
          border-radius: 12px;
          padding: 12px 26px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.25s ease;
          text-decoration: none;
        }
        .btn-secondary:hover {
          background: ${dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)"};
        }

        .btn-hero-primary {
          background: #FF6B00;
          color: #fff;
          border: none;
          border-radius: 50px;
          padding: 18px 40px;
          font-size: 16px;
          font-weight: 800;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 10px 24px rgba(255, 107, 0, 0.22);
          text-decoration: none;
        }
        .btn-hero-primary:hover {
          transform: translateY(-4px);
          box-shadow: 0 16px 36px rgba(255, 107, 0, 0.35);
          background: #E05E00;
        }

        .btn-hero-secondary {
          background: transparent;
          border-radius: 50px;
          padding: 18px 40px;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s ease;
          text-decoration: none;
        }
        .btn-hero-secondary:hover {
          background: ${dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)"};
          transform: translateY(-3px);
        }

        /* Nav links sliding bottom border hover */
        .nav-link {
          font-size: 14.5px;
          font-weight: 600;
          text-decoration: none;
          position: relative;
          padding-bottom: 4px;
          transition: color 0.25s ease;
        }
        .nav-link::after {
          content: '';
          position: absolute;
          width: 100%;
          transform: scaleX(0);
          height: 2px;
          bottom: 0;
          left: 0;
          background-color: #FF6B00;
          transform-origin: bottom right;
          transition: transform 0.25s ease-out;
        }
        .nav-link:hover {
          color: ${theme.text} !important;
        }
        .nav-link:hover::after {
          transform: scaleX(1);
          transform-origin: bottom left;
        }

        .theme-toggle {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          transition: all 0.25s ease;
        }
        .theme-toggle:hover {
          transform: scale(1.08);
        }

        /* Bento cards styling */
        .bento-card {
          position: relative;
          z-index: 1;
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: inset 0 1px 1px rgba(255,255,255,${dark ? '0.04' : '0.4'});
        }
        .bento-card:hover {
          transform: translateY(-8px);
          box-shadow: ${dark ? "0 30px 60px rgba(0,0,0,0.5)" : "0 30px 60px rgba(15,23,42,0.04)"} !important;
          border-color: #FF6B0044 !important;
        }
        .bento-card:hover .feature-icon-wrapper {
          transform: scale(1.1) rotate(2deg);
          border-color: #FF6B0033 !important;
        }
        .feature-icon-wrapper {
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .stat-item:hover {
          transform: translateY(-4px);
        }

        .footer-link {
          font-size: 14.5px;
          color: #475569;
          text-decoration: none;
          transition: color 0.25s ease;
        }
        .footer-link:hover {
          color: #fff;
        }
        
        .footer-link-btn {
          transition: color 0.25s ease;
        }
        .footer-link-btn:hover {
          color: #fff !important;
        }

        .bullet-check {
          transition: color 0.3s ease;
        }

        @keyframes scaleUp {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .animate-scale-up {
          animation: scaleUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        .header-logo {
          transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .header-logo:hover {
          transform: rotate(360deg) scale(1.08);
        }

        @media (max-width: 768px) {
          .desktop-only { display: none !important; }
          .simulator-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
          .landing-header { padding: 0 1.5rem !important; }
        }
      `}</style>
    </div>
  );
};

export default LandingPage;