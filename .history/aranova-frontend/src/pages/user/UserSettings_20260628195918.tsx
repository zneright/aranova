import React, { useState, useEffect } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import CryptoJS from "crypto-js";
import { Keypair } from "@stellar/stellar-sdk";
import { auth, db } from "../../firebase/config";
import UserLayout, { useTheme } from "../../components/layout/UserLayout";

const UserSettings = () => {
  const { dark } = useTheme();
  const [userData, setUserData] = useState<any>(null);

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

  useEffect(() => {
    const fetchUser = async () => {
      if (auth.currentUser) {
        const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
        if (userDoc.exists()) {
          setUserData(userDoc.data());
        }
      }
    };
    fetchUser();
  }, []);

  const handleNav = (key: string) => {
    const routes: Record<string, string> = { wallet: "/user", vault: "/user/vault", activity: "/user/activity", profile: "/user/profile", settings: "/user/settings" };
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
      setPinInput(""); // Clear input for security
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

      // Validate the provided secret key by trying to create a Keypair from it
      const pair = Keypair.fromSecret(importKey.trim());
      const publicKey = pair.publicKey();

      // Encrypt it with the new PIN
      const encryptedSecret = CryptoJS.AES.encrypt(pair.secret(), importPin).toString();

      // Save to Firebase
      await updateDoc(doc(db, "users", auth.currentUser.uid), {
        publicKey: publicKey,
        encryptedSecretKey: encryptedSecret
      });

      // Update local UI state
      setUserData({ ...userData, publicKey: publicKey, encryptedSecretKey: encryptedSecret });
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

  const cardBg = dark ? "bg-[#1A1D27] border-[#2A2D3A]" : "bg-white border-gray-100";
  const textMain = dark ? "text-[#F1F5F9]" : "text-gray-900";
  const textMuted = dark ? "text-[#94A3B8]" : "text-gray-500";
  const networkDisplay = userData?.network === "TESTNET" ? "Testnet" : "Mainnet";

  const hasLocalWallet = !!userData?.encryptedSecretKey;

  return (
    <UserLayout activeTab="settings" onTabChange={handleNav} userData={userData}>
      <div className="max-w-2xl mx-auto space-y-6">

        <h1 className={`text-2xl font-black mb-4 ${textMain}`}>Settings</h1>

        {/* Security Settings */}
        <div className={`border rounded-[24px] shadow-sm overflow-hidden ${cardBg}`}>
          <div className={`px-6 py-4 border-b ${dark ? 'border-gray-800' : 'border-gray-100'}`}>
            <h3 className={`font-black text-sm uppercase tracking-wider ${textMuted}`}>Wallet Security</h3>
          </div>
          <div className="p-6">

            {hasLocalWallet ? (
              /* --- STATE 1: ALREADY HAS ENCRYPTED KEY --- */
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
                        className={`px-3 py-1.5 rounded-lg border text-sm w-24 ${dark ? 'bg-black/20 border-gray-700 text-white' : 'bg-gray-50 border-gray-200'}`}
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
              /* --- STATE 2: IMPORT MANUAL KEY (Connected via Extension originally) --- */
              <div className="space-y-4">
                <div>
                  <p className={`font-bold ${textMain}`}>Import Secret Key</p>
                  <p className={`text-xs mt-1 ${textMuted}`}>You connected via an extension. You can import your raw Secret Key here to enable offline local signing. It will be encrypted with a PIN.</p>
                </div>

                <input
                  type="password"
                  placeholder="Paste raw Secret Key (S...)"
                  value={importKey}
                  onChange={(e) => setImportKey(e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl border text-sm ${dark ? 'bg-black/20 border-gray-700 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                />

                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="password"
                    placeholder="Create Local PIN"
                    value={importPin}
                    onChange={(e) => setImportPin(e.target.value)}
                    maxLength={6}
                    className={`w-full px-4 py-2.5 rounded-xl border text-sm ${dark ? 'bg-black/20 border-gray-700 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                  />
                  <input
                    type="password"
                    placeholder="Confirm PIN"
                    value={importConfirmPin}
                    onChange={(e) => setImportConfirmPin(e.target.value)}
                    maxLength={6}
                    className={`w-full px-4 py-2.5 rounded-xl border text-sm ${dark ? 'bg-black/20 border-gray-700 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
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

        {/* Network View Only */}
        <div className={`border rounded-[24px] shadow-sm overflow-hidden ${cardBg}`}>
          <div className={`px-6 py-4 border-b ${dark ? 'border-gray-800' : 'border-gray-100'}`}>
            <h3 className={`font-black text-sm uppercase tracking-wider ${textMuted}`}>Network Connection</h3>
          </div>
          <div className="p-6">
            <div className="flex justify-between items-center mb-2">
              <p className={`font-bold ${textMain}`}>Stellar Horizon API</p>
              <span className={`${userData?.network === "TESTNET" ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'} text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider`}>
                {networkDisplay}
              </span>
            </div>
            <p className={`text-xs ${textMuted}`}>
              Your wallet is currently synced to the {networkDisplay} blockchain. To change this, visit your Profile page.
            </p>
          </div>
        </div>

      </div>
    </UserLayout>
  );
};

export default UserSettings;