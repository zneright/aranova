import React from "react";
import { useTheme } from "../../contexts/ThemeContext";

interface LoadingWorkspaceProps {
    message?: string;
    dark?: boolean;
}

const LoadingWorkspace: React.FC<LoadingWorkspaceProps> = ({
    message = "Syncing your transit workspace with Horizon ledger...",
    dark: propDark
}) => {
    // Automatically read from global ThemeContext if prop is not specified
    const contextTheme = useTheme();
    const isDark = propDark !== undefined ? propDark : contextTheme.dark;

    // Premium styling config
    const theme = {
        bg: isDark ? "#0A0B10" : "#FAF8F5",
        cardBg: isDark ? "rgba(17, 19, 32, 0.65)" : "rgba(255, 255, 255, 0.75)",
        textPrim: isDark ? "#F8FAFC" : "#0F172A",
        textMuted: isDark ? "#94A3B8" : "#64748B",
        border: isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.08)",
        orbitColor: isDark ? "#10B981" : "#FF6B00",
        orbitSub: isDark ? "rgba(16,185,129,0.15)" : "rgba(255,107,0,0.1)",
        glow: isDark ? "rgba(16,185,129,0.25)" : "rgba(255,107,0,0.2)",
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
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Outfit', 'Inter', sans-serif",
                padding: 24,
                boxSizing: "border-box",
                position: "fixed",
                top: 0,
                left: 0,
                zIndex: 99999,
                transition: "background-color 0.3s ease",
            }}
        >
            {/* ─── PREMIUM INJECTED ANIMATION CSS ─── */}
            <style>{`
                @keyframes mainSpin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                @keyframes reverseSpin {
                    0% { transform: rotate(360deg); }
                    100% { transform: rotate(0deg); }
                }
                @keyframes floatLogo {
                    0%, 100% { transform: translateY(0) scale(1); }
                    50% { transform: translateY(-4px) scale(0.97); }
                }
                @keyframes pulseGlow {
                    0%, 100% { opacity: 0.35; transform: scale(1); }
                    50% { opacity: 0.65; transform: scale(1.05); }
                }
                @keyframes loaderTrackDash {
                    0% { stroke-dashoffset: 0; }
                    100% { stroke-dashoffset: -40; }
                }
                .animate-spin-main {
                    animation: mainSpin 3.5s linear infinite;
                }
                .animate-spin-reverse {
                    animation: reverseSpin 2.5s linear infinite;
                }
                .animate-float {
                    animation: floatLogo 3s ease-in-out infinite;
                }
                .animate-glow {
                    animation: pulseGlow 2.5s ease-in-out infinite;
                }
                .animate-dash {
                    stroke-dasharray: 8, 8;
                    animation: loaderTrackDash 1.2s linear infinite;
                }
            `}</style>

            {/* ─── DYNAMIC METALLIC GLOW BACKGROUND EFFECTS ─── */}
            <div style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: 320,
                height: 320,
                background: `radial-gradient(circle, ${theme.glow} 0%, transparent 70%)`,
                borderRadius: "50%",
                pointerEvents: "none",
                zIndex: 1,
            }} className="animate-glow" />

            {/* ─── MAIN LOADING CARD ─── */}
            <div style={{
                position: "relative",
                zIndex: 2,
                background: theme.cardBg,
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                border: `1px solid ${theme.border}`,
                borderRadius: 36,
                padding: "48px 36px",
                width: "100%",
                maxWidth: 360,
                textAlign: "center",
                boxShadow: isDark 
                    ? "0 24px 64px -12px rgba(0, 0, 0, 0.8), inset 0 1px 1px rgba(255,255,255,0.05)" 
                    : "0 24px 64px -12px rgba(0, 0, 0, 0.08)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
            }}>

                {/* ─── LOADING ARTWORK ─── */}
                <div style={{ position: "relative", width: 130, height: 130, marginBottom: 28 }}>
                    {/* Outer Dashed Orbit */}
                    <svg
                        className="animate-spin-main"
                        width="130"
                        height="130"
                        viewBox="0 0 130 130"
                        style={{ position: "absolute", top: 0, left: 0 }}
                    >
                        <circle
                            className="animate-dash"
                            cx="65"
                            cy="65"
                            r="58"
                            fill="none"
                            stroke={theme.orbitColor}
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            opacity="0.85"
                        />
                    </svg>

                    {/* Inner Solid Support Ring */}
                    <svg
                        className="animate-spin-reverse"
                        width="130"
                        height="130"
                        viewBox="0 0 130 130"
                        style={{ position: "absolute", top: 0, left: 0 }}
                    >
                        <circle
                            cx="65"
                            cy="65"
                            r="48"
                            fill="none"
                            stroke={theme.orbitSub}
                            strokeWidth="1"
                        />
                        <circle cx="65" cy="17" r="4.5" fill={theme.orbitColor} style={{ filter: `drop-shadow(0 0 4px ${theme.orbitColor})` }} />
                        <circle cx="17" cy="65" r="3.5" fill={isDark ? "#FFE600" : "#B59E00"} />
                    </svg>

                    {/* Central Brand Capsule */}
                    <div
                        className="animate-float"
                        style={{
                            position: "absolute",
                            top: 26,
                            left: 26,
                            width: 78,
                            height: 78,
                            borderRadius: 24,
                            background: isDark ? "#131522" : "#ffffff",
                            border: `1.5px solid ${theme.border}`,
                            boxShadow: isDark 
                                ? "0 10px 30px rgba(0,0,0,0.5), inset 0 1px 0.5px rgba(255,255,255,0.05)" 
                                : "0 10px 30px rgba(15,23,42,0.05)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <img
                            src="/logo_1.png"
                            alt="Aranova Logo"
                            style={{
                                height: 38,
                                width: "auto",
                                objectFit: "contain",
                                filter: isDark ? "brightness(0) invert(1)" : "none"
                            }}
                        />
                    </div>
                </div>

                {/* ─── TEXT METRICS ─── */}
                <h2
                    style={{
                        fontSize: 22,
                        fontWeight: 900,
                        letterSpacing: "-0.5px",
                        margin: "0 0 6px 0",
                        background: isDark 
                            ? "linear-gradient(135deg, #FFF 30%, #94A3B8 100%)" 
                            : "linear-gradient(135deg, #0F172A 30%, #475569 100%)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                    }}
                >
                    ARANOVA
                </h2>

                <p
                    style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: theme.textMuted,
                        margin: "0 0 24px 0",
                        lineHeight: 1.6,
                        maxWidth: 240,
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
                        background: isDark ? "rgba(16,185,129,0.08)" : "rgba(255,107,0,0.06)",
                        border: `1px solid ${isDark ? "rgba(16,185,129,0.18)" : "rgba(255,107,0,0.15)"}`,
                        borderRadius: 99,
                        padding: "6px 14px",
                    }}
                >
                    <span
                        style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: theme.orbitColor,
                            display: "inline-block",
                            boxShadow: `0 0 8px ${theme.orbitColor}`,
                        }}
                    />
                    <span
                        style={{
                            fontSize: 9,
                            fontWeight: 800,
                            color: theme.orbitColor,
                            letterSpacing: "0.8px",
                            textTransform: "uppercase",
                        }}
                    >
                        Horizon Sync Active
                    </span>
                </div>

            </div>
        </div>
    );
};

export default LoadingWorkspace;