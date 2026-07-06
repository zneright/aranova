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
        bg: isDark ? "#050608" : "#F4F2EE",
        cardBg: isDark ? "rgba(12, 14, 22, 0.75)" : "rgba(255, 255, 255, 0.85)",
        textPrim: isDark ? "#F8FAFC" : "#0F172A",
        textMuted: isDark ? "#94A3B8" : "#64748B",
        border: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(15, 23, 42, 0.1)",
        orbitColor: isDark ? "#10B981" : "#FF6B00",
        orbitSub: isDark ? "rgba(16, 185, 129, 0.25)" : "rgba(255, 107, 0, 0.2)",
        orbitTertiary: isDark ? "#38BDF8" : "#6366F1", // Added a tertiary accent color
        glow: isDark ? "rgba(16, 185, 129, 0.15)" : "rgba(255, 107, 0, 0.12)",
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
                transition: "background-color 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
        >
            {/* ─── PREMIUM INJECTED ANIMATION CSS ─── */}
            <style>{`
                @keyframes gyroOuter {
                    0% { transform: rotate(0deg) scale(1); }
                    50% { transform: rotate(180deg) scale(1.08); }
                    100% { transform: rotate(360deg) scale(1); }
                }
                @keyframes gyroInner {
                    0% { transform: rotate(360deg) scale(1); }
                    50% { transform: rotate(180deg) scale(0.92); }
                    100% { transform: rotate(0deg) scale(1); }
                }
                @keyframes pulseRing {
                    0% { transform: scale(0.8); opacity: 0; }
                    50% { opacity: 0.5; }
                    100% { transform: scale(1.4); opacity: 0; }
                }
                @keyframes floatLogo {
                    0%, 100% { transform: translateY(0px) scale(1); filter: drop-shadow(0 4px 8px rgba(0,0,0,0.2)); }
                    50% { transform: translateY(-8px) scale(1.02); filter: drop-shadow(0 12px 16px rgba(0,0,0,0.4)); }
                }
                @keyframes ambientGlow {
                    0%, 100% { opacity: 0.4; transform: translate(-50%, -50%) scale(1); }
                    50% { opacity: 0.8; transform: translate(-50%, -50%) scale(1.15); }
                }
                @keyframes shimmerText {
                    0% { background-position: -200% center; }
                    100% { background-position: 200% center; }
                }
                .anim-gyro-outer {
                    transform-origin: 50% 50%;
                    animation: gyroOuter 4s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite;
                }
                .anim-gyro-inner {
                    transform-origin: 50% 50%;
                    animation: gyroInner 3s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite;
                }
                .anim-pulse-ring {
                    transform-origin: 50% 50%;
                    animation: pulseRing 2.5s cubic-bezier(0.21, 0.53, 0.56, 0.8) infinite;
                }
                .anim-float {
                    animation: floatLogo 4s ease-in-out infinite;
                }
                .anim-ambient {
                    animation: ambientGlow 5s ease-in-out infinite;
                }
                .anim-shimmer {
                    background-size: 200% auto !important;
                    animation: shimmerText 3.5s linear infinite;
                }
            `}</style>

            {/* ─── DYNAMIC METALLIC GLOW BACKGROUND EFFECTS ─── */}
            <div style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: "40vw",
                height: "40vw",
                minWidth: 400,
                background: `radial-gradient(circle, ${theme.glow} 0%, transparent 60%)`,
                borderRadius: "50%",
                pointerEvents: "none",
                zIndex: 1,
            }} className="anim-ambient" />

            {/* ─── MAIN LOADING CARD ─── */}
            <div style={{
                position: "relative",
                zIndex: 2,
                background: theme.cardBg,
                backdropFilter: "blur(32px) saturate(150%)",
                WebkitBackdropFilter: "blur(32px) saturate(150%)",
                border: `1px solid ${theme.border}`,
                borderRadius: 40,
                padding: "56px 40px",
                width: "100%",
                maxWidth: 380,
                textAlign: "center",
                boxShadow: isDark
                    ? "0 32px 80px -16px rgba(0, 0, 0, 0.9), inset 0 2px 4px rgba(255,255,255,0.05)"
                    : "0 32px 80px -16px rgba(0, 0, 0, 0.12), inset 0 2px 4px rgba(255,255,255,0.4)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
            }}>

                {/* ─── 3D HOLOGRAPHIC ARTWORK ─── */}
                <div style={{ position: "relative", width: 140, height: 140, marginBottom: 36 }}>

                    {/* SVG Definitions for Glows & Gradients */}
                    <svg width="0" height="0" style={{ position: 'absolute' }}>
                        <defs>
                            <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
                                <feGaussianBlur stdDeviation="4" result="blur" />
                                <feComposite in="SourceGraphic" in2="blur" operator="over" />
                            </filter>
                            <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor={theme.orbitColor} />
                                <stop offset="100%" stopColor={theme.orbitTertiary} />
                            </linearGradient>
                        </defs>
                    </svg>

                    {/* Outer Gyro Ring */}
                    <svg width="140" height="140" viewBox="0 0 140 140" style={{ position: "absolute", top: 0, left: 0 }}>
                        <circle
                            className="anim-gyro-outer"
                            cx="70" cy="70" r="64"
                            fill="none"
                            stroke="url(#ringGrad)"
                            strokeWidth="1.5"
                            strokeDasharray="40 15 10 15"
                            strokeLinecap="round"
                            filter="url(#neonGlow)"
                            opacity="0.9"
                        />
                    </svg>

                    {/* Inner Reverse Gyro Ring */}
                    <svg width="140" height="140" viewBox="0 0 140 140" style={{ position: "absolute", top: 0, left: 0 }}>
                        <circle
                            className="anim-gyro-inner"
                            cx="70" cy="70" r="52"
                            fill="none"
                            stroke={theme.orbitSub}
                            strokeWidth="2"
                            strokeDasharray="80 30"
                            strokeLinecap="round"
                        />
                        {/* Orbiting nodes on inner ring */}
                        <g className="anim-gyro-inner">
                            <circle cx="70" cy="18" r="4" fill={theme.orbitColor} filter="url(#neonGlow)" />
                            <circle cx="122" cy="70" r="3" fill={theme.orbitTertiary} />
                        </g>
                    </svg>

                    {/* Expanding Radar Pulse */}
                    <svg width="140" height="140" viewBox="0 0 140 140" style={{ position: "absolute", top: 0, left: 0 }}>
                        <circle
                            className="anim-pulse-ring"
                            cx="70" cy="70" r="40"
                            fill="none"
                            stroke={theme.orbitColor}
                            strokeWidth="1"
                        />
                    </svg>

                    {/* Central Brand Capsule */}
                    <div
                        className="anim-float"
                        style={{
                            position: "absolute",
                            top: 25,
                            left: 25,
                            width: 90,
                            height: 90,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: "50%",
                            background: isDark ? "rgba(12, 14, 22, 0.4)" : "rgba(255,255,255,0.4)",
                            boxShadow: `inset 0 0 20px ${theme.glow}`,
                        }}
                    >
                        <img
                            src="/logo_svg.svg"
                            alt="Aranova Logo"
                            style={{ height: 80, width: 80, zIndex: 10 }}
                        />
                    </div>
                </div>

                {/* ─── TEXT METRICS ─── */}
                <h2
                    className="anim-shimmer"
                    style={{
                        fontSize: 24,
                        fontWeight: 900,
                        letterSpacing: "-0.5px",
                        margin: "0 0 12px 0",
                        background: isDark
                            ? "linear-gradient(to right, #94A3B8 0%, #FFFFFF 50%, #94A3B8 100%)"
                            : "linear-gradient(to right, #475569 0%, #0F172A 50%, #475569 100%)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                    }}
                >
                    ARANOVA
                </h2>

                <p
                    style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: theme.textMuted,
                        margin: "0 0 32px 0",
                        lineHeight: 1.6,
                        maxWidth: 260,
                    }}
                >
                    {message}
                </p>

                {/* ─── STATUS PILL ─── */}
                <div
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 10,
                        background: isDark ? "rgba(16,185,129,0.08)" : "rgba(16,185,129,0.05)",
                        border: `1px solid ${isDark ? "rgba(16,185,129,0.2)" : "rgba(16,185,129,0.15)"}`,
                        borderRadius: 99,
                        padding: "8px 16px",
                        boxShadow: `0 4px 12px ${theme.glow}`,
                    }}
                >
                    <span
                        className="anim-gyro-outer" /* Reused for a pulsing blink effect */
                        style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: theme.orbitColor,
                            display: "inline-block",
                            boxShadow: `0 0 10px ${theme.orbitColor}`,
                        }}
                    />
                    <span
                        style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: theme.orbitColor,
                            letterSpacing: "1px",
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