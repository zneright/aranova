import React from "react";
import AdminLayout, { useAdminTheme } from "../../components/layout/AdminLayout";

// 1. Create an inner component so it sits INSIDE the AdminLayout's Theme Provider!
const DashboardContent = () => {
  // Now this hook will correctly sync with the sun/moon toggle in your header
  const { dark } = useAdminTheme();

  return (
    <div className={`max-w-6xl mx-auto transition-colors duration-200 ${dark ? 'text-gray-100' : 'text-gray-900'}`}>
      <h1 className="text-3xl font-black mb-8">Overview</h1>

      {/* Top Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        
        {/* Card 1 */}
        <div className={`p-6 rounded-2xl shadow-sm border transition-colors duration-200 ${dark ? 'bg-[#141722] border-white/10' : 'bg-white border-gray-200'}`}>
          <p className={`text-sm font-bold uppercase tracking-wider mb-2 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Total Locked Value</p>
          <p className={`text-4xl font-black ${dark ? 'text-blue-400' : 'text-[#1652C9]'}`}>
            $145,250.00 <span className={`text-sm ${dark ? 'text-gray-500' : 'text-gray-400'}`}>USDC</span>
          </p>
        </div>

        {/* Card 2 */}
        <div className={`p-6 rounded-2xl shadow-sm border transition-colors duration-200 ${dark ? 'bg-[#141722] border-white/10' : 'bg-white border-gray-200'}`}>
          <p className={`text-sm font-bold uppercase tracking-wider mb-2 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Contingency Yield</p>
          <p className={`text-4xl font-black ${dark ? 'text-green-400' : 'text-green-600'}`}>
            +$840.50 <span className={`text-sm ${dark ? 'text-gray-500' : 'text-gray-400'}`}>USDC</span>
          </p>
        </div>

        {/* Card 3 (Pending Loans) */}
        <div className={`p-6 rounded-2xl shadow-sm border-l-4 transition-colors duration-200 ${dark ? 'bg-[#141722] border-y-white/10 border-r-white/10 border-l-blue-500' : 'bg-white border-y-gray-200 border-r-gray-200 border-l-[#C0392B]'}`}>
          <p className={`text-sm font-bold uppercase tracking-wider mb-2 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Pending Loans</p>
          <p className="text-4xl font-black flex items-baseline gap-2">
            12 <span className={`text-sm font-medium ${dark ? 'text-blue-400' : 'text-[#C0392B]'}`}>Requires Approval</span>
          </p>
        </div>
      </div>

      {/* Ledger Table */}
      <div className={`rounded-2xl shadow-sm border overflow-hidden transition-colors duration-200 ${dark ? 'bg-[#141722] border-white/10' : 'bg-white border-gray-200'}`}>
        
        <div className={`px-6 py-5 border-b flex justify-between items-center ${dark ? 'border-white/10 bg-[#1A1D2E]' : 'border-gray-200 bg-gray-50'}`}>
          <h3 className="font-bold">Recent Telegraphy Logs (Soroban)</h3>
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${dark ? 'bg-green-500/20 text-green-400 border border-green-500/20' : 'bg-green-100 text-green-800'}`}>
            Live Network
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className={`border-b text-sm ${dark ? 'border-white/10 text-gray-400' : 'border-gray-200 text-gray-500'}`}>
                <th className="p-4 font-semibold">Event Type</th>
                <th className="p-4 font-semibold">User Hash</th>
                <th className="p-4 font-semibold">Amount</th>
                <th className="p-4 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              
              <tr className={`border-b transition-colors ${dark ? 'border-white/10 hover:bg-white/5' : 'border-gray-100 hover:bg-gray-50'}`}>
                <td className={`p-4 font-bold ${dark ? 'text-blue-400' : 'text-blue-600'}`}>Vault Lock (30d)</td>
                <td className={`p-4 font-mono ${dark ? 'text-gray-500' : 'text-gray-500'}`}>GBX4...9L2M</td>
                <td className="p-4 font-bold">100.00 USDC</td>
                <td className="p-4"><span className={`font-medium ${dark ? 'text-green-400' : 'text-green-600'}`}>Confirmed</span></td>
              </tr>
              
              <tr className={`border-b transition-colors ${dark ? 'border-white/10 hover:bg-white/5' : 'border-gray-100 hover:bg-gray-50'}`}>
                <td className={`p-4 font-bold ${dark ? 'text-red-400' : 'text-red-600'}`}>Auto-Debt Settle</td>
                <td className={`p-4 font-mono ${dark ? 'text-gray-500' : 'text-gray-500'}`}>GC2V...4P91</td>
                <td className="p-4 font-bold">50.00 USDC</td>
                <td className="p-4"><span className={`font-medium ${dark ? 'text-green-400' : 'text-green-600'}`}>Cleared</span></td>
              </tr>
              
              <tr className={`transition-colors ${dark ? 'hover:bg-white/5' : 'hover:bg-gray-50'}`}>
                <td className="p-4 font-bold">Fuel Loan Request</td>
                <td className={`p-4 font-mono ${dark ? 'text-gray-500' : 'text-gray-500'}`}>GDMQ...7ZXT</td>
                <td className="p-4 font-bold">20.00 USDC</td>
                <td className="p-4">
                  <button className={`px-4 py-1.5 rounded-full text-xs font-bold transition-transform active:scale-95 ${dark ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'}`}>
                    Approve
                  </button>
                </td>
              </tr>

            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const AdminDashboard = () => {
  return (
    <AdminLayout>
      <DashboardContent />
    </AdminLayout>
  );
};

export default AdminDashboard;