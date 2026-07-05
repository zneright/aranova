import { useState, useEffect } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useAuth } from "../../contexts/AuthContext";
import UserLayout from "../../components/layout/UserLayout";
import { useTheme } from "../../contexts/ThemeContext";
import LoadingWorkspace from "../../components/ui/LoadingWorkspace";

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
      const nameMap: Record<string, string> = {};
      try {
        const usersSnap = await getDocs(collection(db, "users"));
        usersSnap.forEach(d => {
          const u = d.data();
          if (u.publicKey) {
            nameMap[u.publicKey] = u.displayName || u.coopName || "Unknown User";
          }
        });
      } catch (err) {
        console.warn("Could not retrieve user directory for name mapping (permission restricted):", err);
      }

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

  const textMuted = dark ? "text-[#94A3B8]" : "text-gray-500";
  const itemHover = dark ? "hover:bg-white/5" : "hover:bg-gray-50";

  if (authLoading) {
    return <LoadingWorkspace message="Loading account transactional history..." dark={dark} />;
  }

  const role = userData?.role || "commuter";

  const getRoleColors = () => {
    switch (role) {
      case "driver":
        return {
          accent: "#FF6B00",
          accentText: dark ? "text-[#FF8833]" : "text-[#D45600]",
          accentBg: "bg-[#FF6B00] text-white hover:bg-[#E05E00]",
          badgeBg: "bg-[#FF6B00]/10 text-[#FF8833]",
          border: dark ? "border-white/5" : "border-[#EAE6DF]",
          card: dark ? "bg-[#141620]" : "bg-white",
        };
      case "cooperative":
        return {
          accent: "#10B981",
          accentText: dark ? "text-[#34D399]" : "text-[#059669]",
          accentBg: "bg-[#10B981] text-white hover:bg-[#0E9F6E]",
          badgeBg: "bg-[#10B981]/10 text-[#34D399]",
          border: dark ? "border-white/5" : "border-[#D5E2EC]",
          card: dark ? "bg-[#0A1128]" : "bg-white",
        };
      case "commuter":
      default:
        return {
          accent: "#FFE600",
          accentText: dark ? "text-[#FFE600]" : "text-[#8A7D00]",
          accentBg: "bg-[#FFE600] text-black hover:bg-[#E6CE00]",
          badgeBg: "bg-[#FFE600]/10 text-black dark:text-[#FFE600] dark:bg-[#FFE600]/10",
          border: dark ? "border-white/5" : "border-[#E2E2DF]",
          card: dark ? "bg-[#0E0F14]" : "bg-white",
        };
    }
  };

  const theme = getRoleColors();

  if (authLoading) {
    return <LoadingWorkspace message="Loading account transactional history..." dark={dark} />;
  }

  // Commuter Layout - Sleek, centered minimalist bento
  const renderCommuterLayout = () => (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className={`text-2xl font-black ${dark ? 'text-white' : 'text-gray-900'}`}>Activity Logs</h1>
          <p className={`text-xs mt-1 ${textMuted}`}>Your P2P transactions and transit history</p>
        </div>
        <button
          onClick={fetchHistory}
          className={`p-3 px-5 rounded-xl text-xs font-black transition-all active:scale-95 uppercase tracking-wider ${theme.accentBg}`}
        >
          Refresh Ledger
        </button>
      </div>

      <div className={`border rounded-[28px] shadow-sm overflow-hidden ${theme.card} ${theme.border}`}>
        <div className={`divide-y ${dark ? 'divide-white/5' : 'divide-gray-200'}`}>
          {loading ? (
            <div className={`p-12 text-center text-sm font-bold ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Syncing with Horizon API...</div>
          ) : activities.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl mb-4 ${dark ? 'bg-white/5' : 'bg-gray-100'}`}>📜</div>
              <p className={`font-bold ${dark ? 'text-white' : 'text-gray-900'}`}>No transactions found</p>
              <p className={`text-xs mt-1 ${textMuted}`}>P2P and transit ledger is currently empty.</p>
            </div>
          ) : (
            activities.map((item) => (
              <div key={item.id} className={`flex items-center justify-between p-5 cursor-pointer transition-colors ${itemHover}`}>
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-black shrink-0 ${
                    item.title.includes("Received") 
                      ? 'bg-emerald-500/10 text-emerald-500' 
                      : (dark ? 'bg-white/5 text-gray-400' : 'bg-gray-100 text-gray-500')
                  }`}>
                    {item.icon}
                  </div>
                  <div className="overflow-hidden">
                    <p className={`font-black text-sm sm:text-base truncate ${dark ? 'text-white' : 'text-gray-900'}`}>{item.title}</p>
                    <p className={`text-[10px] font-black tracking-wider uppercase mt-1 ${textMuted}`}>{item.sub}</p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className={`font-black text-base sm:text-lg ${
                    item.title.includes("Received") 
                      ? 'text-emerald-500' 
                      : (dark ? 'text-white' : 'text-gray-900')
                  }`}>{item.amt}</p>
                  <p className={`text-[10px] font-bold tracking-wider ${textMuted}`}>XLM</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  // Driver Layout - Sturdy bento grid optimized for mobile touch
  const renderDriverLayout = () => (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className={`text-2xl font-black ${dark ? 'text-white' : 'text-gray-900'}`}>Transit Activity Logs</h1>
          <p className={`text-xs mt-1 ${textMuted}`}>Review fare collections and fuel payments</p>
        </div>
        <button
          onClick={fetchHistory}
          className={`p-3 px-5 rounded-xl text-xs font-black transition-all active:scale-95 uppercase tracking-wider ${theme.accentBg}`}
        >
          Refresh Ledger
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Driver Metrics Summary Bento */}
        <div className={`rounded-[28px] p-6 border shadow-sm flex flex-col justify-between ${theme.card} ${theme.border}`}>
          <div>
            <h3 className={`text-sm font-black uppercase mb-2 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Operation Summary</h3>
            <p className={`text-xs leading-relaxed ${textMuted}`}>
              Every transit payment processed offline is securely logged on-chain. Syncing with Horizon ledger ensures accurate balance settlements.
            </p>
          </div>
          <div className={`mt-6 pt-6 border-t space-y-3 ${dark ? 'border-white/5' : 'border-gray-200'}`}>
            <div className="flex justify-between text-xs font-semibold">
              <span className={textMuted}>Role Status:</span>
              <span className={`font-black uppercase tracking-wider ${theme.accentText}`}>Active Operator</span>
            </div>
            <div className="flex justify-between text-xs font-semibold">
              <span className={textMuted}>Total Logged:</span>
              <span className={`font-bold ${dark ? 'text-gray-500' : 'text-gray-400'}`}>{activities.length} entries</span>
            </div>
          </div>
        </div>

        {/* Right Column: Transactions Feed */}
        <div className={`md:col-span-2 border rounded-[28px] shadow-sm overflow-hidden ${theme.card} ${theme.border}`}>
          <div className={`divide-y ${dark ? 'divide-white/5' : 'divide-gray-200'}`}>
            {loading ? (
              <div className={`p-12 text-center text-sm font-bold ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Syncing with Horizon API...</div>
            ) : activities.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center justify-center">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl mb-4 ${dark ? 'bg-white/5' : 'bg-gray-100'}`}>📜</div>
                <p className={`font-bold ${dark ? 'text-white' : 'text-gray-900'}`}>No history found</p>
                <p className={`text-xs mt-1 ${textMuted}`}>No transactions loaded yet.</p>
              </div>
            ) : (
              activities.map((item) => (
                <div key={item.id} className={`flex items-center justify-between p-5 cursor-pointer transition-all ${itemHover}`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black shrink-0 ${
                      item.title.includes("Received") 
                        ? 'bg-emerald-500/10 text-emerald-500' 
                        : 'bg-[#FF6B00]/10 text-[#FF6B00]'
                    }`}>
                      {item.icon}
                    </div>
                    <div className="overflow-hidden">
                      <p className={`font-black text-sm truncate ${dark ? 'text-white' : 'text-gray-900'}`}>{item.title}</p>
                      <p className={`text-[10px] font-black tracking-wider uppercase mt-1 ${textMuted}`}>{item.sub}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className={`font-black text-base ${
                      item.title.includes("Received") 
                        ? 'text-emerald-500' 
                        : 'text-amber-500'
                    }`}>{item.amt}</p>
                    <p className={`text-[10px] font-bold tracking-wider ${textMuted}`}>XLM</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // Cooperative Layout - Institutional Audit Ledger
  const renderCooperativeLayout = () => (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-center mb-2">
        <div>
          <h1 className={`text-2xl font-black ${dark ? 'text-white' : 'text-gray-900'}`}>Treasury Ledger</h1>
          <p className={`text-xs mt-1 ${textMuted}`}>Real-time audit log of cooperative pool payments</p>
        </div>
        <button
          onClick={fetchHistory}
          className={`p-3 px-5 rounded-xl text-xs font-black transition-all active:scale-95 uppercase tracking-wider ${theme.accentBg}`}
        >
          Refresh Ledger
        </button>
      </div>

      <div className={`border rounded-[28px] shadow-sm overflow-hidden ${theme.card} ${theme.border}`}>
        <div className={`p-6 border-b flex items-center justify-between text-xs font-black uppercase tracking-wider ${dark ? 'border-white/5 bg-black/10 text-gray-500' : 'border-gray-200 bg-gray-50/50 text-gray-400'}`}>
          <span>Transaction Details</span>
          <span>Settlement</span>
        </div>
        <div className={`divide-y ${dark ? 'divide-white/5' : 'divide-gray-200'}`}>
          {loading ? (
            <div className={`p-12 text-center text-sm font-bold ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Syncing with Horizon API...</div>
          ) : activities.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl mb-4 ${dark ? 'bg-white/5' : 'bg-gray-100'}`}>🏛️</div>
              <p className={`font-bold ${dark ? 'text-white' : 'text-gray-900'}`}>No audit entries</p>
              <p className={`text-xs mt-1 ${textMuted}`}>No transactions synced under this account.</p>
            </div>
          ) : (
            activities.map((item) => (
              <div key={item.id} className={`flex items-center justify-between p-5 transition-all ${itemHover}`}>
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-base font-black shrink-0 ${
                    item.title.includes("Received") 
                      ? 'bg-emerald-500/10 text-emerald-500' 
                      : 'bg-indigo-500/10 text-indigo-400'
                  }`}>
                    {item.icon}
                  </div>
                  <div>
                    <p className={`font-black text-sm ${dark ? 'text-white' : 'text-gray-900'}`}>{item.title}</p>
                    <p className={`text-[10px] font-semibold mt-1 uppercase tracking-wide ${dark ? 'text-gray-500' : 'text-gray-400'}`}>{item.sub}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-black text-base ${
                    item.title.includes("Received") 
                      ? 'text-emerald-500' 
                      : 'text-indigo-400'
                  }`}>{item.amt}</p>
                  <span className="text-[10px] font-black tracking-widest text-gray-500 uppercase">XLM</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  return (
    <UserLayout activeTab="activity" onTabChange={handleNav} userData={userData}>
      {role === "driver" ? renderDriverLayout() : role === "cooperative" ? renderCooperativeLayout() : renderCommuterLayout()}
    </UserLayout>
  );
};

export default UserActivity;