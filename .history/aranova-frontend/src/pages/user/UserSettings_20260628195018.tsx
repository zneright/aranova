import React, { useState, useEffect } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import CryptoJS from "crypto-js";
import { auth, db } from "../../firebase/config";
import UserLayout, { useTheme } from "../../components/layout/UserLayout";

const UserSettings = () => {
  const { dark } = useTheme();
  const [userData, setUserData] = useState<any>(null);

  // Security State
  const [showPhrase, setShowPhrase] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [decryptedPhrase, setDecryptedPhrase] = useState("");
  const [pinError, setPinError] = useState("");
  const [biometricEnabled, setBiometricEnabled] = useState(true); // Assuming true for now

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
    if (!userData?.encryptedSecretKey) {
      setPinError("No recovery phrase found. You may be using a browser extension.");
      return;
    }

    if (pinInput.length < 4) {
      setPinError("Please enter a valid PIN.");
      return;
    }

    try {
      const bytes = CryptoJS.AES.decrypt(userData.encryptedSecretKey, pinInput);
      const originalText = bytes.toString(CryptoJS.enc.Utf8);

      if (!originalText) throw new Error("Invalid PIN");

      // Realistically this would be the Secret Key, but we label it phrase for simplicity here
      setDecryptedPhrase(originalText);
      setShowPhrase(true);
      setPinError("");
      setPinInput(""); // Clear input for security
    } catch (e) {
      setPinError("Incorrect PIN. Decryption failed.");
    }
  };

  const cardBg = dark ? "bg-[#1A1D27] border-[#2A2D3A]" : "bg-white border-gray-100";
  const textMain = dark ? "text-[#F1F5F9]" : "text-gray-900";
  const textMuted = dark ? "text-[#94A3B8]" : "text-gray-500";
  const networkDisplay = userData?.network === "TESTNET" ? "Testnet" : "Mainnet";

  return (
    <UserLayout activeTab="settings" onTabChange={handleNav} userData={userData}>
      <div className="max-w-2xl mx-auto space-y-6">

        <h1 className={`text-2xl font-black mb-4 ${textMain}`}>Settings</h1>

        {/* Security Settings */}
        <div className={`border rounded-[24px] shadow-sm overflow-hidden ${cardBg}`}>
          <div className={`px-6 py-4 border-b ${dark ? 'border-gray-800' : 'border-gray-100'}`}>
            <h3 className={`font-black text-sm uppercase tracking-wider ${textMuted}`}>Security</h3>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-800">

            {/* Recovery Phrase Reveal */}
            <div className="p-6">
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

            {/* Biometric Toggle */}
            <div className="p-6 flex justify-between items-center">
              <div>
                <p className={`font-bold ${textMain}`}>Biometric Login</p>
                <p className={`text-xs mt-1 ${textMuted}`}>Use FaceID / Fingerprint</p>
              </div>
              <div
                onClick={() => setBiometricEnabled(!biometricEnabled)}
                className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors ${biometricEnabled ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-700'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${biometricEnabled ? 'right-1' : 'left-1'}`}></div>
              </div>
            </div>
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