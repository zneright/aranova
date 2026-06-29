import React, { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext"; // 1. Import your hook
import UserLayout from "../../components/layout/UserLayout";

const UserVault = () => {
  const { userData, loading: authLoading } = useAuth(); // 2. Consume shared auth data
  const [balance, setBalance] = useState("...");

  useEffect(() => {
    // Only run if the auth state is done loading and we have a valid public key
    if (authLoading || !userData?.publicKey) {
      if (userData && !userData.publicKey) setBalance("0.00");
      return;
    }

    const networkUrl = userData.network === "PUBLIC"
      ? "https://horizon.stellar.org"
      : "https://horizon-testnet.stellar.org";

    fetch(`${networkUrl}/accounts/${userData.publicKey}`)
      .then(res => res.json())
      .then(resData => {
        if (resData.balances) {
          const xlm = resData.balances.find((b: any) => b.asset_type === 'native');
          setBalance(xlm ? parseFloat(xlm.balance).toFixed(2) : "0.00");
        } else {
          setBalance("0.00");
        }
      })
      .catch(() => setBalance("0.00"));
  }, [userData, authLoading]); // 3. Re-run when userData changes

  if (authLoading) {
    return <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center" }}>Syncing Workspace...</div>;


    {/* Header Area & Mobile Offline Badge */ }
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2 md:mb-6">
      <h1 className="text-2xl font-black text-gray-900 hidden sm:block">My Vault</h1>
      <div className="bg-blue-50 border border-blue-100 rounded-full px-4 py-2 flex items-center gap-2 shadow-sm w-max sm:hidden">
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-600"></span>
        </span>
        <span className="text-xs font-bold text-blue-800 tracking-wide uppercase">
          Bluetooth Ready (Offline Mode)
        </span>
      </div>
    </div>

    {/* Responsive Grid Layout */ }
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

      <div className="lg:col-span-2 space-y-6">

        {/* Vault Hero Card */}
        <div className="bg-gradient-to-br from-[#DC2626] to-[#881337] rounded-[2rem] p-6 sm:p-10 text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-white opacity-10 rounded-full blur-3xl -mr-10 -mt-10"></div>

          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">🔒</span>
            <p className="text-red-200 text-sm font-semibold opacity-90">
              Total Locked Savings
            </p>
          </div>

          <div className="flex items-baseline gap-2 mb-8 sm:mb-12 relative z-10">
            <h2 className="text-5xl md:text-6xl font-black tracking-tight">{balance}</h2>
            <span className="text-xl font-bold text-red-200 mb-1">XLM</span>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 relative z-10">
            <button className="flex-1 bg-white text-red-700 py-4 rounded-2xl font-black text-sm shadow-lg hover:bg-gray-50 active:scale-95 transition-all">
              + Lock Funds
            </button>
            <button className="flex-1 bg-red-950/40 text-white py-4 rounded-2xl font-bold text-sm border border-red-400/30 hover:bg-red-950/60 active:scale-95 transition-all">
              Unlock Available
            </button>
          </div>
        </div>

        {/* Side-by-side Vault Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E5E7EB] shadow-sm flex flex-col items-center justify-center gap-2 text-center">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Total Yield Earned</p>
            <h3 className="text-3xl font-black text-green-600">+12.50</h3>
            <p className="text-[11px] font-semibold text-gray-400">XLM via Soroban</p>
          </div>

          <div className="bg-[#FEF2F2] p-6 sm:p-8 rounded-3xl border border-red-100 shadow-sm flex flex-col items-center justify-center gap-2 text-center cursor-pointer hover:bg-red-50 transition-colors">
            <p className="text-xs font-bold text-red-400 uppercase tracking-wider mb-1">Clear Debts</p>
            <h3 className="text-xl font-black text-red-700 mb-1">Settle from Vault</h3>
            <p className="text-[11px] font-semibold text-red-500/80 leading-tight">Use locked funds to clear your fuel lines instantly.</p>
          </div>
        </div>
      </div>

      {/* Right Column (Takes up 1/3 space on desktop) */}
      <div className="space-y-6">

        {/* Credit Score Impact */}
        <div className="bg-white border border-[#E5E7EB] rounded-3xl p-6 shadow-sm relative overflow-hidden flex flex-col justify-center">
          <div className="absolute left-0 top-0 bottom-0 w-2 bg-blue-500"></div>
          <h3 className="text-sm font-black text-gray-900 mb-4">Trust Score Impact</h3>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs font-bold mb-1.5">
                <span className="text-gray-500">Vault Multiplier</span>
                <span className="text-blue-600">Active</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full w-full"></div>
              </div>
            </div>

            <p className="text-xs font-semibold text-gray-500 leading-relaxed">
              Your <strong className="text-gray-900">{balance} XLM</strong> lock is currently providing a <strong className="text-gray-900">+45 point</strong> boost to your Trust Score. Withdrawing early will lower your borrowing capacity.
            </p>
          </div>
        </div>

        {/* Active Locks List */}
        <div className="bg-white border border-[#E5E7EB] rounded-3xl p-6 shadow-sm flex-1">
          <div className="flex justify-between items-end mb-6">
            <h3 className="font-black text-gray-900 text-lg">Active Locks</h3>
          </div>

          <div className="space-y-4">

            {/* Lock Item 1 */}
            <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-black text-gray-900 text-sm">50.00 XLM</p>
                  <p className="text-[10px] font-bold text-gray-400 mt-0.5 uppercase tracking-wide">30-Day Lock</p>
                </div>
                <span className="bg-amber-100 text-amber-700 text-[10px] font-black px-2 py-1 rounded-md uppercase tracking-wider">
                  Locked
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-500">
                <span>⏳</span> Unlocks in 12 days
              </div>
            </div>

            {/* Lock Item 2 */}
            <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-black text-gray-900 text-sm">50.00 XLM</p>
                  <p className="text-[10px] font-bold text-gray-400 mt-0.5 uppercase tracking-wide">7-Day Lock</p>
                </div>
                <span className="bg-green-100 text-green-700 text-[10px] font-black px-2 py-1 rounded-md uppercase tracking-wider">
                  Ready
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold text-green-600">
                <span>✨</span> Available to withdraw
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>

    </div >
  </UserLayout >
);
};

export default UserVault;