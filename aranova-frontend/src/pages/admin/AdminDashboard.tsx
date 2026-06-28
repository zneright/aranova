// C:\Users\Renz Jericho Buday\aranova\aranova-frontend\src\pages\admin\AdminDashboard.tsx

import React, { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "../../firebase/config";
import AdminLayout, { useAdminTheme } from "../../components/layout/AdminLayout";

const DashboardContent = () => {
  const { dark } = useAdminTheme();

  // State for fetching pending users from Firestore
  const [pendingUsers, setPendingUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch users who are not yet approved
  const fetchPendingUsers = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, "users"), where("approved", "==", false));
      const snapshot = await getDocs(q);
      const users: any[] = [];
      snapshot.forEach((docSnap) => {
        users.push({ id: docSnap.id, ...docSnap.data() });
      });
      setPendingUsers(users);
    } catch (error) {
      console.error("Error fetching pending users:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingUsers();
  }, []);

  // Handle Approving a user
  const handleApprove = async (userId: string) => {
    try {
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, {
        approved: true,
        coopStatus: "approved" // Unlocks dashboard & wallet creation for drivers
      });
      // Remove from UI after approval
      setPendingUsers(prev => prev.filter(user => user.id !== userId));
    } catch (error) {
      console.error("Error approving user:", error);
    }
  };

  // Handle Declining a user (Deletes their application)
  const handleDecline = async (userId: string) => {
    if (!window.confirm("Are you sure you want to decline and delete this application?")) return;
    try {
      await deleteDoc(doc(db, "users", userId));
      setPendingUsers(prev => prev.filter(user => user.id !== userId));
    } catch (error) {
      console.error("Error declining user:", error);
    }
  };

  return (
    <div className={`max-w-6xl mx-auto transition-colors duration-200 ${dark ? 'text-gray-100' : 'text-gray-900'}`}>
      <h1 className="text-3xl font-black mb-8">System Overview</h1>

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

        {/* Card 3 (Pending Approvals Dynamic Stat) */}
        <div className={`p-6 rounded-2xl shadow-sm border-l-4 transition-colors duration-200 ${dark ? 'bg-[#141722] border-y-white/10 border-r-white/10 border-l-amber-500' : 'bg-white border-y-gray-200 border-r-gray-200 border-l-[#F59E0B]'}`}>
          <p className={`text-sm font-bold uppercase tracking-wider mb-2 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Pending Approvals</p>
          <p className="text-4xl font-black flex items-baseline gap-2">
            {pendingUsers.length} <span className={`text-sm font-medium ${dark ? 'text-amber-400' : 'text-[#F59E0B]'}`}>Requires Action</span>
          </p>
        </div>
      </div>

      {/* Dynamic Pending Approvals Table */}
      <div className={`rounded-2xl shadow-sm border overflow-hidden transition-colors duration-200 ${dark ? 'bg-[#141722] border-white/10' : 'bg-white border-gray-200'}`}>

        <div className={`px-6 py-5 border-b flex justify-between items-center ${dark ? 'border-white/10 bg-[#1A1D2E]' : 'border-gray-200 bg-gray-50'}`}>
          <h3 className="font-bold">Pending Applications</h3>
          <button onClick={fetchPendingUsers} className={`text-xs font-bold px-3 py-1 rounded-full transition-all ${dark ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30' : 'bg-blue-100 text-blue-800 hover:bg-blue-200'}`}>
            Refresh Data
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className={`border-b text-sm ${dark ? 'border-white/10 text-gray-400' : 'border-gray-200 text-gray-500'}`}>
                <th className="p-4 font-semibold">User Info</th>
                <th className="p-4 font-semibold">Role</th>
                <th className="p-4 font-semibold">Verification Details</th>
                <th className="p-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm">

              {loading ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center font-medium text-gray-500">Loading applications...</td>
                </tr>
              ) : pendingUsers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center font-medium text-gray-500">No pending applications at the moment.</td>
                </tr>
              ) : (
                pendingUsers.map((user) => (
                  <tr key={user.id} className={`border-b transition-colors ${dark ? 'border-white/10 hover:bg-white/5' : 'border-gray-100 hover:bg-gray-50'}`}>

                    {/* User Info Column */}
                    <td className="p-4">
                      <div className="font-bold text-[15px]">{user.displayName}</div>
                      <div className={`text-xs mt-1 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{user.email}</div>
                      <div className={`text-xs mt-0.5 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{user.phone}</div>
                    </td>

                    {/* Role Badge Column */}
                    <td className="p-4">
                      {user.role === "cooperative" ? (
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${dark ? 'bg-purple-500/20 text-purple-400 border border-purple-500/20' : 'bg-purple-100 text-purple-800'}`}>
                          Cooperative
                        </span>
                      ) : (
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${dark ? 'bg-amber-500/20 text-amber-400 border border-amber-500/20' : 'bg-amber-100 text-amber-800'}`}>
                          Driver
                        </span>
                      )}
                    </td>

                    {/* Dynamic Details Column */}
                    <td className="p-4">
                      {user.role === "cooperative" ? (
                        <div>
                          <div className="font-semibold text-sm">CDA/SEC: <span className="font-normal">{user.registrationNumber}</span></div>
                          <div className={`text-xs mt-1 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Applying as a main entity</div>
                        </div>
                      ) : (
                        <div>
                          <div className="font-semibold text-sm capitalize">{user.vehicleType} <span className="font-normal border-l border-gray-400/30 pl-2 ml-1">{user.plateNumber}</span></div>
                          <div className={`text-xs mt-1 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Requested Coop ID: {user.cooperativeId}</div>
                        </div>
                      )}
                    </td>

                    {/* Actions Column */}
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleApprove(user.id)}
                          className={`px-4 py-1.5 rounded-full text-xs font-bold transition-transform active:scale-95 ${dark ? 'bg-green-600/20 hover:bg-green-600/40 text-green-400 border border-green-600/30' : 'bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 shadow-sm'}`}
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleDecline(user.id)}
                          className={`px-4 py-1.5 rounded-full text-xs font-bold transition-transform active:scale-95 ${dark ? 'bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-600/30' : 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 shadow-sm'}`}
                        >
                          Decline
                        </button>
                      </div>
                    </td>

                  </tr>
                ))
              )}
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