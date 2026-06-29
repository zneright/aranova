import React, { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../firebase/config";
import UserLayout, { useTheme } from "../../components/layout/UserLayout";

const UserActivity = () => {
  const { dark } = useTheme();
  const [userData, setUserData] = useState<any>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!auth.currentUser) return;

      const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
      if (!userDoc.exists()) return;

      const data = userDoc.data();
      setUserData(data);

      if (!data.publicKey) {
        setLoading(false);
        return;
      }

      // Fetch Real Blockchain Data based on user Network
      const networkUrl = data.network === "TESTNET"
        ? "https://horizon-testnet.stellar.org"
        : "https://horizon.stellar.org";

      try {
        const response = await fetch(`${networkUrl}/accounts/${data.publicKey}/payments?limit=15&order=desc`);
        const result = await response.json();

        // Map Stellar API response to UI format
        const mappedLogs = result._embedded.records.map((record: any) => {
          const isDeposit = record.to === data.publicKey;
          const amt = parseFloat(record.amount || "0").toFixed(2);
          const date = new Date(record.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

          return {
            id: record.id,
            title: isDeposit ? "Received Transfer" : "Sent Payment",
            sub: `${date} • ON-CHAIN`,
            amt: isDeposit ? `+${amt}` : `-${amt}`,
            color: isDeposit ? "text-green-500" : "text-red-500",
            icon: isDeposit ? "↓" : "↑",
            bg: isDeposit ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
          };
        });

        setActivities(mappedLogs);
      } catch (err) {
        console.error("Failed to fetch on-chain history:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, []);

  const handleNav = (key: string) => {
    const routes: Record<string, string> = { wallet: "/user", vault: "/user/vault", activity: "/user/activity", profile: "/user/profile", settings: "/user/settings" };
    window.location.href = routes[key] || "/user";
  };

  const cardBg = dark ? "bg-[#1A1D27] border-[#2A2D3A]" : "bg-white border-gray-100";
  const textMain = dark ? "text-[#F1F5F9]" : "text-gray-900";
  const textMuted = dark ? "text-[#94A3B8]" : "text-gray-500";
  const itemHover = dark ? "hover:bg-white/5" : "hover:bg-gray-50";

  return (
    <UserLayout activeTab="activity" onTabChange={handleNav} userData={userData}>
      <div className="max-w-3xl mx-auto space-y-6">

        <div className="flex justify-between items-center mb-4">
          <h1 className={`text-2xl font-black ${textMain}`}>Activity Logs</h1>
          <button className={`p-2 border rounded-lg text-sm font-bold transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 ${dark ? 'border-gray-700 text-gray-300' : 'border-gray-200 text-gray-600'}`}>
            Refresh Live Data
          </button>
        </div>

        <div className={`border rounded-[24px] shadow-sm overflow-hidden ${cardBg}`}>
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {loading ? (
              <div className="p-8 text-center text-sm font-bold text-gray-400">Syncing with Ledger...</div>
            ) : activities.length === 0 ? (
              <div className="p-8 text-center text-sm font-bold text-gray-400">No on-chain transactions found for this wallet.</div>
            ) : (
              activities.map((item) => (
                <div key={item.id} className={`flex items-center justify-between p-5 cursor-pointer transition-colors ${itemHover}`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl font-black ${item.bg}`}>
                      {item.icon}
                    </div>
                    <div>
                      <p className={`font-bold text-base ${textMain}`}>{item.title}</p>
                      <p className={`text-[10px] font-bold tracking-wider uppercase mt-1 ${textMuted}`}>{item.sub}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-black text-lg ${item.color}`}>{item.amt}</p>
                    <p className={`text-[10px] font-bold tracking-wider ${textMuted}`}>XLM</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </UserLayout>
  );
};

export default UserActivity;