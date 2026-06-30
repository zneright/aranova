import React, { useState, useEffect } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../../firebase/config";
import UserLayout, { useTheme } from "../../components/layout/UserLayout";

const UserProfile = () => {
  const { dark } = useTheme();
  const [userData, setUserData] = useState<any>(null);
  const [network, setNetwork] = useState<"PUBLIC" | "TESTNET">("PUBLIC");
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      if (auth.currentUser) {
        const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setUserData(data);
          // Default to PUBLIC if network isn't explicitly set to TESTNET
          setNetwork(data.network === "TESTNET" ? "TESTNET" : "PUBLIC");
        }
      }
    };
    fetchUser();
  }, []);

  const handleNav = (key: string) => {
    const routes: Record<string, string> = { wallet: "/user", vault: "/user/vault", activity: "/user/activity", profile: "/user/profile", settings: "/user/settings" };
    window.location.href = routes[key] || "/user";
  };

  const handleNetworkChange = async (newNet: "PUBLIC" | "TESTNET") => {
    if (!auth.currentUser || isUpdating) return;
    setIsUpdating(true);
    setNetwork(newNet);

    try {
      await updateDoc(doc(db, "users", auth.currentUser.uid), {
        network: newNet
      });
      // Optionally reload or show a success toast here
    } catch (err) {
      console.error("Failed to update network setting:", err);
      // Revert if failed
      setNetwork(network);
    } finally {
      setIsUpdating(false);
    }
  };

  const cardBg = dark ? "bg-[#1A1D27] border-[#2A2D3A]" : "bg-white border-gray-100";
  const textMain = dark ? "text-[#F1F5F9]" : "text-gray-900";
  const textMuted = dark ? "text-[#94A3B8]" : "text-gray-500";
  const borderCol = dark ? "border-[#2A2D3A]" : "border-gray-200";

  // Safe variables while data loads
  const displayName = userData?.displayName || userData?.coopName || "Loading...";
  const email = userData?.email || "...";
  const initials = displayName !== "Loading..." ? displayName.substring(0, 2).toUpperCase() : "";
  const roleDisplay = userData?.role ? userData.role.charAt(0).toUpperCase() + userData.role.slice(1) : "Account";

  return (
    <UserLayout activeTab="profile" onTabChange={handleNav} userData={userData}>
      <div className="max-w-2xl mx-auto space-y-6">

        <h1 className={`text-2xl font-black mb-4 ${textMain}`}>My Profile</h1>

        {/* Profile Card */}
        <div className={`border rounded-[24px] p-8 shadow-sm flex flex-col items-center text-center ${cardBg}`}>
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#1652C9] to-[#4F8EF7] flex items-center justify-center text-3xl font-black text-white shadow-lg mb-4">
            {initials}
          </div>
          <h2 className={`text-2xl font-black ${textMain}`}>{displayName}</h2>
          <p className={`text-sm font-medium ${textMuted}`}>{email}</p>

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <span className="bg-blue-100 text-blue-800 text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-wider">{roleDisplay}</span>
            <span className="bg-green-100 text-green-800 text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-wider">KYC Verified</span>
          </div>
        </div>

        {/* Settings Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Wallet Address */}
          <div className={`border rounded-[24px] p-6 shadow-sm flex flex-col ${cardBg}`}>
            <h3 className={`font-black text-sm mb-4 uppercase tracking-wider ${textMuted}`}>Public Wallet Address</h3>
            <div className={`p-4 rounded-xl border flex justify-between items-center flex-1 ${dark ? 'bg-black/20 border-white/10' : 'bg-gray-50 border-gray-200'}`}>
              <code className={`text-xs ${textMain} break-all max-w-[80%]`}>
                {userData?.publicKey || "No wallet connected."}
              </code>
            </div>
            {userData?.publicKey && (
              <button
                onClick={() => navigator.clipboard.writeText(userData.publicKey)}
                className="mt-4 w-full bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs py-3 rounded-xl transition-colors uppercase tracking-wider">
                Copy Address
              </button>
            )}
          </div>

          {/* Network Settings */}
          <div className={`border rounded-[24px] p-6 shadow-sm flex flex-col ${cardBg}`}>
            <h3 className={`font-black text-sm mb-4 uppercase tracking-wider ${textMuted}`}>Network Environment</h3>
            <p className={`text-xs mb-4 ${textMuted}`}>
              Switching networks changes where your transactions are processed. Mainnet uses real funds.
            </p>

            <div className="mt-auto space-y-3">
              <button
                onClick={() => handleNetworkChange("PUBLIC")}
                disabled={isUpdating}
                className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all ${network === "PUBLIC" ? 'border-green-500 bg-green-500/10' : `border-transparent ${dark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'}`}`}>
                <span className={`font-bold text-sm ${network === "PUBLIC" ? 'text-green-600' : textMain}`}>Mainnet (Public)</span>
                {network === "PUBLIC" && <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>}
              </button>

              <button
                onClick={() => handleNetworkChange("TESTNET")}
                disabled={isUpdating}
                className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all ${network === "TESTNET" ? 'border-amber-500 bg-amber-500/10' : `border-transparent ${dark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'}`}`}>
                <span className={`font-bold text-sm ${network === "TESTNET" ? 'text-amber-600' : textMain}`}>Testnet (Sandbox)</span>
                {network === "TESTNET" && <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]"></div>}
              </button>
            </div>
          </div>

        </div>
      </div>
    </UserLayout>
  );
};

export default UserProfile;