import React from "react";
import UserLayout, { useTheme } from "../../components/layout/UserLayout";

const UserProfile = () => {
  const { dark } = useTheme();

  const handleNav = (key: string) => {
    const routes: Record<string, string> = { wallet: "/user", vault: "/user/vault", activity: "/user/activity", profile: "/user/profile", settings: "/user/settings" };
    window.location.href = routes[key] || "/user";
  };

  const cardBg = dark ? "bg-[#1A1D27] border-[#2A2D3A]" : "bg-white border-gray-100";
  const textMain = dark ? "text-[#F1F5F9]" : "text-gray-900";
  const textMuted = dark ? "text-[#94A3B8]" : "text-gray-500";

  return (
    <UserLayout activeTab="profile" onTabChange={handleNav}>
      <div className="max-w-2xl mx-auto space-y-6">

        <h1 className={`text-2xl font-black mb-4 ${textMain}`}>My Profile</h1>

        {/* Profile Card */}
        <div className={`border rounded-[24px] p-8 shadow-sm flex flex-col items-center text-center ${cardBg}`}>
          <div className="w-24 h-24 rounded-full bg-[#4F8EF7] flex items-center justify-center text-3xl font-black text-white shadow-lg mb-4">
            JS
          </div>
          <h2 className={`text-2xl font-black ${textMain}`}>John Santos</h2>
          <p className={`text-sm font-medium ${textMuted}`}>john@mobilis.ph</p>

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <span className="bg-blue-100 text-blue-700 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider">Commuter Account</span>
            <span className="bg-green-100 text-green-700 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider">KYC Verified</span>
          </div>
        </div>

        {/* Wallet Address */}
        <div className={`border rounded-[24px] p-6 shadow-sm ${cardBg}`}>
          <h3 className={`font-black text-sm mb-4 uppercase tracking-wider ${textMuted}`}>Public Wallet Address (Stellar)</h3>
          <div className={`p-4 rounded-xl border flex justify-between items-center ${dark ? 'bg-black/20 border-white/10' : 'bg-gray-50 border-gray-200'}`}>
            <code className={`text-xs sm:text-sm ${textMain} break-all`}>GDFY...W2X9</code>
            <button className="text-blue-500 font-bold text-xs ml-4 uppercase">Copy</button>
          </div>
        </div>
      </div>
    </UserLayout>
  );
};

export default UserProfile;