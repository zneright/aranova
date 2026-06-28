import React, { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
type AuthMode = "login" | "signup";
type ModalType = "terms" | "privacy" | null;

// ─── Shared styles ────────────────────────────────────────────────────────────
const S = {
  input: {
    width: "100%",
    padding: "11px 14px",
    border: "1.5px solid #E5E7EB",
    borderRadius: 12,
    fontSize: 14,
    color: "#111827",
    outline: "none",
    boxSizing: "border-box" as const,
    background: "#FAFAFA",
    fontFamily: "inherit",
  },
  label: {
    display: "block" as const,
    fontSize: 13,
    fontWeight: 600 as const,
    color: "#374151",
    marginBottom: 6,
  },
  primaryBtn: {
    width: "100%",
    background: "linear-gradient(135deg, #1652C9 0%, #1a3a8a 100%)",
    color: "#fff",
    border: "none",
    borderRadius: 50,
    padding: "14px",
    fontSize: 15,
    fontWeight: 700 as const,
    cursor: "pointer",
    letterSpacing: "0.3px",
    fontFamily: "inherit",
  },
  ghostBtn: {
    width: "100%",
    background: "#fff",
    border: "1.5px solid #E5E7EB",
    borderRadius: 50,
    padding: "12px",
    fontSize: 14,
    fontWeight: 600 as const,
    cursor: "pointer",
    color: "#374151",
    display: "flex" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    fontFamily: "inherit",
  },
};

// ─── Logo ─────────────────────────────────────────────────────────────────────
const Logo: React.FC = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
    <img
      src="/logo_1.png"
      alt="Mobilis Logo"
      style={{
        height: 38,
        width: "auto",
        objectFit: "contain",
        flexShrink: 0,
      }}
    />
    <span
      style={{
        fontSize: 20,
        fontWeight: 900,
        letterSpacing: "-0.5px",
        color: "#111827",
      }}
    >
      MOBILIS
    </span>
  </div>
);

// ─── Vehicle SVG illustrations (inline so no image files needed) ──────────────
const TricycleSVG: React.FC<{ size?: number }> = ({ size = 120 }) => (
  <svg
    width={size}
    height={size * 0.8}
    viewBox="0 0 160 120"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Body sidecar */}
    <rect x="10" y="40" width="72" height="45" rx="8" fill="#E63946" />
    <rect x="12" y="42" width="68" height="20" rx="4" fill="#F4D03F" />
    {/* Roof decorations */}
    <rect x="10" y="32" width="72" height="12" rx="4" fill="#1652C9" />
    <rect x="20" y="34" width="10" height="6" rx="2" fill="#F4D03F" />
    <rect x="34" y="34" width="10" height="6" rx="2" fill="#F4D03F" />
    <rect x="48" y="34" width="10" height="6" rx="2" fill="#F4D03F" />
    {/* Star emblem */}
    <polygon
      points="46,56 48,62 54,62 49,66 51,72 46,68 41,72 43,66 38,62 44,62"
      fill="#F4D03F"
    />
    {/* Motorcycle part */}
    <rect x="82" y="50" width="50" height="28" rx="6" fill="#1652C9" />
    <rect x="84" y="52" width="46" height="14" rx="3" fill="#2563EB" />
    {/* Handlebar */}
    <rect x="128" y="44" width="6" height="18" rx="3" fill="#374151" />
    {/* Connector bar */}
    <rect x="78" y="58" width="10" height="4" rx="2" fill="#6B7280" />
    {/* Wheels */}
    <circle cx="30" cy="92" r="16" fill="#1F2937" />
    <circle cx="30" cy="92" r="10" fill="#374151" />
    <circle cx="30" cy="92" r="4" fill="#9CA3AF" />
    <circle cx="118" cy="92" r="16" fill="#1F2937" />
    <circle cx="118" cy="92" r="10" fill="#374151" />
    <circle cx="118" cy="92" r="4" fill="#9CA3AF" />
    {/* Wheel spokes */}
    {[0, 60, 120, 180, 240, 300].map((deg, i) => (
      <line
        key={i}
        x1={30 + 4 * Math.cos((deg * Math.PI) / 180)}
        y1={92 + 4 * Math.sin((deg * Math.PI) / 180)}
        x2={30 + 10 * Math.cos((deg * Math.PI) / 180)}
        y2={92 + 10 * Math.sin((deg * Math.PI) / 180)}
        stroke="#6B7280"
        strokeWidth="1.5"
      />
    ))}
    {[0, 60, 120, 180, 240, 300].map((deg, i) => (
      <line
        key={i}
        x1={118 + 4 * Math.cos((deg * Math.PI) / 180)}
        y1={92 + 4 * Math.sin((deg * Math.PI) / 180)}
        x2={118 + 10 * Math.cos((deg * Math.PI) / 180)}
        y2={92 + 10 * Math.sin((deg * Math.PI) / 180)}
        stroke="#6B7280"
        strokeWidth="1.5"
      />
    ))}
  </svg>
);

const JeepneySVG: React.FC<{ size?: number }> = ({ size = 140 }) => (
  <svg
    width={size}
    height={size * 0.75}
    viewBox="0 0 200 140"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Main body */}
    <rect x="10" y="45" width="180" height="60" rx="8" fill="#E63946" />
    {/* Roof / top */}
    <rect x="18" y="28" width="164" height="22" rx="6" fill="#1652C9" />
    {/* Roof rack decorations */}
    <rect x="30" y="22" width="140" height="8" rx="3" fill="#F4D03F" />
    <rect x="40" y="18" width="12" height="8" rx="2" fill="#E63946" />
    <rect x="60" y="18" width="12" height="8" rx="2" fill="#E63946" />
    <rect x="80" y="18" width="12" height="8" rx="2" fill="#E63946" />
    <rect x="100" y="18" width="12" height="8" rx="2" fill="#E63946" />
    <rect x="120" y="18" width="12" height="8" rx="2" fill="#E63946" />
    {/* Front grille */}
    <rect x="10" y="60" width="24" height="30" rx="4" fill="#1F2937" />
    <rect x="14" y="64" width="16" height="8" rx="2" fill="#F4D03F" />
    <circle cx="18" cy="80" r="4" fill="#F4D03F" />
    {/* Windows */}
    <rect x="40" y="50" width="28" height="22" rx="4" fill="#BFDBFE" />
    <rect x="74" y="50" width="28" height="22" rx="4" fill="#BFDBFE" />
    <rect x="108" y="50" width="28" height="22" rx="4" fill="#BFDBFE" />
    <rect x="142" y="50" width="28" height="22" rx="4" fill="#BFDBFE" />
    {/* Side stripe */}
    <rect x="10" y="80" width="180" height="6" fill="#F4D03F" />
    {/* Rear fin */}
    <rect x="176" y="40" width="14" height="30" rx="4" fill="#1652C9" />
    {/* Wheels */}
    <circle cx="52" cy="112" r="18" fill="#1F2937" />
    <circle cx="52" cy="112" r="11" fill="#374151" />
    <circle cx="52" cy="112" r="5" fill="#9CA3AF" />
    <circle cx="148" cy="112" r="18" fill="#1F2937" />
    <circle cx="148" cy="112" r="11" fill="#374151" />
    <circle cx="148" cy="112" r="5" fill="#9CA3AF" />
    {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => (
      <line
        key={i}
        x1={52 + 5 * Math.cos((deg * Math.PI) / 180)}
        y1={112 + 5 * Math.sin((deg * Math.PI) / 180)}
        x2={52 + 11 * Math.cos((deg * Math.PI) / 180)}
        y2={112 + 11 * Math.sin((deg * Math.PI) / 180)}
        stroke="#6B7280"
        strokeWidth="1.5"
      />
    ))}
    {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => (
      <line
        key={i}
        x1={148 + 5 * Math.cos((deg * Math.PI) / 180)}
        y1={112 + 5 * Math.sin((deg * Math.PI) / 180)}
        x2={148 + 11 * Math.cos((deg * Math.PI) / 180)}
        y2={112 + 11 * Math.sin((deg * Math.PI) / 180)}
        stroke="#6B7280"
        strokeWidth="1.5"
      />
    ))}
    {/* JEEPNEY text */}
    <rect x="38" y="76" width="48" height="10" rx="2" fill="#1F2937" />
    <text
      x="62"
      y="84"
      textAnchor="middle"
      fontSize="6"
      fill="#F4D03F"
      fontWeight="bold"
    >
      JEEPNEY
    </text>
  </svg>
);

const TaxiSVG: React.FC<{ size?: number }> = ({ size = 130 }) => (
  <svg
    width={size}
    height={size * 0.7}
    viewBox="0 0 200 130"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Body */}
    <rect x="14" y="55" width="172" height="50" rx="8" fill="#F59E0B" />
    {/* Cabin */}
    <path d="M50 55 L60 30 L140 30 L155 55 Z" fill="#FBBF24" />
    {/* Windows */}
    <path d="M66 53 L73 36 L100 36 L100 53 Z" fill="#BFDBFE" opacity="0.9" />
    <path d="M102 53 L102 36 L130 36 L136 53 Z" fill="#BFDBFE" opacity="0.9" />
    {/* Taxi sign */}
    <rect x="82" y="20" width="36" height="13" rx="4" fill="#1F2937" />
    <text
      x="100"
      y="30"
      textAnchor="middle"
      fontSize="8"
      fill="#F4D03F"
      fontWeight="bold"
    >
      TAXI
    </text>
    {/* Stripe */}
    <rect x="14" y="74" width="172" height="8" fill="#1652C9" />
    {/* Grille */}
    <rect x="14" y="60" width="20" height="24" rx="3" fill="#1F2937" />
    {/* Headlights */}
    <rect x="16" y="62" width="14" height="8" rx="2" fill="#FEF08A" />
    <rect x="170" y="62" width="16" height="8" rx="2" fill="#FCA5A5" />
    {/* Door handle */}
    <rect x="90" y="70" width="20" height="4" rx="2" fill="#D97706" />
    {/* Wheels */}
    <circle cx="52" cy="108" r="18" fill="#1F2937" />
    <circle cx="52" cy="108" r="11" fill="#374151" />
    <circle cx="52" cy="108" r="5" fill="#9CA3AF" />
    <circle cx="148" cy="108" r="18" fill="#1F2937" />
    <circle cx="148" cy="108" r="11" fill="#374151" />
    <circle cx="148" cy="108" r="5" fill="#9CA3AF" />
    {[0, 60, 120, 180, 240, 300].map((deg, i) => (
      <line
        key={i}
        x1={52 + 5 * Math.cos((deg * Math.PI) / 180)}
        y1={108 + 5 * Math.sin((deg * Math.PI) / 180)}
        x2={52 + 11 * Math.cos((deg * Math.PI) / 180)}
        y2={108 + 11 * Math.sin((deg * Math.PI) / 180)}
        stroke="#6B7280"
        strokeWidth="1.5"
      />
    ))}
    {[0, 60, 120, 180, 240, 300].map((deg, i) => (
      <line
        key={i}
        x1={148 + 5 * Math.cos((deg * Math.PI) / 180)}
        y1={108 + 5 * Math.sin((deg * Math.PI) / 180)}
        x2={148 + 11 * Math.cos((deg * Math.PI) / 180)}
        y2={108 + 11 * Math.sin((deg * Math.PI) / 180)}
        stroke="#6B7280"
        strokeWidth="1.5"
      />
    ))}
  </svg>
);

// ─── Legal Modal ──────────────────────────────────────────────────────────────
const LegalModal: React.FC<{ type: ModalType; onClose: () => void }> = ({
  type,
  onClose,
}) => {
  if (!type) return null;
  const isTerms = type === "terms";

  const termsContent = [
    {
      title: "1. Acceptance of Terms",
      body: "By creating a Mobilis account, you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree, you may not use the platform.",
    },
    {
      title: "2. Eligibility",
      body: "You must be at least 18 years old to use Mobilis. By registering, you confirm that you are of legal age and that all information you provide is accurate and complete.",
    },
    {
      title: "3. Collateralized Personal Vault",
      body: "Funds locked in your Personal Vault are subject to a time-lock of 7 or 30 days as selected. During the lock period, funds may be automatically liquidated to settle outstanding debts to Cooperative partners per the smart contract terms encoded on Stellar.",
    },
    {
      title: "4. Offline Payments",
      body: "The Scan-and-Beam protocol uses Bluetooth Low Energy (BLE) to transmit signed cryptograms. You are responsible for ensuring your device's Bluetooth is enabled during transit. Mobilis is not liable for failed payments due to device incompatibility or disabled hardware.",
    },
    {
      title: "5. Credit Score",
      body: "Your Universal On-Chain Score is computed by Soroban smart contracts based on vault balance, lock duration, and repayment history. Scores are not a guarantee of loan approval and are subject to Cooperative admin discretion.",
    },
    {
      title: "6. Prohibited Conduct",
      body: "You may not use Mobilis to launder funds, circumvent sanctions, or provide false information. Violations result in immediate account suspension and reporting to applicable regulatory bodies.",
    },
    {
      title: "7. Fees",
      body: "Mobilis charges a 0.2% admin fee and a 0.1% Cooperative Contingency Vault contribution on settled loans. These fees are deducted automatically via smart contract and are non-refundable.",
    },
    {
      title: "8. Limitation of Liability",
      body: "Mobilis is not liable for losses arising from blockchain network outages, smart contract exploits outside our control, or incorrect information provided during registration.",
    },
    {
      title: "9. Changes to Terms",
      body: "We reserve the right to modify these Terms at any time. Continued use after changes constitutes acceptance. Major changes will be notified via in-app notification.",
    },
    {
      title: "10. Governing Law",
      body: "These Terms are governed by the laws of the Republic of the Philippines, without regard to conflict of law provisions.",
    },
  ];

  const privacyContent = [
    {
      title: "1. Information We Collect",
      body: "We collect your name, email address, device identifier, Stellar wallet public key, transaction history, vault activity, and Bluetooth interaction logs necessary for the Scan-and-Beam protocol.",
    },
    {
      title: "2. How We Use Your Data",
      body: "Your data is used to operate the platform, compute your Universal On-Chain Score, process offline payments, comply with AML/KYC regulations, and improve our services. We do not sell your personal data.",
    },
    {
      title: "3. Key Encryption",
      body: "Your Stellar private key is encrypted using AES-256 and stored in Google Cloud Secret Manager. When you authenticate via PIN, the key is temporarily cached to your device's hardware secure enclave (iOS Secure Enclave / Android Keystore) and is never transmitted in plaintext.",
    },
    {
      title: "4. On-Chain Data",
      body: "Transactions recorded on the Stellar blockchain are public and permanent. Your wallet address, transaction amounts, and vault activity are visible on-chain. Mobilis cannot delete this data once recorded.",
    },
    {
      title: "5. Data Sharing",
      body: "We share data with Stellar network validators (for transaction processing), Firebase (for encrypted key caching), Cooperative partners (for loan administration), and regulators as required by law.",
    },
    {
      title: "6. Retention",
      body: "Account data is retained for the duration of your account plus 7 years for regulatory compliance. On-chain data is permanent and cannot be removed.",
    },
    {
      title: "7. Your Rights",
      body: "You may request access to, correction of, or deletion of your off-chain personal data at any time by contacting privacy@mobilis.finance. Note that on-chain data cannot be altered.",
    },
    {
      title: "8. Security",
      body: "We employ AES-256 encryption, hardware-backed key storage, and regular security audits. Despite these measures, no system is completely secure. You are responsible for keeping your PIN and recovery phrase confidential.",
    },
    {
      title: "9. Cookies",
      body: "We use essential cookies for authentication and session management only. We do not use tracking or advertising cookies.",
    },
    {
      title: "10. Contact",
      body: "For privacy concerns, contact our Data Protection Officer at dpo@mobilis.finance or write to: Mobilis Technology Inc., Makati City, Metro Manila, Philippines.",
    },
  ];

  const content = isTerms ? termsContent : privacyContent;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,15,30,0.7)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 300,
        padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 24,
          width: "100%",
          maxWidth: 640,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 32px 80px rgba(0,0,0,0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "1.5rem 2rem",
            borderBottom: "1px solid #F3F4F6",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#1652C9",
                letterSpacing: "2px",
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              Mobilis Legal
            </div>
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 800,
                color: "#111827",
              }}
            >
              {isTerms ? "Terms of Service" : "Privacy Policy"}
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#9CA3AF" }}>
              Last updated: January 1, 2025
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "#F1EFE8",
              border: "none",
              borderRadius: "50%",
              width: 36,
              height: 36,
              cursor: "pointer",
              fontSize: 18,
              color: "#5F5E5A",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: "auto", padding: "1.5rem 2rem", flex: 1 }}>
          {content.map((section) => (
            <div key={section.title} style={{ marginBottom: "1.5rem" }}>
              <h3
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#111827",
                  margin: "0 0 6px",
                }}
              >
                {section.title}
              </h3>
              <p
                style={{
                  fontSize: 14,
                  lineHeight: 1.7,
                  color: "#4B5563",
                  margin: 0,
                }}
              >
                {section.body}
              </p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "1rem 2rem",
            borderTop: "1px solid #F3F4F6",
            flexShrink: 0,
          }}
        >
          <button
            onClick={onClose}
            style={{
              ...S.primaryBtn,
              width: "auto",
              padding: "10px 28px",
            }}
          >
            I understand
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Auth Form ────────────────────────────────────────────────────────────────
const AuthPage: React.FC = () => {
  const [mode, setMode] = useState<AuthMode>("login");
  const [legal, setLegal] = useState<ModalType>(null);
  const [agreed, setAgreed] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const isLogin = mode === "login";

  const validate = () => {
    const e: Record<string, string> = {};
    if (!isLogin && !form.name.trim()) e.name = "Name is required.";
    if (!form.email.includes("@")) e.email = "Enter a valid email address.";
    if (form.password.length < 8)
      e.password = "Password must be at least 8 characters.";
    if (!isLogin && form.password !== form.confirm)
      e.confirm = "Passwords do not match.";
    if (!isLogin && !agreed)
      e.terms = "You must accept the Terms and Privacy Policy.";
    return e;
  };

  const handleSubmit = () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setLoading(true);

    // Simulate API call and check dummy accounts
    setTimeout(() => {
      setLoading(false);

      if (isLogin) {
        if (
          form.email === "admin@mobilis.com" &&
          form.password === "password123"
        ) {
          window.location.href = "/admin";
          return;
        } else if (
          form.email === "user@mobilis.com" &&
          form.password === "password123"
        ) {
          window.location.href = "/user";
          return;
        } else {
          setErrors({
            email:
              "Try admin@mobilis.com or user@mobilis.com (pw: password123)",
          });
          return;
        }
      }

      // If they are signing up, just push them to the user dashboard for the demo
      window.location.href = "/user";
    }, 1500);
  };
  const switchMode = (m: AuthMode) => {
    setMode(m);
    setErrors({});
    setForm({ name: "", email: "", password: "", confirm: "" });
    setAgreed(false);
  };

  return (
    <div
      style={{
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        background: "#F8F7F4",
      }}
    >
      <LegalModal type={legal} onClose={() => setLegal(null)} />

      {/* ── LEFT PANEL — Illustration ── */}
      <div
        style={{
          background:
            "linear-gradient(145deg, #0D2A6E 0%, #1652C9 50%, #0f1f54 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "3rem 2rem",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Background glow */}
        <div
          style={{
            position: "absolute",
            top: "10%",
            left: "10%",
            width: 300,
            height: 300,
            background:
              "radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "10%",
            right: "10%",
            width: 200,
            height: 200,
            background:
              "radial-gradient(circle, rgba(192,57,43,0.15) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        {/* Logo */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            marginBottom: "3rem",
          }}
        >
          {/* Your Custom Image */}
          <img
            src="/logo_svg.svg"
            alt="Mobilis Logo"
            style={{
              height: 100,
              width: "auto",
              objectFit: "contain",
            }}
          />
        </div>
        {/* Headline */}
        <div style={{ textAlign: "center", marginBottom: "2.5rem", zIndex: 1 }}>
          <h2
            style={{
              color: "#fff",
              fontSize: 28,
              fontWeight: 900,
              letterSpacing: "-1px",
              margin: "0 0 12px",
              lineHeight: 1.2,
            }}
          >
            Finance that works
            <br />
            <span style={{ color: "#FCD34D" }}>even without signal</span>
          </h2>
          <p
            style={{
              color: "rgba(255,255,255,0.65)",
              fontSize: 15,
              lineHeight: 1.7,
              maxWidth: 320,
            }}
          >
            Offline-first payments, credit building, and zero-default loans for
            Southeast Asia's transit workers.
          </p>
        </div>

        {/* Vehicle illustrations */}
        <div
          style={{
            display: "flex",
            gap: "1.5rem",
            alignItems: "flex-end",
            justifyContent: "center",
            zIndex: 1,
            flexWrap: "wrap",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <TricycleSVG size={100} />
            <p
              style={{
                color: "rgba(255,255,255,0.5)",
                fontSize: 11,
                marginTop: 6,
                letterSpacing: "1px",
                textTransform: "uppercase",
              }}
            >
              Tricycle
            </p>
          </div>
          <div style={{ textAlign: "center" }}>
            <JeepneySVG size={130} />
            <p
              style={{
                color: "rgba(255,255,255,0.5)",
                fontSize: 11,
                marginTop: 6,
                letterSpacing: "1px",
                textTransform: "uppercase",
              }}
            >
              Jeepney
            </p>
          </div>
          <div style={{ textAlign: "center" }}>
            <TaxiSVG size={100} />
            <p
              style={{
                color: "rgba(255,255,255,0.5)",
                fontSize: 11,
                marginTop: 6,
                letterSpacing: "1px",
                textTransform: "uppercase",
              }}
            >
              Taxi
            </p>
          </div>
        </div>

        {/* Trust badges */}
        <div
          style={{
            display: "flex",
            gap: 10,
            marginTop: "2.5rem",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {[
            { icon: "⛓️", label: "Stellar Blockchain" },
            { icon: "🔒", label: "AES-256 Encrypted" },
            { icon: "📡", label: "Works Offline" },
          ].map((b) => (
            <div
              key={b.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 50,
                padding: "5px 12px",
              }}
            >
              <span style={{ fontSize: 13 }}>{b.icon}</span>
              <span
                style={{
                  color: "rgba(255,255,255,0.7)",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {b.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT PANEL — Form ── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "3rem 3rem",
          overflowY: "auto",
        }}
      >
        <div style={{ maxWidth: 420, width: "100%", margin: "0 auto" }}>
          {/* Mode tabs */}
          <div
            style={{
              display: "flex",
              background: "#F3F4F6",
              borderRadius: 50,
              padding: 4,
              marginBottom: "2rem",
            }}
          >
            {(["login", "signup"] as AuthMode[]).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                style={{
                  flex: 1,
                  padding: "10px",
                  border: "none",
                  borderRadius: 50,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                  background: mode === m ? "#fff" : "transparent",
                  color: mode === m ? "#111827" : "#6B7280",
                  boxShadow: mode === m ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
                  transition: "all 0.2s",
                  fontFamily: "inherit",
                }}
              >
                {m === "login" ? "Log in" : "Sign up"}
              </button>
            ))}
          </div>

          <h1
            style={{
              fontSize: 24,
              fontWeight: 900,
              color: "#111827",
              margin: "0 0 6px",
              letterSpacing: "-0.5px",
            }}
          >
            {isLogin ? "Welcome back" : "Create your account"}
          </h1>
          <p style={{ fontSize: 14, color: "#6B7280", margin: "0 0 1.75rem" }}>
            {isLogin
              ? "Sign in to access your vault and offline payments."
              : "Join drivers and commuters building credit on Stellar."}
          </p>

          {/* Name (signup only) */}
          {!isLogin && (
            <div style={{ marginBottom: "1rem" }}>
              <label style={S.label}>Full name</label>
              <input
                style={{
                  ...S.input,
                  borderColor: errors.name ? "#EF4444" : "#E5E7EB",
                }}
                placeholder="Maria Santos"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              {errors.name && (
                <p
                  style={{ color: "#EF4444", fontSize: 12, margin: "4px 0 0" }}
                >
                  {errors.name}
                </p>
              )}
            </div>
          )}

          {/* Email */}
          <div style={{ marginBottom: "1rem" }}>
            <label style={S.label}>Email address</label>
            <input
              style={{
                ...S.input,
                borderColor: errors.email ? "#EF4444" : "#E5E7EB",
              }}
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            {errors.email && (
              <p style={{ color: "#EF4444", fontSize: 12, margin: "4px 0 0" }}>
                {errors.email}
              </p>
            )}
          </div>

          {/* Password */}
          <div style={{ marginBottom: "1rem" }}>
            <label
              style={{
                ...S.label,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>Password</span>
              {isLogin && (
                <span
                  style={{
                    color: "#1652C9",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Forgot password?
                </span>
              )}
            </label>
            <input
              style={{
                ...S.input,
                borderColor: errors.password ? "#EF4444" : "#E5E7EB",
              }}
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            {errors.password && (
              <p style={{ color: "#EF4444", fontSize: 12, margin: "4px 0 0" }}>
                {errors.password}
              </p>
            )}
          </div>

          {/* Confirm (signup only) */}
          {!isLogin && (
            <div style={{ marginBottom: "1rem" }}>
              <label style={S.label}>Confirm password</label>
              <input
                style={{
                  ...S.input,
                  borderColor: errors.confirm ? "#EF4444" : "#E5E7EB",
                }}
                type="password"
                placeholder="••••••••"
                value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
              />
              {errors.confirm && (
                <p
                  style={{ color: "#EF4444", fontSize: 12, margin: "4px 0 0" }}
                >
                  {errors.confirm}
                </p>
              )}
            </div>
          )}

          {/* Terms checkbox (signup) */}
          {!isLogin && (
            <div style={{ marginBottom: "1.25rem" }}>
              <label
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  fontSize: 13,
                  color: "#4B5563",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  style={{ marginTop: 2, accentColor: "#1652C9" }}
                />
                <span>
                  I agree to Mobilis'{" "}
                  <span
                    style={{
                      color: "#1652C9",
                      fontWeight: 600,
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      setLegal("terms");
                    }}
                  >
                    Terms of Service
                  </span>{" "}
                  and{" "}
                  <span
                    style={{
                      color: "#1652C9",
                      fontWeight: 600,
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      setLegal("privacy");
                    }}
                  >
                    Privacy Policy
                  </span>
                </span>
              </label>
              {errors.terms && (
                <p
                  style={{ color: "#EF4444", fontSize: 12, margin: "4px 0 0" }}
                >
                  {errors.terms}
                </p>
              )}
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              ...S.primaryBtn,
              marginBottom: "1rem",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Please wait…" : isLogin ? "Sign in" : "Create account"}
          </button>

          {/* Divider */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: "1rem",
            }}
          >
            <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
            <span style={{ fontSize: 12, color: "#9CA3AF" }}>or</span>
            <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
          </div>

          {/* Wallet connect */}
          <button style={{ ...S.ghostBtn, marginBottom: "1.5rem" }}>
            <span style={{ fontSize: 18 }}>🔗</span>
            Connect Stellar Wallet
          </button>

          {/* Switch mode */}
          <p
            style={{
              textAlign: "center",
              fontSize: 14,
              color: "#6B7280",
              margin: 0,
            }}
          >
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <span
              style={{ color: "#1652C9", fontWeight: 700, cursor: "pointer" }}
              onClick={() => switchMode(isLogin ? "signup" : "login")}
            >
              {isLogin ? "Sign up free" : "Log in"}
            </span>
          </p>

          {/* Legal links at bottom */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "1.5rem",
              marginTop: "2rem",
              paddingTop: "1.5rem",
              borderTop: "1px solid #F3F4F6",
            }}
          >
            <span
              style={{ fontSize: 12, color: "#9CA3AF", cursor: "pointer" }}
              onClick={() => setLegal("terms")}
            >
              Terms of Service
            </span>
            <span
              style={{ fontSize: 12, color: "#9CA3AF", cursor: "pointer" }}
              onClick={() => setLegal("privacy")}
            >
              Privacy Policy
            </span>
          </div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        @media (max-width: 768px) {
          div[style*="gridTemplateColumns: 1fr 1fr"] {
            grid-template-columns: 1fr !important;
          }
          div[style*="gridTemplateColumns: 1fr 1fr"] > div:first-child {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
};

export default AuthPage;
