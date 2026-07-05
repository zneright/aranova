import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import CryptoJS from "crypto-js";
import { Keypair } from "@stellar/stellar-sdk";
import { db, auth } from "../../firebase/config";
import { useAuth } from "../../contexts/AuthContext";
import UserLayout from "../../components/layout/UserLayout";
import { useTheme } from "../../contexts/ThemeContext";
import LoadingWorkspace from "../../components/ui/LoadingWorkspace";

const UserSettings = () => {
  const { dark } = useTheme();
  const { userData, loading: authLoading } = useAuth();

  // Security State (Reveal)
  const [showPhrase, setShowPhrase] = useState(false);
  const [decryptedPhrase, setDecryptedPhrase] = useState("");

  // Security State (Import Manual Key)
  const [importKey, setImportKey] = useState("");
  const [importError, setImportError] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  // Network State
  const [isUpdatingNetwork, setIsUpdatingNetwork] = useState(false);

  // Custom PIN Pad Modal State
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinDigits, setPinDigits] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinPurpose, setPinPurpose] = useState("");
  
  // PIN Step state machine
  const [pinStep, setPinStep] = useState<"idle" | "reveal" | "change_old" | "change_new" | "change_confirm" | "import_new" | "import_confirm">("idle");
  const [oldPinVal, setOldPinVal] = useState("");
  const [newPinVal, setNewPinVal] = useState("");

  const handleNav = (key: string) => {
    const routes: Record<string, string> = { wallet: "/user", vault: "/user/vault", activity: "/user/activity", settings: "/user/settings" };
    window.location.href = routes[key] || "/user";
  };

  const triggerRevealPhrase = () => {
    setPinPurpose("Enter PIN to reveal Secret Key");
    setPinStep("reveal");
    setPinDigits("");
    setPinError("");
    setShowPinModal(true);
  };

  const triggerChangePin = () => {
    setPinPurpose("Enter Current PIN");
    setPinStep("change_old");
    setPinDigits("");
    setPinError("");
    setShowPinModal(true);
  };

  const triggerImportSecretKey = () => {
    setImportError("");
    const trimmed = importKey.trim();
    if (!trimmed.startsWith("S") || trimmed.length !== 56) {
      setImportError("Invalid Stellar Secret Key format. Must start with 'S' and be 56 characters.");
      return;
    }

    setPinPurpose("Create a 4-Digit PIN");
    setPinStep("import_new");
    setPinDigits("");
    setPinError("");
    setShowPinModal(true);
  };

  const toggleNetwork = async () => {
    if (!auth.currentUser) return;
    setIsUpdatingNetwork(true);
    try {
      const newNetwork = userData?.network === "PUBLIC" ? "TESTNET" : "PUBLIC";
      await updateDoc(doc(db, "users", auth.currentUser.uid), {
        network: newNetwork
      });
    } catch (err) {
      console.error("Failed to update network:", err);
    } finally {
      setIsUpdatingNetwork(false);
    }
  };

  const handlePinSubmit = async () => {
    if (pinDigits.length < 4) {
      setPinError("PIN must be 4 digits.");
      return;
    }
    setPinError("");
    const entered = pinDigits;
    setPinDigits("");

    if (pinStep === "reveal") {
      try {
        const bytes = CryptoJS.AES.decrypt(userData.encryptedSecretKey, entered);
        const originalText = bytes.toString(CryptoJS.enc.Utf8);
        if (!originalText || !originalText.startsWith("S")) throw new Error("Invalid PIN");
        setDecryptedPhrase(originalText);
        setShowPhrase(true);
        setShowPinModal(false);
        setPinStep("idle");
      } catch (e) {
        setPinError("Incorrect PIN. Decryption failed.");
      }
    } else if (pinStep === "change_old") {
      try {
        const bytes = CryptoJS.AES.decrypt(userData.encryptedSecretKey, entered);
        const secretKey = bytes.toString(CryptoJS.enc.Utf8);
        if (!secretKey || !secretKey.startsWith("S")) throw new Error("Invalid PIN");
        setOldPinVal(entered);
        setPinStep("change_new");
        setPinPurpose("Enter New 4-Digit PIN");
      } catch (e) {
        setPinError("Incorrect current PIN.");
      }
    } else if (pinStep === "change_new") {
      setNewPinVal(entered);
      setPinStep("change_confirm");
      setPinPurpose("Confirm New 4-Digit PIN");
    } else if (pinStep === "change_confirm") {
      if (entered !== newPinVal) {
        setPinError("PINs do not match.");
        return;
      }
      try {
        const bytes = CryptoJS.AES.decrypt(userData.encryptedSecretKey, oldPinVal);
        const secretKey = bytes.toString(CryptoJS.enc.Utf8);
        const encryptedSecret = CryptoJS.AES.encrypt(secretKey, entered).toString();
        await updateDoc(doc(db, "users", auth.currentUser!.uid), {
          encryptedSecretKey: encryptedSecret
        });
        alert("Your Vault Security PIN has been updated successfully!");
        setShowPinModal(false);
        setPinStep("idle");
      } catch (err: any) {
        setPinError("Failed to update PIN: " + err.message);
      }
    } else if (pinStep === "import_new") {
      setNewPinVal(entered);
      setPinStep("import_confirm");
      setPinPurpose("Confirm 4-Digit PIN");
    } else if (pinStep === "import_confirm") {
      if (entered !== newPinVal) {
        setPinError("PINs do not match.");
        return;
      }
      setIsImporting(true);
      try {
        const pair = Keypair.fromSecret(importKey.trim());
        const publicKey = pair.publicKey();
        const encryptedSecret = CryptoJS.AES.encrypt(pair.secret(), entered).toString();

        await updateDoc(doc(db, "users", auth.currentUser!.uid), {
          publicKey: publicKey,
          encryptedSecretKey: encryptedSecret
        });

        setImportKey("");
        alert("Secret Key successfully encrypted and saved to your device!");
        setShowPinModal(false);
        setPinStep("idle");
      } catch (err: any) {
        setPinError("Import failed: " + err.message);
      } finally {
        setIsImporting(false);
      }
    }
  };

  const handlePinKey = (num: string) => {
    setPinError("");
    if (pinDigits.length < 4) {
      setPinDigits(prev => prev + num);
    }
  };

  const handlePinBackspace = () => {
    setPinError("");
    setPinDigits(prev => prev.slice(0, -1));
  };

  const hasBackButton = () => {
    return pinStep === "change_new" || pinStep === "change_confirm" || pinStep === "import_confirm";
  };

  const handlePinBack = () => {
    setPinError("");
    if (pinStep === "change_new") {
      setPinStep("change_old");
      setPinPurpose("Enter Current PIN");
      setPinDigits("");
    } else if (pinStep === "change_confirm") {
      setPinStep("change_new");
      setPinPurpose("Enter New 4-Digit PIN");
      setPinDigits("");
    } else if (pinStep === "import_confirm") {
      setPinStep("import_new");
      setPinPurpose("Create a 4-Digit PIN");
      setPinDigits("");
    } else {
      setShowPinModal(false);
      setPinStep("idle");
    }
  };

  if (authLoading) {
    return <LoadingWorkspace message="Syncing cryptographic keys and local data configurations..." dark={dark} />;
  }

  const role = userData?.role || "commuter";

  const getRoleTheme = () => {
    switch (role) {
      case "driver":
        return {
          accent: "#FF6B00",
          accentText: dark ? "text-[#FF8833]" : "text-[#D45600]",
          accentBg: "bg-[#FF6B00] text-white hover:bg-[#E05E00]",
          badgeBg: "bg-[#FF6B00]/10 text-[#FF8833] border-[#FF6B00]/20",
          card: dark ? "bg-[#141620] border-white/5" : "bg-white border-[#EAE6DF]",
          inputRing: "focus:ring-[#FF6B00]",
          buttonAccent: "bg-[#FF6B00] text-white hover:bg-[#E05E00]",
        };
      case "cooperative":
        return {
          accent: "#10B981",
          accentText: dark ? "text-[#34D399]" : "text-[#059669]",
          accentBg: "bg-[#10B981] text-white hover:bg-[#0E9F6E]",
          badgeBg: "bg-[#10B981]/10 text-[#34D399] border-[#10B981]/20",
          card: dark ? "bg-[#0A1128] border-white/5" : "bg-white border-[#D5E2EC]",
          inputRing: "focus:ring-[#10B981]",
          buttonAccent: "bg-[#10B981] text-white hover:bg-[#0E9F6E]",
        };
      case "commuter":
      default:
        return {
          accent: "#FFE600",
          accentText: dark ? "text-[#FFE600]" : "text-[#8A7D00]",
          accentBg: "bg-[#FFE600] text-black hover:bg-[#E6CE00]",
          badgeBg: "bg-[#FFE600]/10 text-black dark:text-[#FFE600] border-[#FFE600]/20",
          card: dark ? "bg-[#0E0F14] border-white/5" : "bg-white border-[#E2E2DF]",
          inputRing: "focus:ring-[#FFE600]",
          buttonAccent: "bg-[#FFE600] text-black hover:bg-[#E6CE00]",
        };
    }
  };

  const theme = getRoleTheme();

  const textMuted = dark ? "text-[#94A3B8]" : "text-gray-550";
  const hasLocalWallet = !!userData?.encryptedSecretKey;
  const displayName = userData?.displayName || userData?.coopName || "User Account";
  const email = userData?.email || "";
  const roleDisplay = userData?.role ? userData.role.charAt(0).toUpperCase() + userData.role.slice(1) : "";
  const initials = displayName !== "User Account" ? displayName.substring(0, 2).toUpperCase() : "UA";

  const renderPinModal = () => (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-[99999] p-6">
      <div className={`rounded-[32px] p-8 max-w-sm w-full border shadow-2xl text-center ${
        dark ? 'bg-[#0E0F14] border-white/10 text-white' : 'bg-white border-gray-100 text-gray-900'
      }`}>
        <div className="mb-4">
          <span className="text-3xl">🔑</span>
          <h3 className="text-lg font-black mt-2">PIN Authorization</h3>
          <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-wider font-extrabold">{pinPurpose}</p>
        </div>

        <div className="flex justify-center gap-4 my-6">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                pinDigits.length > idx
                  ? (role === 'driver' ? 'bg-[#FF6B00] border-transparent scale-110' : role === 'cooperative' ? 'bg-[#10B981] border-transparent scale-110' : 'bg-[#FFE600] border-transparent scale-110')
                  : 'bg-transparent border-gray-400'
              }`}
            />
          ))}
        </div>

        {pinError && <p className="text-red-500 text-xs font-black mb-4">{pinError}</p>}

        <div className="grid grid-cols-3 gap-3 max-w-[240px] mx-auto mb-6">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => handlePinKey(num)}
              className={`h-12 rounded-xl text-lg font-black transition-all active:scale-90 ${
                dark ? 'bg-white/5 hover:bg-white/10 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
              }`}
            >
              {num}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPinDigits("")}
            className={`h-12 rounded-xl text-xs font-black text-red-500 transition-all active:scale-90 ${
              dark ? 'bg-white/5 hover:bg-white/10 text-white' : 'bg-gray-50 text-gray-800'
            }`}
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => handlePinKey("0")}
            className={`h-12 rounded-xl text-lg font-black transition-all active:scale-90 ${
              dark ? 'bg-white/5 hover:bg-white/10 text-white' : 'bg-gray-50 hover:bg-gray-100 text-gray-900'
            }`}
          >
            0
          </button>
          <button
            type="button"
            onClick={handlePinBackspace}
            className={`h-12 rounded-xl text-sm font-black text-gray-400 transition-all active:scale-90 ${
              dark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100'
            }`}
          >
            ⌫
          </button>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handlePinSubmit}
            disabled={pinDigits.length < 4}
            className={`flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all disabled:opacity-50 active:scale-95 ${theme.buttonAccent}`}
          >
            Confirm
          </button>
          <button
            onClick={handlePinBack}
            className={`flex-1 py-3 rounded-xl font-bold text-xs uppercase tracking-wider border transition-all ${
              dark ? 'border-white/10 text-white hover:bg-white/5' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {hasBackButton() ? "Back" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );

  const renderWalletAddressCard = () => (
    <div className={`border rounded-[28px] p-6 shadow-sm ${theme.card}`}>
      <h3 className={`font-black text-xs mb-4 uppercase tracking-wider ${textMuted}`}>Public Wallet Address (Stellar)</h3>
      <div className={`p-4 rounded-xl border flex justify-between items-center ${dark ? 'bg-black/20 border-white/10' : 'bg-gray-50 border-gray-200'}`}>
        <code className={`text-xs sm:text-sm font-mono font-semibold ${dark ? 'text-white' : 'text-gray-900'} break-all`}>
          {userData?.publicKey || "No wallet connected yet."}
        </code>
        <button
          onClick={() => {
            navigator.clipboard.writeText(userData?.publicKey || "");
            alert("Wallet address copied!");
          }}
          className={`font-black text-xs ml-4 uppercase active:scale-95 transition-all shrink-0 ${
            role === 'driver' ? 'text-[#FF8833]' : role === 'cooperative' ? 'text-[#34D399]' : 'text-[#8A7D00] dark:text-[#FFE600]'
          }`}
        >
          Copy
        </button>
      </div>
    </div>
  );

  const renderNetworkSettingsCard = () => (
    <div className={`border rounded-[28px] shadow-sm overflow-hidden ${theme.card}`}>
      <div className={`px-6 py-4 border-b flex justify-between items-center ${dark ? 'border-white/5' : 'border-gray-100'}`}>
        <h3 className={`font-black text-xs uppercase tracking-wider ${textMuted}`}>Network Environment</h3>
      </div>
      <div className="p-6">
        <div className="flex justify-between items-center mb-2">
          <p className={`font-extrabold text-sm ${dark ? 'text-white' : 'text-gray-900'}`}>Horizon Gateway</p>
          <button
            onClick={toggleNetwork}
            disabled={isUpdatingNetwork}
            className={`${
              userData?.network === "PUBLIC" 
                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20' 
                : 'bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20'
            } border px-4 py-2.5 rounded-full font-black text-xs uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2`}
          >
            <span className={`w-2 h-2 rounded-full ${userData?.network === "PUBLIC" ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
            {userData?.network === "PUBLIC" ? "MAINNET" : "TESTNET"}
          </button>
        </div>
        <p className={`text-xs ${textMuted} mt-4 leading-relaxed`}>
          Your wallet ledger synchronization environment is currently bound to the Stellar {userData?.network === "PUBLIC" ? "Public Mainnet" : "Testnet"}. Switching environments will reload balance metrics. Testnet assets have no monetary value.
        </p>
      </div>
    </div>
  );

  const renderSecuritySettingsCard = () => (
    <div className={`border rounded-[28px] shadow-sm overflow-hidden ${theme.card}`}>
      <div className={`px-6 py-4 border-b ${dark ? 'border-white/5' : 'border-gray-100'}`}>
        <h3 className={`font-black text-xs uppercase tracking-wider ${textMuted}`}>Vault Security</h3>
      </div>
      <div className="p-6">
        {hasLocalWallet ? (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
              <div>
                <p className={`font-extrabold text-sm ${dark ? 'text-white' : 'text-gray-900'}`}>Reveal Vault Secret Key</p>
                <p className={`text-xs mt-1 ${textMuted}`}>Decrypt and backup your local key credentials.</p>
              </div>
              {!showPhrase && (
                <button 
                  onClick={triggerRevealPhrase} 
                  className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all active:scale-95 ${theme.accentBg}`}
                >
                  Decrypt & Reveal
                </button>
              )}
            </div>

            {showPhrase && (
              <div className={`p-4 rounded-xl font-mono text-xs break-all border mt-4 ${dark ? 'bg-black/30 border-white/5 text-gray-300' : 'bg-gray-50 border-gray-200 text-gray-700'}`}>
                {decryptedPhrase}
                <button onClick={() => setShowPhrase(false)} className={`block mt-4 font-black text-xs uppercase tracking-wider hover:underline ${dark ? 'text-red-400' : 'text-red-500'}`}>Hide Key</button>
              </div>
            )}

            <div className={`border-t border-dashed pt-6 flex flex-col sm:flex-row justify-between sm:items-center gap-4 ${dark ? 'border-white/5' : 'border-gray-200'}`}>
              <div>
                <p className={`font-extrabold text-sm ${dark ? 'text-white' : 'text-gray-900'}`}>Change Vault Security PIN</p>
                <p className={`text-xs mt-1 ${textMuted}`}>Update the decryption code for your Personal Vault savings ledger.</p>
              </div>
              <button 
                onClick={triggerChangePin} 
                className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider border transition-all active:scale-95 ${dark ? 'border-white/10 text-white hover:bg-white/5' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}
              >
                Change PIN
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className={`font-extrabold text-sm ${dark ? 'text-white' : 'text-gray-900'}`}>Import Raw Secret Key</p>
              <p className={`text-xs mt-1 leading-relaxed ${textMuted}`}>Enable offline signing capability by importing your Stellar Secret Key. The key remains locally encrypted with a PIN.</p>
            </div>

            <input
              type="password"
              placeholder="Paste raw Secret Key (S...)"
              value={importKey}
              onChange={(e) => setImportKey(e.target.value)}
              className={`w-full px-4 py-3 rounded-xl border text-xs focus:outline-none focus:ring-1 ${theme.inputRing} ${
                dark ? 'bg-white/5 border-white/10 text-white placeholder-gray-600' : 'bg-gray-50 border-gray-200 text-gray-900'
              }`}
            />

            {importError && <p className="text-red-500 text-xs font-bold">{importError}</p>}

            <button
              onClick={triggerImportSecretKey}
              disabled={isImporting || !importKey}
              className={`w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all disabled:opacity-50 active:scale-95 ${theme.accentBg}`}
            >
              {isImporting ? "Encrypting..." : "Setup Encrypted Import"}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const renderCommuterLayout = () => (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className={`text-2xl font-black mb-4 ${dark ? 'text-white' : 'text-gray-900'}`}>Profile Settings</h1>

      <div className={`border rounded-[28px] p-8 shadow-sm flex flex-col items-center text-center ${theme.card}`}>
        <div className={`w-24 h-24 rounded-full bg-gradient-to-br from-[#FFE600] to-[#FFE600] flex items-center justify-center text-3xl font-black text-black shadow-lg mb-4`}>
          {initials}
        </div>
        <h2 className={`text-2xl font-black ${dark ? 'text-white' : 'text-gray-900'}`}>{displayName}</h2>
        <p className={`text-sm font-medium ${textMuted}`}>{email}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <span className={`text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-wider ${theme.badgeBg}`}>
            {roleDisplay} Account
          </span>
          {userData?.approved && (
            <span className="bg-emerald-500/10 text-emerald-500 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-wider">
              Verified User
            </span>
          )}
        </div>
      </div>

      {renderWalletAddressCard()}
      {renderNetworkSettingsCard()}
      {renderSecuritySettingsCard()}
    </div>
  );

  const renderDriverLayout = () => (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className={`text-2xl font-black ${dark ? 'text-white' : 'text-gray-900'}`}>Operator Settings</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className={`md:col-span-1 border rounded-[28px] p-6 shadow-sm flex flex-col items-center justify-center text-center ${theme.card}`}>
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#FF6B00] to-[#FF8833] flex items-center justify-center text-2xl font-black text-white shadow-md mb-4">
            {initials}
          </div>
          <h2 className={`text-xl font-black ${dark ? 'text-white' : 'text-gray-900'}`}>{displayName}</h2>
          <p className="text-xs font-semibold text-gray-500 mt-1">{email}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            <span className={`text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-wider ${theme.badgeBg}`}>
              {roleDisplay}
            </span>
            {userData?.approved && (
              <span className="bg-emerald-500/10 text-emerald-400 text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-wider">
                Verified
              </span>
            )}
          </div>
        </div>

        <div className="md:col-span-2 space-y-6">
          {renderSecuritySettingsCard()}
          {renderWalletAddressCard()}
          {renderNetworkSettingsCard()}
        </div>
      </div>
    </div>
  );

  const renderCooperativeLayout = () => (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className={`text-2xl font-black ${dark ? 'text-white' : 'text-gray-900'}`}>Institutional Profile</h1>
        <span className={`text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-wider ${theme.badgeBg}`}>
          {roleDisplay} Account
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className={`border rounded-[28px] p-8 shadow-sm flex flex-col items-center text-center ${theme.card}`}>
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#10B981] to-[#34D399] flex items-center justify-center text-3xl font-black text-white shadow-lg mb-4">
              {initials}
            </div>
            <h2 className={`text-xl font-black ${dark ? 'text-white' : 'text-gray-900'}`}>{displayName}</h2>
            <p className={`text-xs font-semibold ${textMuted}`}>{email}</p>
            {userData?.approved && (
              <span className="mt-4 inline-block bg-emerald-500/10 text-emerald-500 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-wider">
                System Verified
              </span>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {renderWalletAddressCard()}
          {renderNetworkSettingsCard()}
          {renderSecuritySettingsCard()}
        </div>
      </div>
    </div>
  );

  return (
    <UserLayout activeTab="settings" onTabChange={handleNav} userData={userData}>
      <div className="max-w-5xl mx-auto space-y-6">
        {role === "driver" ? renderDriverLayout() : role === "cooperative" ? renderCooperativeLayout() : renderCommuterLayout()}
        {showPinModal && renderPinModal()}
      </div>
    </UserLayout>
  );
};

export default UserSettings;
