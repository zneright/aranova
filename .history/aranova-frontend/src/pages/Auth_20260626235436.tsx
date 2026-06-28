import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase/config";

type AuthMode = "login" | "signup";
type ModalType = "terms" | "privacy" | null;

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

// ... KEEP YOUR EXACT Logo, TricycleSVG, JeepneySVG, TaxiSVG, and LegalModal COMPONENTS HERE ...
// (Omitted for brevity, but paste your existing SVG and LegalModal code exactly as it was)

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
  const navigate = useNavigate();

  const isLogin = mode === "login";

  const validate = () => {
    const e: Record<string, string> = {};
    if (!isLogin && !form.name.trim()) e.name = "Name is required.";
    if (!form.email.includes("@")) e.email = "Enter a valid email address.";
    if (form.password.length < 8) e.password = "Password must be at least 8 characters.";
    if (!isLogin && form.password !== form.confirm) e.confirm = "Passwords do not match.";
    if (!isLogin && !agreed) e.terms = "You must accept the Terms and Privacy Policy.";
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setLoading(true);
    setErrors({});

    try {
      if (isLogin) {
        // Firebase Login
        await signInWithEmailAndPassword(auth, form.email, form.password);

        // Basic routing logic based on email for the prototype
        if (form.email.includes("admin")) {
          navigate("/admin");
        } else {
          navigate("/user");
        }
      } else {
        // Firebase Sign Up
        const userCredential = await createUserWithEmailAndPassword(auth, form.email, form.password);
        const user = userCredential.user;

        // Create Firestore User Document
        await setDoc(doc(db, "users", user.uid), {
          uid: user.uid,
          email: form.email,
          displayName: form.name,
          walletCreated: false, // Flag to trigger onboarding in Phase 4
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          role: "user"
        });

        // Redirect to user dashboard (which will eventually catch the walletCreated = false flag)
        navigate("/user");
      }
    } catch (err: any) {
      // Firebase error handling
      console.error("Auth Error:", err);
      if (err.code === "auth/email-already-in-use") {
        setErrors({ email: "Email is already in use." });
      } else if (err.code === "auth/invalid-credential" || err.code === "auth/user-not-found" || err.code === "auth/wrong-password") {
        setErrors({ general: "Invalid email or password." });
      } else {
        setErrors({ general: "An error occurred. Please try again." });
      }
    } finally {
      setLoading(false);
    }
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
      {/* ... KEEP YOUR EXACT LEFT PANEL (Illustration) HERE ... */}

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

          {/* General Error Banner */}
          {errors.general && (
            <div style={{ background: "#FEE2E2", color: "#991B1B", padding: "10px", borderRadius: "8px", marginBottom: "1rem", fontSize: "14px", fontWeight: 600, textAlign: "center" }}>
              {errors.general}
            </div>
          )}

          {/* ... KEEP YOUR EXACT FORM FIELDS HERE (Tabs, Name, Email, Password, Terms) ... */}

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

          {/* ... KEEP YOUR EXACT FOOTER HERE (Wallet Connect, Switch Mode, Legal Links) ... */}
        </div>
      </div>
    </div>
  );
};

export default AuthPage;