import React from "react";
import UserLayout, { useTheme } from "../../";

const UserActivity = () => {
  const { dark } = useTheme();

  const handleNav = (key: string) => {
    const routes: Record<string, string> = { wallet: "/user", vault: "/user/vault", activity: "/user/activity", profile: "/user/profile", settings: "/user/settings" };
    window.location.href = routes[key] || "/user";
  };

  const cardBg = dark ? "bg-[#1A1D27] border-[#2A2D3A]" : "bg-white border-gray-100";
  const textMain = dark ? "text-[#F1F5F9]" : "text-gray-900";
  const textMuted = dark ? "text-[#94A3B8]" : "text-gray-500";
  const itemHover = dark ? "hover:bg-white/5" : "hover:bg-gray-50";

  // Dummy Activity Data
  const logs = [
    { title: "Jeepney Fare", sub: "TODAY, 8:42 AM • OFFLINE BLUETOOTH", amt: "-0.25", color: "text-red-500", icon: "🚐", bg: "bg-gray-100 text-gray-800" },
    { title: "Vault Deposit", sub: "OCT 12, 2:15 PM • SMART CONTRACT", amt: "-100.00", color: "text-blue-500", icon: "🔒", bg: "bg-blue-50 text-blue-600" },
    { title: "Coop Fuel Loan", sub: "OCT 10, 6:00 AM • ON-CHAIN", amt: "+50.00", color: "text-green-500", icon: "⛽", bg: "bg-amber-50 text-amber-600" },
    { title: "Tricycle Fare", sub: "OCT 09, 5:30 PM • OFFLINE BLUETOOTH", amt: "-0.50", color: "text-red-500", icon: "🛺", bg: "bg-gray-100 text-gray-800" },
  ];

  return (
    <UserLayout activeTab="activity" onTabChange={handleNav}>
      <div className="max-w-3xl mx-auto space-y-6">

        <div className="flex justify-between items-center mb-4">
          <h1 className={`text-2xl font-black ${textMain}`}>Activity Logs</h1>
          <button className={`p-2 border rounded-lg text-sm font-bold ${dark ? 'border-gray-700 text-gray-300' : 'border-gray-200 text-gray-600'}`}>
            Filter
          </button>
        </div>

        <div className={`border rounded-[24px] shadow-sm overflow-hidden ${cardBg}`}>
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {logs.map((item, i) => (
              <div key={i} className={`flex items-center justify-between p-5 cursor-pointer transition-colors ${itemHover}`}>
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl ${item.bg}`}>
                    {item.icon}
                  </div>
                  <div>
                    <p className={`font-bold text-base ${textMain}`}>{item.title}</p>
                    <p className={`text-[10px] font-bold tracking-wider uppercase mt-1 ${textMuted}`}>{item.sub}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-black text-lg ${item.color}`}>{item.amt}</p>
                  <p className={`text-[10px] font-bold ${textMuted}`}>USDC</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </UserLayout>
  );
};

export default UserActivity;