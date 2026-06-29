import React from "react";

interface LoadingWorkspaceProps {
    message?: string;
    dark?: boolean;
}

const LoadingWorkspace: React.FC<LoadingWorkspaceProps> = ({
    message = "Syncing your transit workspace with Horizon ledger...",
    dark = false
}) => {
    // Theme styling configurations matching Aranova colors
    const theme = {
        bg: dark ? "#0F1117" : "#F8F9FA",
        textPrim: dark ? "#F1F5F9" : "#111827",
        textMuted: dark ? "#94A3B8" : "#6B7280",
        border: dark ? "#2A2D3A" : "#E5E7EB",
        badgeBg: dark ? "#1A2644" : "#EEF4FF",
        badgeText: dark ? "#7DB3FF" : "#1652C9",
    };

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                height: "100vh",
                width: "100vw",
                alignItems: "center",
                justifyContent: "center",
                background: theme.bg,
                color: theme.textPrim,
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                padding: 24,
                boxSizing: "border-box",
                position: "fixed",
                top: 0,
                left: 0,
                zIndex: 9999,
            }}
        >
            {/* ─── INJECTED ANIMATION CSS ─── */}
            <style>{`
        @keyframes orbitRotate {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulseLogo {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(0.93); opacity: 0.85; }
        }
        @keyframes trackDash {
          0% { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -20; }
        }
        .animate-orbit {
          animation: orbitRotate 2.8s linear infinite;
        }
        .animate-logo {
          animation: pulseLogo 2s ease-in-out infinite;
        }
        .animate-track {
          stroke-dasharray: 6, 4;
          animation: trackDash 0.8s linear infinite;
        }
      `}</style>

            {/* ─── LOADING ARTWORK ─── */}
            <div style={{ position: "relative", width: 140, height: 140, marginBottom: 32 }}>

                {/* Outer Ledger Ring Network */}
                <svg
                    className="animate-orbit"
                    width="140"
                    height="140"
                    viewBox="0 0 140 140"
                    style={{ position: "absolute", top: 0, left: 0 }}
                >
                    {/* Inner Node Ring Track */}
                    <circle
                        cx="70"
                        cy="70"
                        r="54"
                        fill="none"
                        stroke={dark ? "rgba(79, 142, 247, 0.15)" : "rgba(22, 82, 201, 0.1)"}
                        strokeWidth="1.5"
                    />

                    {/* Active Outer Routing Path */}
                    <circle
                        className="animate-track"
                        cx="70"
                        cy="70"
                        r="64"
                        fill="none"
                        stroke={dark ? "#4F8EF7" : "#1652C9"}
                        strokeWidth="2"
                        strokeLinecap="round"
                        opacity="0.75"
                    />

                    {/* Network Distributed Node Points */}
                    <circle cx="70" cy="6" r="5" fill="#F4D03F" /> {/* Gold Node */}
                    <circle cx="134" cy="70" r="4" fill={dark ? "#4ADE80" : "#15803D"} /> {/* Green Node */}
                    <circle cx="60" cy="133" r="3.5" fill={dark ? "#94A3B8" : "#6B7280"} /> {/* Muted Node */}
                </svg>

                {/* Center Application Brand Capsule */}
                <div
                    className="animate-logo"
                    style={{
                        position: "absolute",
                        top: 22,
                        left: 22,
                        width: 96,
                        height: 96,
                        borderRadius: 28,
                        background: dark ? "#13151F" : "#ffffff",
                        border: `1.5px solid ${theme.border}`,
                        boxShadow: dark ? "0 12px 36px rgba(0,0,0,0.4)" : "0 12px 36px rgba(0,0,0,0.06)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    <img
                        src="/logo_1.png"
                        alt="Aranova Logo"
                        style={{
                            height: 44,
                            width: "auto",
                            objectFit: "contain",
                            filter: dark ? "brightness(0) invert(1)" : "none"
                        }}
                    />
                </div>
            </div>

            {/* ─── TEXT METRICS ─── */}
            <h2
                style={{
                    fontSize: 20,
                    fontWeight: 900,
                    letterSpacing: "-0.5px",
                    margin: "0 0 8px 0",
                    textAlign: "center"
                }}
            >
                ARANOVA
            </h2>

            <p
                style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: theme.textMuted,
                    margin: "0 0 24px 0",
                    textAlign: "center",
                    maxWidth: 320,
                    lineHeight: 1.5
                }}
            >
                {message}
            </p>

            {/* ─── STATUS PILL ─── */}
            <div
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    background: theme.badgeBg,
                    border: `1px solid ${dark ? "rgba(79,142,247,.2)" : "rgba(22,82,201,.15)"}`,
                    borderRadius: 20,
                    padding: "6px 16px"
                }}
            >
                <span
                    style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: theme.badgeText,
                        display: "inline-block",
                        boxShadow: `0 0 8px ${theme.badgeText}`
                    }}
                />
                <span
                    style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: theme.badgeText,
                        letterSpacing: "0.6px",
                        textTransform: "uppercase"
                    }}
                >
                    Secure Node Handshake
                </span>
            </div>
        </div>
    );
};

export default LoadingWorkspace;