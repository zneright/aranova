import React, { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import CryptoJS from "crypto-js";
import { Keypair } from "@stellar/stellar-sdk";
import { db, auth } from "../../firebase/config";
import { useAuth } from "../../contexts/AuthContext";
import UserLayout, { useTheme } from "../../components/layout/UserLayout";
import LoadingWorkspace from "../../components/ui/LoadingWorkspace";

const UserSettings = () => {
  const { dark } = useTheme();
  const { userData, loading: authLoading } = useAuth();

  // Security State (Reveal)
  const [showPhrase, setShowPhrase] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [decryptedPhrase, setDecryptedPhrase] = useState("");
  const [pinError, setPinError] = useState("");

  // Security State (Import Manual Key)
  const [importKey, setImportKey] = useState("");
  const [importPin, setImportPin] = useState("");
  const [importConfirmPin, setImportConfirmPin] = useState("");
  const [importError, setImportError] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  // Network State
  const [isUpdatingNetwork, setIsUpdatingNetwork] = useState(false);

  const handleNav = (key: string) => {
    const routes: Record<string, string> = { wallet: "/user", vault: "/user/vault", activity: "/user/activity", settings: "/user/settings" };
    window.location.href = routes[key] || "/user";
  };

  const handleRevealPhrase = () => {
    if (pinInput.length < 4) {
      setPinError("Please enter a valid PIN.");
      return;
    }

    try {
      const bytes = CryptoJS.AES.decrypt(userData.encryptedSecretKey, pinInput);
      const originalText = bytes.toString(CryptoJS.enc.Utf8);

      if (!originalText) throw new Error("Invalid PIN");

      setDecryptedPhrase(originalText);
      setShowPhrase(true);
      setPinError("");
      setPinInput("");
    } catch (e) {
      setPinError("Incorrect PIN. Decryption failed.");
    }
  };

  const handleImportSecretKey = async () => {
    setImportError("");
    setIsImporting(true);

    try {
      if (!auth.currentUser) throw new Error("Not authenticated");
      if (importPin.length < 4) throw new Error("PIN must be at least 4 digits");
      if (importPin !== importConfirmPin) throw new Error("PINs do not match");

      const pair = Keypair.fromSecret(importKey.trim());
      const publicKey = pair.publicKey();

      const encryptedSecret = CryptoJS.AES.encrypt(pair.secret(), importPin).toString();

      await updateDoc(doc(db, "users", auth.currentUser.uid), {
        publicKey: publicKey,
        encryptedSecretKey: encryptedSecret
      });

      setImportKey("");
      setImportPin("");
      setImportConfirmPin("");
      alert("Secret Key successfully encrypted and saved to your device!");
    } catch (err: any) {
      setImportError(err.message || "Invalid Secret Key or PIN configuration.");
    } finally {
      setIsImporting(false);
    }
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

  if (authLoading) {
    return <LoadingWorkspace message="Syncing cryptographic keys and local data configurations..." dark={dark} />;
  }

  const cardBg = dark ? "bg-[#1A1D27] border-[#2A2D3A]" : "bg-white border-gray-100";
  const textMain = dark ? "text-[#F1F5F9]" : "text-gray-900";
  const textMuted = dark ? "text-[#94A3B8]" : "text-gray-500";

  const hasLocalWallet = !!userData?.encryptedSecretKey;
  const displayName = userData?.displayName || userData?.coopName || "User Account";
  const email = userData?.email || "";
  const roleDisplay = userData?.role ? userData.role.charAt(0).toUpperCase() + userData.role.slice(1) : "";
  const initials = displayName !== "User Account" ? displayName.substring(0, 2).toUpperCase() : "UA";

  return (
    <UserLayout activeTab="settings" onTabChange={handleNav} userData={userData}>
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className={`text-2xl font-black mb-4 ${textMain}`}>Profile & Settings</h1>

        {/* Profile Card */}
        <div className={`border rounded-[24px] p-8 shadow-sm flex flex-col items-center text-center ${cardBg}`}>
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#1652C9] to-[#4F8EF7] flex items-center justify-center text-3xl font-black text-white shadow-lg mb-4">
            {initials}
          </div>
          <h2 className={`text-2xl font-black ${textMain}`}>{displayName}</h2>
          <p className={`text-sm font-medium ${textMuted}`}>{email}</p>

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <span className="bg-blue-100 text-blue-700 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider">{roleDisplay} Account</span>
            {userData?.approved && (
              <span className="bg-green-100 text-green-700 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider">Verified</span>
            )}
          </div>
        </div>

        {/* Wallet Address */}
        <div className={`border rounded-[24px] p-6 shadow-sm ${cardBg}`}>
          <h3 className={`font-black text-sm mb-4 uppercase tracking-wider ${textMuted}`}>Public Wallet Address (Stellar)</h3>
          <div className={`p-4 rounded-xl border flex justify-between items-center ${dark ? 'bg-black/20 border-white/10' : 'bg-gray-50 border-gray-200'}`}>
            <code className={`text-xs sm:text-sm ${textMain} break-all`}>
              {userData?.publicKey || "No wallet connected yet."}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(userData?.publicKey || "")}
              className="text-blue-500 font-bold text-xs ml-4 uppercase hover:text-blue-600 active:scale-95"
            >
              Copy
            </button>
          </div>
        </div>

        {/* Network Settings */}
        <div className={`border rounded-[24px] shadow-sm overflow-hidden ${cardBg}`}>
          <div className={`px-6 py-4 border-b flex justify-between items-center ${dark ? 'border-gray-800' : 'border-gray-100'}`}>
            <h3 className={`font-black text-sm uppercase tracking-wider ${textMuted}`}>Network Connection</h3>
          </div>
          <div className="p-6">
            <div className="flex justify-between items-center mb-2">
              <p className={`font-bold ${textMain}`}>Stellar Horizon API</p>
              <button
                onClick={toggleNetwork}
                disabled={isUpdatingNetwork}
                className={`${userData?.network === "PUBLIC" ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200' : 'bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200'} border px-4 py-2 rounded-full font-black text-xs uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2`}
              >
                <span className={`w-2 h-2 rounded-full ${userData?.network === "PUBLIC" ? 'bg-green-500' : 'bg-amber-500'}`}></span>
                {userData?.network === "PUBLIC" ? "MAINNET ACTIVE" : "TESTNET ACTIVE"}
              </button>
            </div>
            <p className={`text-xs ${textMuted} mt-4 leading-relaxed`}>
              Your wallet queries and balances are currently tied to the {userData?.network === "PUBLIC" ? "Public Mainnet" : "Testnet"}. Toggle the button above to switch environments. Note that Testnet assets hold no real-world value.
            </p>
          </div>
        </div>

        {/* Security Settings */}
        <div className={`border rounded-[24px] shadow-sm overflow-hidden ${cardBg}`}>
          <div className={`px-6 py-4 border-b ${dark ? 'border-gray-800' : 'border-gray-100'}`}>
            <h3 className={`font-black text-sm uppercase tracking-wider ${textMuted}`}>Wallet Security</h3>
          </div>
          <div className="p-6">
            {hasLocalWallet ? (
              <div>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className={`font-bold ${textMain}`}>Recovery Secret Key</p>
                    <p className={`text-xs mt-1 ${textMuted}`}>Backup your AES-256 encrypted local key.</p>
                  </div>
                  {!showPhrase && (
                    <div className="flex gap-2">
                      <input
                        type="password"
                        placeholder="Enter PIN"
                        value={pinInput}
                        onChange={(e) => setPinInput(e.target.value)}
                        className={`px-3 py-1.5 rounded-lg border text-sm w-24 focus:outline-none focus:border-blue-500 ${dark ? 'bg-black/20 border-gray-700 text-white' : 'bg-gray-50 border-gray-200'}`}
                      />
                      <button onClick={handleRevealPhrase} className="bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1.5 rounded-lg font-bold text-sm transition-colors">
                        Reveal
                      </button>
                    </div>
                  )}
                </div>

                {pinError && <p className="text-red-500 text-xs font-bold mb-2">{pinError}</p>}

                {showPhrase && (
                  <div className={`p-4 rounded-xl font-mono text-xs break-all border mt-2 ${dark ? 'bg-black/30 border-gray-800 text-gray-300' : 'bg-gray-50 border-gray-200 text-gray-700'}`}>
                    {decryptedPhrase}
                    <button onClick={() => setShowPhrase(false)} className="block mt-3 text-red-500 font-bold hover:underline">Hide Key</button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className={`font-bold ${textMain}`}>Import Secret Key</p>
                  <p className={`text-xs mt-1 leading-relaxed ${textMuted}`}>You connected via an extension. You can import your raw Secret Key here to enable offline local signing. It will be encrypted locally with a PIN.</p>
                </div>

                <input
                  type="password"
                  placeholder="Paste raw Secret Key (S...)"
                  value={importKey}
                  onChange={(e) => setImportKey(e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:border-blue-500 ${dark ? 'bg-black/20 border-gray-700 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                />

                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="password"
                    placeholder="Create Local PIN"
                    value={importPin}
                    onChange={(e) => setImportPin(e.target.value)}
                    maxLength={6}
                    className={`w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:border-blue-500 ${dark ? 'bg-black/20 border-gray-700 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                  />
                  <input
                    type="password"
                    placeholder="Confirm PIN"
                    value={importConfirmPin}
                    onChange={(e) => setImportConfirmPin(e.target.value)}
                    maxLength={6}
                    className={`w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:border-blue-500 ${dark ? 'bg-black/20 border-gray-700 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                  />
                </div>

                {importError && <p className="text-red-500 text-xs font-bold">{importError}</p>}

                <button
                  onClick={handleImportSecretKey}
                  disabled={isImporting || !importKey}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-3 rounded-xl font-bold text-sm transition-colors"
                >
                  {isImporting ? "Encrypting..." : "Encrypt & Save to Device"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </UserLayout>
  );
};

export default UserSettings;