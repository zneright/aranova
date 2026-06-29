import React, { useState, useEffect } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useAuth } from "../../contexts/AuthContext";
import UserLayout, { useTheme } from "../../components/layout/UserLayout";

const UserActivity = () => {
  const { dark } = useTheme();
  const { userData, loading: authLoading } = useAuth();
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = async () => {
    if (!userData?.publicKey) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Fetch user profiles to map Public Keys to Real Names
      const usersSnap = await getDocs(collection(db, "users"));
      const nameMap: Record<string, string> = {};
      usersSnap.forEach(d => {
        const u = d.data();
        if (u.publicKey) {
          nameMap[u.publicKey] = u.displayName || u.coopName || "Unknown User";
        }
      });

      const networkUrl = userData.network === "PUBLIC"
        ? "https://horizon.stellar.org"
        : "https://horizon-testnet.stellar.org";

      const response = await fetch(`${networkUrl}/accounts/${userData.publicKey}/payments?limit=15&order=desc`);
      const result = await response.json();

      if (!result._embedded?.records) {
        setActivities([]);
        return;
      }

      const mappedLogs = result._embedded.records.map((record: any) => {
        const isDeposit = record.to === userData.publicKey;
        const amt = parseFloat(record.amount || "0").toFixed(2);
        const date = new Date(record.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        const opponentKey = isDeposit ? record.from : record.to;
        const opponentName = nameMap[opponentKey] || (opponentKey ? `${opponentKey.substring(0, 5)}...${opponentKey.substring(opponentKey.length - 4)}` : "System");

        return {
          id: record.id,
          title: isDeposit ? `Received from ${opponentName}` : `Paid to ${opponentName}`,
          sub: `${date} • ON-CHAIN`,
          amt: isDeposit ? `+${amt}` : `-${amt}`,
          color: isDeposit ? "text-green-500" : dark ? "text-white" : "text-gray-900",
          icon: isDeposit ? "↓" : "↑",
          bg: isDeposit ? "bg-green-50 text-green-600" : (dark ? "bg-gray-800 text-gray-400" : "bg-gray-100 text-gray-500")
        };
      });

      setActivities(mappedLogs);
    } catch (err) {
      console.error("Failed to fetch on-chain history:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && userData) {
      fetchHistory();
    } else if (!authLoading && !userData) {
      setLoading(false);
    }
  }, [userData, authLoading]);

  const handleNav = (key: string) => {
    const routes: Record<string, string> = { wallet: "/user", vault: "/user/vault", activity: "/user/activity", settings: "/user/settings" };
    window.location.href = routes[key] || "/user";
  };

  const cardBg = dark ? "bg-[#1A1D27] border-[#2A2D3A]" : "bg-white border-gray-100";
  const textMain = dark ? "text-[#F1F5F9]" : "text-gray-900";
  const textMuted = dark ? "text-[#94A3B8]" : "text-gray-500";
  const itemHover = dark ? "hover:bg-white/5" : "hover:bg-gray-50";

  if (authLoading) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "#F8F9FA", color: "#6B7280" }}>
        Loading account history...
      </div>
    );
  }

  return (
    <UserLayout activeTab="activity" onTabChange={handleNav} userData={userData}>
      <div className="max-w-3xl mx-auto space-y-6">

        <div className="flex justify-between items-center mb-4">
          <h1 className={`text-2xl font-black ${textMain}`}>Activity Logs</h1>
          <button
            onClick={fetchHistory}
            className={`p-2 px-4 border rounded-lg text-xs font-bold transition-colors shadow-sm hover:shadow active:scale-95 uppercase tracking-wider ${dark ? 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            Refresh Ledger
          </button>
        </div>

        <div className={`border rounded-[24px] shadow-sm overflow-hidden ${cardBg}`}>
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {loading ? (
              <div className="p-8 text-center text-sm font-bold text-gray-400">Syncing with Horizon API...</div>
            ) : activities.length === 0 ? (
              <div className="p-10 text-center flex flex-col items-center justify-center">
                <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center text-2xl mb-3">📜</div>
                <p className={`font-bold ${textMain}`}>No history found</p>
                <p className={`text-xs mt-1 ${textMuted}`}>Try switching networks in Settings if you expect to see data.</p>
              </div>
            ) : (
              activities.map((item) => (
                <div key={item.id} className={`flex items-center justify-between p-5 cursor-pointer transition-colors ${itemHover}`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl font-black shrink-0 ${item.bg}`}>
                      {item.icon}
                    </div>
                    <div className="overflow-hidden">
                      <p className={`font-bold text-sm sm:text-base truncate ${textMain}`}>{item.title}</p>
                      <p className={`text-[10px] font-bold tracking-wider uppercase mt-1 ${textMuted}`}>{item.sub}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className={`font-black text-base sm:text-lg ${item.color}`}>{item.amt}</p>
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