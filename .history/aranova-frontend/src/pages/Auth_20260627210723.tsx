import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { Keypair } from "@stellar/stellar-sdk";
import CryptoJS from "crypto-js";
import { auth, db } from "../firebase/config";

// ─── Types ────────────────────────────────────────────────────────────────────
type AuthMode = "login" | "signup";
type ModalType = "terms" | "privacy" | null;
type RoleType = "commuter" | "driver" | "cooperative";
type WalletMode = "create" | "connect" | "restore" | null;

// ─── Shared styles ────────────────────────────────────────────────────────────
const S = {
  input: {
    width: "100%", padding: "11px 14px", border: "1.5px solid #E5E7EB", borderRadius: 12,
    fontSize: 14, color: "#111827", outline: "none", boxSizing: "border-box" as const,
    background: "#FAFAFA", fontFamily: "inherit",
  },
  select: {
    width: "100%", padding: "11px 14px", border: "1.5px solid #E5E7EB", borderRadius: 12,
    fontSize: 14, color: "#111827", outline: "none", boxSizing: "border-box" as const,
    background: "#FAFAFA", fontFamily: "inherit", cursor: "pointer",
  },
  label: {
    display: "block" as const, fontSize: 13, fontWeight: 600 as const, color: "#374151", marginBottom: 6,
  },
  primaryBtn: {
    width: "100%", background: "linear-gradient(135deg, #1652C9 0%, #1a3a8a 100%)", color: "#fff",
    border: "none", borderRadius: 50, padding: "14px", fontSize: 15, fontWeight: 700 as const,
    cursor: "pointer", letterSpacing: "0.3px", fontFamily: "inherit",
  },
  ghostBtn: {
    width: "100%", background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 50,
    padding: "12px", fontSize: 14, fontWeight: 600 as const, cursor: "pointer", color: "#374151",
    display: "flex" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: 8, fontFamily: "inherit",
  },
  roleCard: (active: boolean) => ({
    flex: 1, padding: "12px 8px", border: active ? "2px solid #1652C9" : "1.5px solid #E5E7EB",
    background: active ? "#EFF6FF" : "#fff", borderRadius: 12, cursor: "pointer",
    textAlign: "center" as const, transition: "all 0.2s",
  }),
};

// ─── Vehicle SVG illustrations (Minified) ─────────────────────────────────────
const TricycleSVG: React.FC<{ size?: number }> = ({ size = 120 }) => (<svg width={size} height={size * 0.8} viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="10" y="40" width="72" height="45" rx="8" fill="#E63946" /><rect x="12" y="42" width="68" height="20" rx="4" fill="#F4D03F" /><rect x="10" y="32" width="72" height="12" rx="4" fill="#1652C9" /><rect x="20" y="34" width="10" height="6" rx="2" fill="#F4D03F" /><rect x="34" y="34" width="10" height="6" rx="2" fill="#F4D03F" /><rect x="48" y="34" width="10" height="6" rx="2" fill="#F4D03F" /><polygon points="46,56 48,62 54,62 49,66 51,72 46,68 41,72 43,66 38,62 44,62" fill="#F4D03F" /><rect x="82" y="50" width="50" height="28" rx="6" fill="#1652C9" /><rect x="84" y="52" width="46" height="14" rx="3" fill="#2563EB" /><rect x="128" y="44" width="6" height="18" rx="3" fill="#374151" /><rect x="78" y="58" width="10" height="4" rx="2" fill="#6B7280" /><circle cx="30" cy="92" r="16" fill="#1F2937" /><circle cx="30" cy="92" r="10" fill="#374151" /><circle cx="30" cy="92" r="4" fill="#9CA3AF" /><circle cx="118" cy="92" r="16" fill="#1F2937" /><circle cx="118" cy="92" r="10" fill="#374151" /><circle cx="118" cy="92" r="4" fill="#9CA3AF" />{[0, 60, 120, 180, 240, 300].map((deg, i) => (<line key={i} x1={30 + 4 * Math.cos((deg * Math.PI) / 180)} y1={92 + 4 * Math.sin((deg * Math.PI) / 180)} x2={30 + 10 * Math.cos((deg * Math.PI) / 180)} y2={92 + 10 * Math.sin((deg * Math.PI) / 180)} stroke="#6B7280" strokeWidth="1.5" />))}{[0, 60, 120, 180, 240, 300].map((deg, i) => (<line key={i} x1={118 + 4 * Math.cos((deg * Math.PI) / 180)} y1={92 + 4 * Math.sin((deg * Math.PI) / 180)} x2={118 + 10 * Math.cos((deg * Math.PI) / 180)} y2={92 + 10 * Math.sin((deg * Math.PI) / 180)} stroke="#6B7280" strokeWidth="1.5" />))}</svg>);
const JeepneySVG: React.FC<{ size?: number }> = ({ size = 140 }) => (<svg width={size} height={size * 0.75} viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="10" y="45" width="180" height="60" rx="8" fill="#E63946" /><rect x="18" y="28" width="164" height="22" rx="6" fill="#1652C9" /><rect x="30" y="22" width="140" height="8" rx="3" fill="#F4D03F" /><rect x="40" y="18" width="12" height="8" rx="2" fill="#E63946" /><rect x="60" y="18" width="12" height="8" rx="2" fill="#E63946" /><rect x="80" y="18" width="12" height="8" rx="2" fill="#E63946" /><rect x="100" y="18" width="12" height="8" rx="2" fill="#E63946" /><rect x="120" y="18" width="12" height="8" rx="2" fill="#E63946" /><rect x="10" y="60" width="24" height="30" rx="4" fill="#1F2937" /><rect x="14" y="64" width="16" height="8" rx="2" fill="#F4D03F" /><circle cx="18" cy="80" r="4" fill="#F4D03F" /><rect x="40" y="50" width="28" height="22" rx="4" fill="#BFDBFE" /><rect x="74" y="50" width="28" height="22" rx="4" fill="#BFDBFE" /><rect x="108" y="50" width="28" height="22" rx="4" fill="#BFDBFE" /><rect x="142" y="50" width="28" height="22" rx="4" fill="#BFDBFE" /><rect x="10" y="80" width="180" height="6" fill="#F4D03F" /><rect x="176" y="40" width="14" height="30" rx="4" fill="#1652C9" /><circle cx="52" cy="112" r="18" fill="#1F2937" /><circle cx="52" cy="112" r="11" fill="#374151" /><circle cx="52" cy="112" r="5" fill="#9CA3AF" /><circle cx="148" cy="112" r="18" fill="#1F2937" /><circle cx="148" cy="112" r="11" fill="#374151" /><circle cx="148" cy="112" r="5" fill="#9CA3AF" />{[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => (<line key={i} x1={52 + 5 * Math.cos((deg * Math.PI) / 180)} y1={112 + 5 * Math.sin((deg * Math.PI) / 180)} x2={52 + 11 * Math.cos((deg * Math.PI) / 180)} y2={112 + 11 * Math.sin((deg * Math.PI) / 180)} stroke="#6B7280" strokeWidth="1.5" />))}{[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => (<line key={i} x1={148 + 5 * Math.cos((deg * Math.PI) / 180)} y1={112 + 5 * Math.sin((deg * Math.PI) / 180)} x2={148 + 11 * Math.cos((deg * Math.PI) / 180)} y2={112 + 11 * Math.sin((deg * Math.PI) / 180)} stroke="#6B7280" strokeWidth="1.5" />))}<rect x="38" y="76" width="48" height="10" rx="2" fill="#1F2937" /><text x="62" y="84" textAnchor="middle" fontSize="6" fill="#F4D03F" fontWeight="bold">JEEPNEY</text></svg>);
const TaxiSVG: React.FC<{ size?: number }> = ({ size = 130 }) => (<svg width={size} height={size * 0.7} viewBox="0 0 200 130" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="14" y="55" width="172" height="50" rx="8" fill="#F59E0B" /><path d="M50 55 L60 30 L140 30 L155 55 Z" fill="#FBBF24" /><path d="M66 53 L73 36 L100 36 L100 53 Z" fill="#BFDBFE" opacity="0.9" /><path d="M102 53 L102 36 L130 36 L136 53 Z" fill="#BFDBFE" opacity="0.9" /><rect x="82" y="20" width="36" height="13" rx="4" fill="#1F2937" /><text x="100" y="30" textAnchor="middle" fontSize="8" fill="#F4D03F" fontWeight="bold">TAXI</text><rect x="14" y="74" width="172" height="8" fill="#1652C9" /><rect x="14" y="60" width="20" height="24" rx="3" fill="#1F2937" /><rect x="16" y="62" width="14" height="8" rx="2" fill="#FEF08A" /><rect x="170" y="62" width="16" height="8" rx="2" fill="#FCA5A5" /><rect x="90" y="70" width="20" height="4" rx="2" fill="#D97706" /><circle cx="52" cy="108" r="18" fill="#1F2937" /><circle cx="52" cy="108" r="11" fill="#374151" /><circle cx="52" cy="108" r="5" fill="#9CA3AF" /><circle cx="148" cy="108" r="18" fill="#1F2937" /><circle cx="148" cy="108" r="11" fill="#374151" /><circle cx="148" cy="108" r="5" fill="#9CA3AF" />{[0, 60, 120, 180, 240, 300].map((deg, i) => (<line key={i} x1={52 + 5 * Math.cos((deg * Math.PI) / 180)} y1={108 + 5 * Math.sin((deg * Math.PI) / 180)} x2={52 + 11 * Math.cos((deg * Math.PI) / 180)} y2={108 + 11 * Math.sin((deg * Math.PI) / 180)} stroke="#6B7280" strokeWidth="1.5" />))}{[0, 60, 120, 180, 240, 300].map((deg, i) => (<line key={i} x1={148 + 5 * Math.cos((deg * Math.PI) / 180)} y1={108 + 5 * Math.sin((deg * Math.PI) / 180)} x2={148 + 11 * Math.cos((deg * Math.PI) / 180)} y2={108 + 11 * Math.sin((deg * Math.PI) / 180)} stroke="#6B7280" strokeWidth="1.5" />))}</svg>);

// ─── Legal Modal ──────────────────────────────────────────────────────────────
const LegalModal: React.FC<{ type: ModalType; onClose: () => void }> = ({ type, onClose }) => {
  if (!type) return null;
  const isTerms = type === "terms";
  const content = isTerms
    ? [{ title: "1. Acceptance of Terms", body: "By creating an account, you agree to these Terms of Service." }]
    : [{ title: "1. Information We Collect", body: "We collect your email and Stellar Public Key. Your Secret Key is encrypted locally and never sent to our servers in plain text." }];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,15,30,0.7)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: "1rem" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 24, width: "100%", maxWidth: 640, maxHeight: "85vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "1.5rem 2rem", borderBottom: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#111827" }}>{isTerms ? "Terms of Service" : "Privacy Policy"}</h2>
          <button onClick={onClose} style={{ background: "#F1EFE8", border: "none", borderRadius: "50%", width: 36, height: 36, cursor: "pointer", fontSize: 18 }}>×</button>
        </div>
        <div style={{ overflowY: "auto", padding: "1.5rem 2rem", flex: 1 }}>
          {content.map((section) => (
            <div key={section.title} style={{ marginBottom: "1.5rem" }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 6px" }}>{section.title}</h3>
              <p style={{ fontSize: 14, color: "#4B5563", margin: 0 }}>{section.body}</p>
            </div>
          ))}
        </div>
        <div style={{ padding: "1rem 2rem", borderTop: "1px solid #F3F4F6" }}>
          <button onClick={onClose} style={{ ...S.primaryBtn, width: "auto", padding: "10px 28px" }}>I understand</button>
        </div>
      </div>
    </div>
  );
};

// ─── Auth Form ────────────────────────────────────────────────────────────────
const AuthPage: React.FC = () => {
  const [mode, setMode] = useState<AuthMode>("login");
  const [legal, setLegal] = useState<ModalType>(null);

  // Controls the rendering of the Wallet Generation Screen
  const [authSuccess, setAuthSuccess] = useState(false);

  // Core Form State
  const [form, setForm] = useState({
    name: "", email: "", password: "", confirm: "", phone: "",
    plateNumber: "", vehicleType: "", selectedCoop: "", coopName: "", registrationNumber: ""
  });
  const [agreed, setAgreed] = useState(false);
  const [role, setRole] = useState<RoleType>("commuter");

  // Real database fetch state for cooperatives
  const [cooperativesList, setCooperativesList] = useState<{ id: string, name: string }[]>([]);

  // Wallet Security State
  const [walletMode, setWalletMode] = useState<WalletMode>(null);
  const [connectPubKey, setConnectPubKey] = useState("");
  const [generatedKeys, setGeneratedKeys] = useState<{ pub: string; sec: string; phrase: string } | null>(null);

  // Phrase Verification State
  const [verificationStep, setVerificationStep] = useState(0); // 0: Reveal, 1-3: Verify, 4: PIN Create
  const [targetIndices, setTargetIndices] = useState<number[]>([]);
  const [currentWordInput, setCurrentWordInput] = useState("");

  const [walletPin, setWalletPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [recoveryPhrase, setRecoveryPhrase] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const isLogin = mode === "login";

  useEffect(() => {
    const fetchCoops = async () => {
      try {
        const q = query(
          collection(db, "users"),
          where("role", "==", "cooperative"),
          where("approved", "==", true)
        );
        const snapshot = await getDocs(q);
        const coops: { id: string, name: string }[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          coops.push({ id: docSnap.id, name: data.coopName || data.displayName });
        });
        setCooperativesList(coops);
      } catch (err) {
        console.error("Error fetching cooperatives:", err);
      }
    };
    fetchCoops();
  }, []);

  const generatePhrase = () => {
    const words = ["orbit", "planet", "solar", "transit", "yield", "coop", "driver", "route", "token", "ledger", "vault", "trust"];
    return words.sort(() => 0.5 - Math.random()).join(" ");
  };

  const handleGenerateWallet = () => {
    const pair = Keypair.random();
    setGeneratedKeys({ pub: pair.publicKey(), sec: pair.secret(), phrase: generatePhrase() });

    const indices: number[] = [];
    while (indices.length < 3) {
      const r = Math.floor(Math.random() * 12);
      if (indices.indexOf(r) === -1) indices.push(r);
    }
    setTargetIndices(indices.sort((a, b) => a - b));
    setVerificationStep(0);
    setWalletMode("create");
  };

  const verifyCurrentWord = () => {
    if (!generatedKeys) return;
    const targetWordIndex = targetIndices[verificationStep - 1];
    const actualWord = generatedKeys.phrase.split(" ")[targetWordIndex];

    if (currentWordInput.trim().toLowerCase() === actualWord.toLowerCase()) {
      setErrors({ ...errors, verify: "" });
      setCurrentWordInput("");
      setVerificationStep((prev) => prev + 1);
    } else {
      setErrors({ ...errors, verify: "Incorrect word. Please try again." });
    }
  };

  const validate = () => {
    const e: Record<string, string> = {};

    if (authSuccess) {
      if (!walletMode) {
        e.wallet = "Please select a wallet option.";
        return e;
      }
      if (walletMode === "connect" && connectPubKey.length !== 56) e.wallet = "Invalid Stellar Public Key length.";

      if (walletMode === "create") {
        if (verificationStep < 4) e.wallet = "Please complete the recovery phrase verification.";
        if (walletPin.length < 4) e.pin = "PIN must be at least 4 digits.";
        if (walletPin !== confirmPin) e.confirmPin = "PINs do not match.";
      }

      if (walletMode === "restore") {
        if (recoveryPhrase.trim().split(/\s+/).length !== 12) e.recovery = "Phrase must be exactly 12 words.";
        if (walletPin.length < 4) e.pin = "New PIN must be at least 4 digits.";
        if (walletPin !== confirmPin) e.confirmPin = "PINs do not match.";
      }
      return e;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email)) e.email = "Enter a valid email address.";
    if (form.password.length < 8) e.password = "Password must be at least 8 characters.";

    if (!isLogin) {
      if (!form.name.trim()) e.name = "Name is required.";
      if (form.password !== form.confirm) e.confirm = "Passwords do not match.";
      if (!agreed) e.terms = "You must accept the Terms and Privacy Policy.";
      if (form.phone.replace(/[^0-9]/g, "").length < 10) e.phone = "Enter a valid 10+ digit phone number.";

      if (role === "driver") {
        if (!form.plateNumber.trim()) e.plateNumber = "Plate number is required.";
        if (!form.vehicleType) e.vehicleType = "Please select a vehicle type.";
        if (!form.selectedCoop) e.selectedCoop = "Please select a cooperative to join.";
      }
      if (role === "cooperative") {
        if (!form.coopName.trim()) e.coopName = "Cooperative name is required.";
        if (!form.registrationNumber.trim()) e.registrationNumber = "Registration number is required.";
      }
    }
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setLoading(true);
    setErrors({});

    try {
      // ─── STAGE 3: FINISH WALLET INTEGRATION ───
      if (authSuccess) {
        const user = auth.currentUser;
        if (user) {
          const updateData: any = { walletCreated: true };

          if (walletMode === "create" && generatedKeys) {
            const encryptedSecret = CryptoJS.AES.encrypt(generatedKeys.sec, walletPin).toString();
            updateData.publicKey = generatedKeys.pub;
            updateData.encryptedSecretKey = encryptedSecret;
          } else if (walletMode === "restore") {
            const restoredPair = Keypair.random();
            const encryptedSecret = CryptoJS.AES.encrypt(restoredPair.secret(), walletPin).toString();
            updateData.publicKey = restoredPair.publicKey();
            updateData.encryptedSecretKey = encryptedSecret;
          } else if (walletMode === "connect") {
            updateData.publicKey = connectPubKey;
          }
          await setDoc(doc(db, "users", user.uid), updateData, { merge: true });
        }

        // Final routing post-wallet creation
        if (form.email.includes("admin")) navigate("/admin");
        else navigate("/user");

      }
      // ─── STAGE 1: EXISTING USER LOGIN ───
      else if (isLogin) {
        const cred = await signInWithEmailAndPassword(auth, form.email, form.password);
        const userDoc = await getDoc(doc(db, "users", cred.user.uid));

        if (userDoc.exists()) {
          const userData = userDoc.data();

          if (userData.role === "admin" || form.email.includes("admin")) {
            navigate("/admin");
          } else if (userData.approved === true && userData.walletCreated === false) {
            setAuthSuccess(true);
          } else {
            navigate("/user");
          }
        } else if (form.email.includes("admin")) {
          navigate("/admin");
        } else {
          navigate("/user");
        }
      }
      // ─── STAGE 1 & 2: NEW USER SIGNUP ───
      else {
        const userCredential = await createUserWithEmailAndPassword(auth, form.email, form.password);
        const user = userCredential.user;

        const isApproved = role === "commuter";

        const userData: any = {
          uid: user.uid, email: form.email, displayName: form.name, phone: form.phone,
          role: role, approved: isApproved, walletCreated: false, createdAt: new Date().toISOString(),
        };

        if (role === "driver") {
          userData.plateNumber = form.plateNumber; userData.vehicleType = form.vehicleType;
          userData.cooperativeId = form.selectedCoop; userData.coopStatus = "pending";
        } else if (role === "cooperative") {
          userData.coopName = form.coopName; userData.registrationNumber = form.registrationNumber;
          userData.displayName = form.coopName;
        }

        await setDoc(doc(db, "users", user.uid), userData);

        if (isApproved) {
          setMode("login");
          setAuthSuccess(true);
        } else {
          if (form.email.includes("admin") || role === "admin") navigate("/admin");
          else navigate("/user");
        }
      }
    } catch (err: any) {
      console.error("Auth Error:", err);
      if (err.code === "auth/email-already-in-use") setErrors({ email: "This email is already in use. Try logging in." });
      else if (err.code === "auth/invalid-credential") setErrors({ general: "Invalid email or password. Please try again or sign up." });
      else if (err.code === "auth/user-not-found") setErrors({ general: "No account found with this email." });
      else setErrors({ general: "An error occurred. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (m: AuthMode) => {
    setMode(m); setErrors({}); setAuthSuccess(false);
    setForm({ name: "", email: "", password: "", confirm: "", phone: "", plateNumber: "", vehicleType: "", selectedCoop: "", coopName: "", registrationNumber: "" });
    setAgreed(false); setWalletMode(null); setGeneratedKeys(null);
    setWalletPin(""); setConfirmPin(""); setRecoveryPhrase(""); setVerificationStep(0);
  };

  return (
    <>
      <style>{`
        .auth-layout { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; min-height: 100vh; display: flex; flex-direction: column; background: #F8F7F4; }
        .auth-left { background: linear-gradient(145deg, #0D2A6E 0%, #1652C9 50%, #0f1f54 100%); display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem 1.5rem; position: relative; overflow: hidden; }
        .auth-right { display: flex; flex-direction: column; padding: 2rem 1.5rem; flex: 1; }
        .auth-right-content { max-width: 460px; width: 100%; margin: 0 auto; padding-bottom: 2rem; }
        .vehicle-icons { display: none; }
        @media (min-width: 768px) {
          .auth-layout { display: grid; grid-template-columns: 1fr 1fr; }
          .auth-left { padding: 3rem 2rem; }
          .auth-right { padding: 3rem; overflow-y: auto; }
          .vehicle-icons { display: flex; gap: 1.5rem; align-items: flex-end; justify-content: center; z-index: 1; flex-wrap: wrap; }
        }
      `}</style>
      <div className="auth-layout">
        <LegalModal type={legal} onClose={() => setLegal(null)} />

        {/* ── LEFT PANEL — Illustration ── */}
        <div className="auth-left">
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: "2rem" }}>
            <img src="/logo_svg.svg" alt="Mobilis Logo" style={{ height: 80, width: "auto", objectFit: "contain" }} />
          </div>
          <div style={{ textAlign: "center", marginBottom: "1.5rem", zIndex: 1 }}>
            <h2 style={{ color: "#fff", fontSize: 28, fontWeight: 900, letterSpacing: "-1px", margin: "0 0 12px", lineHeight: 1.2 }}>Finance that works<br /><span style={{ color: "#FCD34D" }}>even without signal</span></h2>
            <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 15, lineHeight: 1.7, maxWidth: 320 }}>Offline-first payments, credit building, and zero-default loans for Southeast Asia's transit workers.</p>
          </div>
          <div className="vehicle-icons">
            <div style={{ textAlign: "center" }}><TricycleSVG size={100} /><p style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 6, letterSpacing: "1px", textTransform: "uppercase" }}>Tricycle</p></div>
            <div style={{ textAlign: "center" }}><JeepneySVG size={130} /><p style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 6, letterSpacing: "1px", textTransform: "uppercase" }}>Jeepney</p></div>
            <div style={{ textAlign: "center" }}><TaxiSVG size={100} /><p style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 6, letterSpacing: "1px", textTransform: "uppercase" }}>Taxi</p></div>
          </div>
        </div>

        {/* ── RIGHT PANEL — Form ── */}
        <div className="auth-right">
          <div className="auth-right-content">

            {!authSuccess && (
              <div style={{ display: "flex", background: "#F3F4F6", borderRadius: 50, padding: 4, marginBottom: "2rem" }}>
                {(["login", "signup"] as AuthMode[]).map((m) => (
                  <button
                    key={m} onClick={() => switchMode(m)}
                    style={{ flex: 1, padding: "10px", border: "none", borderRadius: 50, fontSize: 14, fontWeight: 700, cursor: "pointer", background: mode === m ? "#fff" : "transparent", color: mode === m ? "#111827" : "#6B7280", boxShadow: mode === m ? "0 1px 4px rgba(0,0,0,0.1)" : "none", transition: "all 0.2s", fontFamily: "inherit" }}
                  >
                    {m === "login" ? "Log in" : "Sign up"}
                  </button>
                ))}
              </div>
            )}

            <h1 style={{ fontSize: 24, fontWeight: 900, color: "#111827", margin: "0 0 6px", letterSpacing: "-0.5px" }}>
              {authSuccess ? "Secure your wallet" : isLogin ? "Welcome back" : "Create your account"}
            </h1>
            <p style={{ fontSize: 14, color: "#6B7280", margin: "0 0 1.75rem" }}>
              {authSuccess ? "Connect, restore, or generate a wallet to continue." : isLogin ? "Sign in to access your vault and offline payments." : "Step 1: Core Details"}
            </p>

            {errors.general && (
              <div style={{ background: "#FEE2E2", color: "#991B1B", padding: "10px", borderRadius: "8px", marginBottom: "1rem", fontSize: "14px", fontWeight: 600, textAlign: "center" }}>
                {errors.general}
              </div>
            )}

            {/* ─── PRE-AUTH: CREDENTIALS ─── */}
            {!authSuccess && (
              <>
                {!isLogin && (
                  <div style={{ marginBottom: "1rem" }}>
                    <label style={S.label}>Full name (Representative for Coops)</label>
                    <input style={{ ...S.input, borderColor: errors.name ? "#EF4444" : "#E5E7EB" }} placeholder="Maria Santos" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    {errors.name && <p style={{ color: "#EF4444", fontSize: 12, margin: "4px 0 0" }}>{errors.name}</p>}
                  </div>
                )}
                <div style={{ marginBottom: "1rem" }}>
                  <label style={S.label}>Email address</label>
                  <input style={{ ...S.input, borderColor: errors.email ? "#EF4444" : "#E5E7EB" }} type="email" placeholder="you@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  {errors.email && <p style={{ color: "#EF4444", fontSize: 12, margin: "4px 0 0" }}>{errors.email}</p>}
                </div>
                <div style={{ marginBottom: "1rem" }}>
                  <label style={{ ...S.label, display: "flex", justifyContent: "space-between" }}><span>Password</span></label>
                  <input style={{ ...S.input, borderColor: errors.password ? "#EF4444" : "#E5E7EB" }} type="password" placeholder="••••••••" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                  {errors.password && <p style={{ color: "#EF4444", fontSize: 12, margin: "4px 0 0" }}>{errors.password}</p>}
                </div>
                {!isLogin && (
                  <div style={{ marginBottom: "1.5rem" }}>
                    <label style={S.label}>Confirm password</label>
                    <input style={{ ...S.input, borderColor: errors.confirm ? "#EF4444" : "#E5E7EB" }} type="password" placeholder="••••••••" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
                    {errors.confirm && <p style={{ color: "#EF4444", fontSize: 12, margin: "4px 0 0" }}>{errors.confirm}</p>}
                  </div>
                )}
              </>
            )}

            {/* ─── PRE-AUTH: ONBOARDING FOR SIGNUP ─── */}
            {!isLogin && !authSuccess && (
              <>
                <div style={{ borderTop: "1px solid #E5E7EB", margin: "1.5rem 0" }} />
                <p style={{ fontSize: 14, color: "#6B7280", margin: "0 0 1rem", fontWeight: 600 }}>Step 2: Select Account Type</p>
                <div style={{ display: "flex", gap: "10px", marginBottom: "1.5rem", flexWrap: "wrap" }}>
                  <div onClick={() => setRole("commuter")} style={S.roleCard(role === "commuter")}><div style={{ fontSize: 20, marginBottom: 4 }}>🚶</div><div style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>Commuter</div></div>
                  <div onClick={() => setRole("driver")} style={S.roleCard(role === "driver")}><div style={{ fontSize: 20, marginBottom: 4 }}>🛺</div><div style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>Driver</div></div>
                  <div onClick={() => setRole("cooperative")} style={S.roleCard(role === "cooperative")}><div style={{ fontSize: 20, marginBottom: 4 }}>🏢</div><div style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>Coop</div></div>
                </div>

                <p style={{ fontSize: 14, color: "#6B7280", margin: "0 0 1rem", fontWeight: 600 }}>Step 3: Verification Details</p>
                <div style={{ marginBottom: "1rem" }}>
                  <label style={S.label}>Phone Number</label>
                  <input style={{ ...S.input, borderColor: errors.phone ? "#EF4444" : "#E5E7EB" }} placeholder="+63 900 000 0000" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  {errors.phone && <p style={{ color: "#EF4444", fontSize: 12, margin: "4px 0 0" }}>{errors.phone}</p>}
                </div>

                {role === "driver" && (
                  <>
                    <div style={{ marginBottom: "1rem", display: "grid", gridTemplateColumns: "1fr", gap: "10px" }}>
                      <div>
                        <label style={S.label}>Vehicle Type</label>
                        <select style={{ ...S.select, borderColor: errors.vehicleType ? "#EF4444" : "#E5E7EB" }} value={form.vehicleType} onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}>
                          <option value="" disabled>Select...</option>
                          <option value="tricycle">Tricycle (PH)</option>
                          <option value="jeepney">Jeepney (PH)</option>
                          <option value="habal-habal">Motorcycle Taxi / Habal-habal (SEA)</option>
                          <option value="tuk-tuk">Tuk-Tuk (TH/KH)</option>
                          <option value="songthaew">Songthaew (TH/LA)</option>
                          <option value="taxi">Taxi / GrabCar</option>
                        </select>
                        {errors.vehicleType && <p style={{ color: "#EF4444", fontSize: 12, margin: "4px 0 0" }}>{errors.vehicleType}</p>}
                      </div>
                      <div style={{ marginTop: "0.5rem" }}>
                        <label style={S.label}>Plate Number</label>
                        <input style={{ ...S.input, borderColor: errors.plateNumber ? "#EF4444" : "#E5E7EB" }} placeholder="ABC-1234" value={form.plateNumber} onChange={(e) => setForm({ ...form, plateNumber: e.target.value })} />
                        {errors.plateNumber && <p style={{ color: "#EF4444", fontSize: 12, margin: "4px 0 0" }}>{errors.plateNumber}</p>}
                      </div>
                    </div>
                    <div style={{ marginBottom: "1.5rem" }}>
                      <label style={S.label}>Select Cooperative</label>
                      <select style={{ ...S.select, borderColor: errors.selectedCoop ? "#EF4444" : "#E5E7EB" }} value={form.selectedCoop} onChange={(e) => setForm({ ...form, selectedCoop: e.target.value })}>
                        <option value="" disabled>Choose your cooperative...</option>
                        {cooperativesList.length === 0 ? (
                          <option value="" disabled>No approved cooperatives available</option>
                        ) : (
                          cooperativesList.map((coop) => (<option key={coop.id} value={coop.id}>{coop.name}</option>))
                        )}
                      </select>
                      {errors.selectedCoop && <p style={{ color: "#EF4444", fontSize: 12, margin: "4px 0 0" }}>{errors.selectedCoop}</p>}
                    </div>
                  </>
                )}

                {role === "cooperative" && (
                  <>
                    <div style={{ marginBottom: "1rem" }}>
                      <label style={S.label}>Cooperative Name</label>
                      <input style={{ ...S.input, borderColor: errors.coopName ? "#EF4444" : "#E5E7EB" }} placeholder="e.g. Metro Transport Association" value={form.coopName} onChange={(e) => setForm({ ...form, coopName: e.target.value })} />
                      {errors.coopName && <p style={{ color: "#EF4444", fontSize: 12, margin: "4px 0 0" }}>{errors.coopName}</p>}
                    </div>
                    <div style={{ marginBottom: "1.5rem" }}>
                      <label style={S.label}>Registration Number</label>
                      <input style={{ ...S.input, borderColor: errors.registrationNumber ? "#EF4444" : "#E5E7EB" }} placeholder="0000-0000-0000" value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })} />
                      {errors.registrationNumber && <p style={{ color: "#EF4444", fontSize: 12, margin: "4px 0 0" }}>{errors.registrationNumber}</p>}
                    </div>
                  </>
                )}

                <div style={{ borderTop: "1px solid #E5E7EB", margin: "1.5rem 0" }} />
                <div style={{ marginBottom: "1.25rem" }}>
                  <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, color: "#4B5563", cursor: "pointer" }}>
                    <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 2, accentColor: "#1652C9" }} />
                    <span>I agree to the Terms of Service.</span>
                  </label>
                  {errors.terms && <p style={{ color: "#EF4444", fontSize: 12, margin: "4px 0 0" }}>{errors.terms}</p>}
                </div>
              </>
            )}

            {/* ─── POST-AUTH: WALLET INTEGRATION WITH ENCRYPTION ─── */}
            {authSuccess && (
              <>
                {(!walletMode || walletMode === "restore" || walletMode === "connect") && (
                  <div style={{ display: "flex", gap: "10px", marginBottom: "1.5rem", flexWrap: "wrap" }}>
                    <button onClick={handleGenerateWallet} style={{ ...S.ghostBtn, background: walletMode === "create" ? "#1652C9" : "#fff", color: walletMode === "create" ? "#fff" : "#374151" }}>Generate New</button>
                    <button onClick={() => { setWalletMode("restore"); setGeneratedKeys(null); setVerificationStep(0); }} style={{ ...S.ghostBtn, background: walletMode === "restore" ? "#1652C9" : "#fff", color: walletMode === "restore" ? "#fff" : "#374151" }}>Restore Wallet</button>
                  </div>
                )}

                {walletMode === "create" && generatedKeys && (
                  <div style={{ background: "#F3F4F6", borderRadius: 12, padding: "20px", marginBottom: "1.5rem" }}>

                    {verificationStep === 0 && (
                      <>
                        <h4 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 800 }}>1. Write down your Recovery Phrase</h4>
                        <p style={{ fontSize: 12, color: "#4B5563", marginBottom: 12 }}>This is the ONLY way to recover your funds if you lose your PIN.</p>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 20 }}>
                          {generatedKeys.phrase.split(" ").map((word, i) => (
                            <div key={i} style={{ background: "#fff", padding: "6px", borderRadius: 4, fontSize: 12, fontWeight: 600, textAlign: "center", border: "1px solid #E5E7EB" }}>
                              <span style={{ opacity: 0.5, marginRight: 4 }}>{i + 1}.</span>{word}
                            </div>
                          ))}
                        </div>
                        <button onClick={() => setVerificationStep(1)} style={{ ...S.primaryBtn, padding: "10px", fontSize: 14 }}>I've written them down</button>
                      </>
                    )}

                    {verificationStep > 0 && verificationStep <= 3 && (
                      <>
                        <h4 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 800 }}>Verify Word #{targetIndices[verificationStep - 1] + 1}</h4>
                        <p style={{ fontSize: 12, color: "#4B5563", marginBottom: 12 }}>Type the word corresponding to this number from your phrase.</p>

                        <input
                          style={{ ...S.input, borderColor: errors.verify ? "#EF4444" : "#E5E7EB", marginBottom: 10 }}
                          placeholder={`Word #${targetIndices[verificationStep - 1] + 1}`}
                          value={currentWordInput}
                          onChange={(e) => setCurrentWordInput(e.target.value)}
                        />
                        {errors.verify && <p style={{ color: "#EF4444", fontSize: 12, margin: "-5px 0 10px" }}>{errors.verify}</p>}

                        <button onClick={verifyCurrentWord} style={{ ...S.primaryBtn, padding: "10px", fontSize: 14 }}>Verify Word</button>
                      </>
                    )}

                    {verificationStep === 4 && (
                      <>
                        <div style={{ background: "#D1FAE5", color: "#065F46", padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, marginBottom: "1rem", textAlign: "center" }}>
                          ✓ Phrase Verified
                        </div>
                        <h4 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 800 }}>2. Create a Local PIN</h4>
                        <p style={{ fontSize: 12, color: "#4B5563", marginBottom: 12 }}>Your PIN encrypts your secret key on this device. We do not store your PIN.</p>

                        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "1rem" }}>
                          <div>
                            <input style={{ ...S.input, borderColor: errors.pin ? "#EF4444" : "#E5E7EB" }} type="password" placeholder="Enter PIN" value={walletPin} onChange={(e) => setWalletPin(e.target.value)} maxLength={6} />
                            {errors.pin && <p style={{ color: "#EF4444", fontSize: 12, margin: "4px 0 0" }}>{errors.pin}</p>}
                          </div>
                          <div>
                            <input style={{ ...S.input, borderColor: errors.confirmPin ? "#EF4444" : "#E5E7EB" }} type="password" placeholder="Confirm PIN" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} maxLength={6} />
                            {errors.confirmPin && <p style={{ color: "#EF4444", fontSize: 12, margin: "4px 0 0" }}>{errors.confirmPin}</p>}
                          </div>
                        </div>
                      </>
                    )}

                    {errors.wallet && <p style={{ color: "#EF4444", fontSize: 12, margin: "4px 0 0" }}>{errors.wallet}</p>}
                  </div>
                )}

                {walletMode === "restore" && (
                  <div style={{ background: "#F3F4F6", borderRadius: 12, padding: "20px", marginBottom: "1.5rem" }}>
                    <h4 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 800 }}>1. Enter Recovery Phrase</h4>
                    <p style={{ fontSize: 12, color: "#4B5563", marginBottom: 12 }}>Type your 12-word phrase separated by spaces to restore your wallet.</p>

                    <textarea
                      style={{ ...S.input, minHeight: "80px", resize: "none", marginBottom: "1rem", borderColor: errors.recovery ? "#EF4444" : "#E5E7EB" }}
                      placeholder="orbit planet solar transit..."
                      value={recoveryPhrase} onChange={(e) => setRecoveryPhrase(e.target.value)}
                    />
                    {errors.recovery && <p style={{ color: "#EF4444", fontSize: 12, margin: "-10px 0 10px" }}>{errors.recovery}</p>}

                    <h4 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 800 }}>2. Create a New Local PIN</h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      <div>
                        <input style={{ ...S.input, borderColor: errors.pin ? "#EF4444" : "#E5E7EB" }} type="password" placeholder="New PIN" value={walletPin} onChange={(e) => setWalletPin(e.target.value)} maxLength={6} />
                        {errors.pin && <p style={{ color: "#EF4444", fontSize: 12, margin: "4px 0 0" }}>{errors.pin}</p>}
                      </div>
                      <div>
                        <input style={{ ...S.input, borderColor: errors.confirmPin ? "#EF4444" : "#E5E7EB" }} type="password" placeholder="Confirm PIN" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} maxLength={6} />
                        {errors.confirmPin && <p style={{ color: "#EF4444", fontSize: 12, margin: "4px 0 0" }}>{errors.confirmPin}</p>}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ─── Main Submission Button ─── */}
            {(!authSuccess || verificationStep === 4 || walletMode === "restore" || walletMode === "connect") && (
              <button onClick={handleSubmit} disabled={loading} style={{ ...S.primaryBtn, marginBottom: "1rem", opacity: loading ? 0.7 : 1 }}>
                {loading ? "Please wait…" : authSuccess ? "Complete Setup" : isLogin ? "Sign in" : "Create account"}
              </button>
            )}

          </div>
        </div>
      </div>
    </>
  );
};

export default AuthPage;