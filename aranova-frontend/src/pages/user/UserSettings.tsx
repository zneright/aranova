import React from "react";
import UserLayout, { useTheme } from "../../components/layout/UserLayout";

const UserSettings = () => {
  const { dark } = useTheme();

  const handleNav = (key: string) => {
    const routes: Record<string, string> = { wallet: "/user", vault: "/user/vault", activity: "/user/activity", profile: "/user/profile", settings: "/user/settings" };
    window.location.href = routes[key] || "/user";
  };

  const cardBg = dark ? "bg-[#1A1D27] border-[#2A2D3A]" : "bg-white border-gray-100";
  const textMain = dark ? "text-[#F1F5F9]" : "text-gray-900";
  const textMuted = dark ? "text-[#94A3B8]" : "text-gray-500";

  return (
    <UserLayout activeTab="settings" onTabChange={handleNav}>
      <div className="max-w-2xl mx-auto space-y-6">
        
        <h1 className={`text-2xl font-black mb-4 ${textMain}`}>Settings</h1>

        {/* Security Settings */}
        <div className={`border rounded-[24px] shadow-sm overflow-hidden ${cardBg}`}>
          <div className={`px-6 py-4 border-b ${dark ? 'border-gray-800' : 'border-gray-100'}`}>
            <h3 className={`font-black text-sm uppercase tracking-wider ${textMuted}`}>Security</h3>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            <div className="p-6 flex justify-between items-center">
              <div>
                <p className={`font-bold ${textMain}`}>Recovery Phrase</p>
                <p className={`text-xs mt-1 ${textMuted}`}>Backup your AES-256 encrypted keys.</p>
              </div>
              <button className="text-blue-500 font-bold text-sm">Reveal</button>
            </div>
            <div className="p-6 flex justify-between items-center">
              <div>
                <p className={`font-bold ${textMain}`}>Biometric Login</p>
                <p className={`text-xs mt-1 ${textMuted}`}>Use FaceID / Fingerprint</p>
              </div>
              {/* Fake Toggle */}
              <div className="w-12 h-6 bg-blue-500 rounded-full relative cursor-pointer">
                <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Developer / Network Settings */}
        <div className={`border rounded-[24px] shadow-sm overflow-hidden ${cardBg}`}>
          <div className={`px-6 py-4 border-b ${dark ? 'border-gray-800' : 'border-gray-100'}`}>
            <h3 className={`font-black text-sm uppercase tracking-wider ${textMuted}`}>Network</h3>
          </div>
          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <p className={`font-bold ${textMain}`}>Stellar Network</p>
              <span className="bg-green-100 text-green-700 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">Mainnet</span>
            </div>
            <p className={`text-xs ${textMuted}`}>
              Currently transacting on live Stellar Mainnet. Testnet switching is disabled for this build.
            </p>
          </div>
        </div>

      </div>
    </UserLayout>
  );
};

export default UserSettings;