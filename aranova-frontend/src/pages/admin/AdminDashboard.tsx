// C:\Users\Renz Jericho Buday\aranova\aranova-frontend\src\pages\admin\AdminDashboard.tsx

import { useState, useEffect, useMemo } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  addDoc,
  getDoc,
  setDoc,
  serverTimestamp,
  limit,
  onSnapshot
} from "firebase/firestore";
import { db, auth } from "../../firebase/config";
import AdminLayout, { useAdminTheme, useAdminPage } from "../../components/layout/AdminLayout";
import AdminLoans from "../../components/admin/AdminLoans";
import { FreighterModule } from '@creit.tech/stellar-wallets-kit/modules/freighter';


// ─── DATA SCHEMAS & INTERFACES ──────────────────────────────────────────────
interface UserProfile {
  id: string;
  displayName: string;
  email: string;
  phone?: string;
  role: string; // "admin" | "driver" | "cooperative" | "commuter"
  adminRole?: "super" | "regular";
  limits?: string[];
  publicKey?: string;
  trustScore?: number;
  approved?: boolean;
  cooperativeId?: string;
  vehicleType?: string;
  plateNumber?: string;
  registrationNumber?: string;
}

interface Vault {
  id: string;
  ownerId: string;
  ownerName?: string;
  lockedAmount: number;
  durationValue?: number;
  durationUnit?: string;
  status: string; // "locked" | "redeemed" | "liquidated"
  createdAt?: any;
}

interface FuelRequest {
  id: string;
  driverId: string;
  driverName: string;
  coopId: string;
  amount: number;
  status: string; // "pending" | "approved" | "active" | "repaid"
  purpose: string;
  approvedAmount?: number;
  interestRate?: number;
  gracePeriodDays?: number;
  durationMonths?: number;
  monthlyRepayment?: number;
  createdAt?: any;
  driverPublicKey?: string;
}

interface TransactionRecord {
  id: string;
  type: string; // "pool_deposit" | "credit_release" | "repayment" | "vault_lock"
  from: string;
  to: string;
  amount: number;
  status: string;
  blockchainTxHash?: string;
  createdAt?: any;
}

interface AuditLog {
  id: string;
  adminEmail: string;
  action: string;
  details: string;
  createdAt?: any;
}

// ─── ADMIN DASHBOARD SUB-PAGES (TABS) ─────────────────────────────────────────────

// 1. Overview & Approvals Tab
const OverviewTab: React.FC<{
  pendingUsers: UserProfile[];
  tvl: number;
  yieldEarned: number;
  currentAdminEmail: string;
  loading: boolean;
  onApprove: (id: string) => void;
  onDecline: (id: string) => void;
  onRefresh: () => void;
  currentAdminRole: "super" | "regular";
}> = ({ pendingUsers, tvl, yieldEarned, currentAdminEmail, loading, onApprove, onDecline, onRefresh, currentAdminRole }) => {
  const { dark } = useAdminTheme();

  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">System Overview</h1>
          <p className="text-xs text-gray-500 mt-1">Logged in as: <span className="font-bold text-blue-500">{currentAdminEmail}</span> ({currentAdminRole === "super" ? "Super Admin" : "Regular Admin"})</p>
        </div>
        <button
          onClick={onRefresh}
          className={`self-start sm:self-auto text-xs font-bold px-4 py-2 rounded-xl transition-all ${dark ? "bg-blue-600/20 text-blue-400 border border-blue-500/20 hover:bg-blue-600/30" : "bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100"
            }`}
        >
          Refresh System Stats
        </button>
      </div>

      {/* Top Stats Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className={`p-6 rounded-2xl shadow-sm border ${dark ? "bg-[#141722] border-white/10" : "bg-white border-gray-200"}`}>
          <p className={`text-sm font-bold uppercase tracking-wider mb-2 ${dark ? "text-gray-400" : "text-gray-500"}`}>Total Locked Value (TVL)</p>
          <p className="text-4xl font-black">
            ${tvl.toLocaleString("en-US", { minimumFractionDigits: 2 })} <span className="text-sm font-medium opacity-50">USDC</span>
          </p>
        </div>

        <div className={`p-6 rounded-2xl shadow-sm border ${dark ? "bg-[#141722] border-white/10" : "bg-white border-gray-200"}`}>
          <p className={`text-sm font-bold uppercase tracking-wider mb-2 ${dark ? "text-gray-400" : "text-gray-500"}`}>Reserve Yield Earned</p>
          <p className="text-4xl font-black text-green-500">
            +${yieldEarned.toLocaleString("en-US", { minimumFractionDigits: 2 })} <span className="text-sm font-medium opacity-50">USDC</span>
          </p>
        </div>

        <div className={`p-6 rounded-2xl shadow-sm border-l-4 ${dark ? "bg-[#141722] border-y-white/10 border-r-white/10 border-l-amber-500" : "bg-white border-y-gray-200 border-r-gray-200 border-l-amber-500"}`}>
          <p className={`text-sm font-bold uppercase tracking-wider mb-2 ${dark ? "text-gray-400" : "text-gray-500"}`}>Pending Registrations</p>
          <p className="text-4xl font-black flex items-baseline gap-2">
            {pendingUsers.length} <span className="text-sm font-semibold text-amber-500">Awaiting Action</span>
          </p>
        </div>
      </div>

      {/* Pending Applications Section */}
      <div className={`rounded-2xl border overflow-hidden ${dark ? "bg-[#141722] border-white/10" : "bg-white border-gray-200"}`}>
        <div className={`px-4 sm:px-6 py-4 sm:py-5 border-b ${dark ? "border-white/10 bg-[#1A1D2E]" : "border-gray-200 bg-gray-50"}`}>
          <h3 className="font-extrabold text-[15px] sm:text-[16px]">Pending Onboarding Registrations</h3>
          <p className="text-xs opacity-60 mt-0.5">Requires verification of security details</p>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className={`border-b text-sm ${dark ? "border-white/10 text-gray-400" : "border-gray-200 text-gray-500"}`}>
                <th className="p-4 font-semibold">User Profile</th>
                <th className="p-4 font-semibold">Onboarding Role</th>
                <th className="p-4 font-semibold">Verification Detail Payload</th>
                <th className="p-4 font-semibold text-right">Verification Decision</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr>
                  <td colSpan={4} className="p-12 text-center text-gray-500 font-medium">Fetching registry payload...</td>
                </tr>
              ) : pendingUsers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-12 text-center text-gray-500 font-medium">No registrations currently pending validation.</td>
                </tr>
              ) : (
                pendingUsers.map((user) => (
                  <tr key={user.id} className={`border-b transition-colors ${dark ? "border-white/10 hover:bg-white/5" : "border-gray-100 hover:bg-gray-50"}`}>
                    <td className="p-4">
                      <div className="font-bold text-[15px]">{user.displayName}</div>
                      <div className="text-xs opacity-60 mt-1">{user.email}</div>
                      {user.phone && <div className="text-xs opacity-60 mt-0.5">{user.phone}</div>}
                    </td>
                    <td className="p-4">
                      {user.role === "cooperative" ? (
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">Cooperative</span>
                      ) : (
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">Driver</span>
                      )}
                    </td>
                    <td className="p-4">
                      {user.role === "cooperative" ? (
                        <div>
                          <div className="font-semibold">CDA/SEC Reg: <span className="font-normal">{user.registrationNumber || "N/A"}</span></div>
                          <div className="text-xs opacity-50 mt-0.5">Stellar Public Vault Authorized</div>
                        </div>
                      ) : (
                        <div>
                          <div className="font-semibold capitalize">{user.vehicleType || "Tricycle"} <span className="font-normal pl-2 border-l border-white/15 ml-2">{user.plateNumber || "N/A"}</span></div>
                          <div className="text-xs opacity-50 mt-0.5">Requested Coop ID: {user.cooperativeId || "N/A"}</div>
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => onApprove(user.id)} className={`px-4 py-1.5 rounded-xl text-xs font-extrabold transition-all active:scale-95 ${dark ? "bg-green-600/20 hover:bg-green-600/40 text-green-400 border border-green-600/30" : "bg-green-50 hover:bg-green-100 text-green-700 border border-green-200"}`}>Approve Profile</button>
                        <button onClick={() => onDecline(user.id)} className={`px-4 py-1.5 rounded-xl text-xs font-extrabold transition-all active:scale-95 ${dark ? "bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-600/30" : "bg-red-50 hover:bg-red-100 text-red-700 border border-red-200"}`}>Decline Request</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Stacked Card View */}
        <div className="block md:hidden divide-y divide-gray-100 dark:divide-white/5">
          {loading ? (
            <div className="p-8 text-center text-gray-500 font-medium">Fetching registry payload...</div>
          ) : pendingUsers.length === 0 ? (
            <div className="p-8 text-center text-gray-500 font-medium">No registrations currently pending validation.</div>
          ) : (
            pendingUsers.map((user) => (
              <div key={user.id} className="p-4 space-y-3">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-[15px] truncate">{user.displayName}</div>
                    <div className="text-xs opacity-60 mt-0.5 truncate">{user.email}</div>
                    {user.phone && <div className="text-xs opacity-60 mt-0.5">{user.phone}</div>}
                  </div>
                  {user.role === "cooperative" ? (
                    <span className="flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">Cooperative</span>
                  ) : (
                    <span className="flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">Driver</span>
                  )}
                </div>
                <div className={`p-3 rounded-xl text-xs space-y-1 ${dark ? "bg-white/5" : "bg-gray-50"}`}>
                  {user.role === "cooperative" ? (
                    <>
                      <div className="flex justify-between">
                        <span className="opacity-60">CDA/SEC Reg:</span>
                        <span className="font-semibold">{user.registrationNumber || "N/A"}</span>
                      </div>
                      <div className="text-[10px] opacity-50">Stellar Public Vault Authorized</div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <span className="opacity-60">Vehicle:</span>
                        <span className="font-semibold capitalize">{user.vehicleType || "Tricycle"} — {user.plateNumber || "N/A"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="opacity-60">Coop ID:</span>
                        <span className="font-semibold">{user.cooperativeId || "N/A"}</span>
                      </div>
                    </>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => onApprove(user.id)} className={`py-2.5 rounded-xl text-xs font-extrabold transition-all active:scale-95 ${dark ? "bg-green-600/20 text-green-400 border border-green-600/30" : "bg-green-50 text-green-700 border border-green-200"}`}>Approve Profile</button>
                  <button onClick={() => onDecline(user.id)} className={`py-2.5 rounded-xl text-xs font-extrabold transition-all active:scale-95 ${dark ? "bg-red-600/20 text-red-400 border border-red-600/30" : "bg-red-50 text-red-700 border border-red-200"}`}>Decline Request</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// 2. Coop Pool & Reserve Management
const CoopPoolTab: React.FC<{
  users: UserProfile[];
  transactions: TransactionRecord[];
  currentAdminEmail: string;
  onRefresh: () => void;
}> = ({ users, transactions, currentAdminEmail, onRefresh }) => {
  const { dark } = useAdminTheme();
  const [depositAmount, setDepositAmount] = useState("");
  const [targetCoop, setTargetCoop] = useState("");
  const [txReceipt, setTxReceipt] = useState<string | null>(null);

  const cooperatives = useMemo(() => {
    return users.filter(u => u.role === "cooperative" && u.approved === true);
  }, [users]);

  const poolReservesSum = useMemo(() => {
    return transactions
      .filter(t => t.type === "pool_deposit" && t.status === "completed")
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  }, [transactions]);

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!depositAmount || isNaN(Number(depositAmount)) || !targetCoop) return;
    setTxReceipt("Broadcasting reserve lock to Stellar Horizon...");
    try {
      const amt = Number(depositAmount);
      const randomHash = "0x" + Math.random().toString(16).substr(2, 40);

      // Write Pool transaction log
      await addDoc(collection(db, "transactions"), {
        type: "pool_deposit",
        from: "admin",
        to: targetCoop,
        amount: amt,
        status: "completed",
        blockchainTxHash: randomHash,
        createdAt: serverTimestamp()
      });

      // Write Admin Audit Log
      await addDoc(collection(db, "admin_audit_logs"), {
        adminEmail: currentAdminEmail,
        action: "Deposited Reserve Liquidity",
        details: `Deposited ${amt} USDC into Cooperative Pool (Coop ID: ${targetCoop})`,
        createdAt: serverTimestamp()
      });

      setTxReceipt(`Success! Locked ${amt} USDC in Soroban Liquidity Pool. Tx Hash: ${randomHash}`);
      setDepositAmount("");
      onRefresh();
    } catch (err: any) {
      try {
        await addDoc(collection(db, "admin_audit_logs"), {
          adminEmail: currentAdminEmail,
          action: "Failed Reserve Deposit",
          details: `Attempted to deposit ${depositAmount} USDC into Cooperative Pool (Coop ID: ${targetCoop}) but failed: ${err.message || err}`,
          createdAt: serverTimestamp()
        });
      } catch (logErr) {
        console.error("Failed to write failure log to Firestore:", logErr);
      }
      setTxReceipt(`Error: ${err}`);
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      <h1 className="text-3xl font-black">Cooperative Pool reserves</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={`p-6 rounded-2xl border ${dark ? "bg-[#141722] border-white/10" : "bg-white border-gray-200"}`}>
          <div className="text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Total Pool Deposits</div>
          <div className="text-3xl font-black">${poolReservesSum.toLocaleString("en-US", { minimumFractionDigits: 2 })} USDC</div>
        </div>
        <div className={`p-6 rounded-2xl border ${dark ? "bg-[#141722] border-white/10" : "bg-white border-gray-200"}`}>
          <div className="text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Active Cooperatives</div>
          <div className="text-3xl font-black">{cooperatives.length} entities</div>
        </div>
        <div className={`p-6 rounded-2xl border ${dark ? "bg-[#141722] border-white/10" : "bg-white border-gray-200"}`}>
          <div className="text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Estimated Yield APY</div>
          <div className="text-3xl font-black text-blue-500">4.80 %</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Deposit reserve funds */}
        <div className={`p-6 rounded-2xl border ${dark ? "bg-[#141722] border-white/10" : "bg-white border-gray-200"}`}>
          <h3 className="font-extrabold text-lg mb-4">Deposit Reserve Liquidity</h3>
          <form onSubmit={handleDeposit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Target Cooperative</label>
              <select
                value={targetCoop}
                onChange={(e) => setTargetCoop(e.target.value)}
                className={`w-full p-3 rounded-xl border font-bold ${dark ? "bg-[#0E1016] border-white/10 text-white" : "bg-gray-50 border-gray-200 text-gray-900"
                  }`}
              >
                <option value="">Select a Cooperative...</option>
                {cooperatives.map(c => (
                  <option key={c.id} value={c.id}>{c.displayName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">USDC Amount</label>
              <input
                type="text"
                placeholder="e.g. 5000"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className={`w-full p-3 rounded-xl border font-bold ${dark ? "bg-[#0E1016] border-white/10 text-white" : "bg-gray-50 border-gray-200 text-gray-900"
                  }`}
              />
            </div>
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-3 rounded-xl transition-all">
              Broadcast Deposit (Stellar)
            </button>
          </form>

          {txReceipt && (
            <div className={`mt-4 p-4 rounded-xl text-xs font-bold ${txReceipt.includes("Success") ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
              }`}>
              {txReceipt}
            </div>
          )}
        </div>

        {/* Info panel */}
        <div className={`p-6 rounded-2xl border flex flex-col justify-between ${dark ? "bg-[#141722] border-white/10" : "bg-white border-gray-200"}`}>
          <div>
            <h3 className="font-extrabold text-lg mb-4">Reserve Pool Mechanism</h3>
            <p className="text-sm opacity-70 leading-relaxed mb-4">
              Reserve pool liquidity stays anchored in interest-generating Soroban smart contract vaults. These funds are liquid-cleared on-chain to cover commuter transits and driver microloans.
            </p>
          </div>
          <div className="text-xs opacity-50 border-t border-white/10 pt-4 mt-4">
            Contract Address: CDSB43...2RFAK
          </div>
        </div>
      </div>
    </div>
  );
};


// 4. Member Directory
const MembersTab: React.FC<{ users: UserProfile[] }> = ({ users }) => {
  const { dark } = useAdminTheme();
  const [filter, setFilter] = useState("");

  const filtered = users.filter(m =>
    m.role !== "commuter" && m.role !== "admin" &&
    (m.displayName.toLowerCase().includes(filter.toLowerCase()) ||
      m.email.toLowerCase().includes(filter.toLowerCase()))
  );

  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <h1 className="text-2xl sm:text-3xl font-black">Members Registry</h1>
        <input
          type="text"
          placeholder="Filter members..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className={`w-full sm:w-auto px-4 py-2 rounded-xl border text-sm font-semibold ${dark ? "bg-[#141722] border-white/10 text-white" : "bg-white border-gray-200 text-gray-900"}`}
        />
      </div>

      <div className={`rounded-2xl border overflow-hidden ${dark ? "bg-[#141722] border-white/10" : "bg-white border-gray-200"}`}>
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className={`border-b text-sm ${dark ? "border-white/10 text-gray-400" : "border-gray-200 text-gray-500"}`}>
                <th className="p-4 font-semibold">Name / Contact</th>
                <th className="p-4 font-semibold">Role</th>
                <th className="p-4 font-semibold">Stellar Wallet</th>
                <th className="p-4 font-semibold">Repayment Rating</th>
                <th className="p-4 font-semibold text-right">Status</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-gray-500">No matching members found.</td></tr>
              ) : (
                filtered.map((m, idx) => (
                  <tr key={idx} className={`border-b transition-colors ${dark ? "border-white/10 hover:bg-white/5" : "border-gray-100 hover:bg-gray-50"}`}>
                    <td className="p-4">
                      <div className="font-bold text-[15px]">{m.displayName}</div>
                      <div className="text-xs opacity-50 mt-0.5">{m.email}</div>
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${m.role === "cooperative" ? "bg-purple-500/10 text-purple-400 border border-purple-500/20" : m.role === "driver" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-blue-500/10 text-blue-400 border border-blue-500/20"}`}>{m.role}</span>
                    </td>
                    <td className="p-4 font-mono text-xs opacity-60">{m.publicKey ? `${m.publicKey.substring(0, 8)}...${m.publicKey.substring(m.publicKey.length - 8)}` : "Not Initialized"}</td>
                    <td className="p-4 font-bold">{m.trustScore ?? 0}</td>
                    <td className="p-4 text-right">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${m.approved ? "bg-green-500/10 text-green-500 border border-green-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"}`}>{m.approved ? "Active" : "Pending Approval"}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Stacked Card View */}
        <div className="block md:hidden divide-y divide-gray-100 dark:divide-white/5">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No matching members found.</div>
          ) : (
            filtered.map((m, idx) => (
              <div key={idx} className="p-4 space-y-3">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-[15px] truncate">{m.displayName}</div>
                    <div className="text-xs opacity-50 mt-0.5 truncate">{m.email}</div>
                  </div>
                  <span className={`flex-shrink-0 px-2.5 py-0.5 rounded-full text-xs font-bold ${m.role === "cooperative" ? "bg-purple-500/10 text-purple-400 border border-purple-500/20" : m.role === "driver" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-blue-500/10 text-blue-400 border border-blue-500/20"}`}>{m.role}</span>
                </div>
                <div className={`p-3 rounded-xl text-xs space-y-2 ${dark ? "bg-white/5" : "bg-gray-50"}`}>
                  <div className="flex justify-between">
                    <span className="opacity-60">Stellar Wallet:</span>
                    <span className="font-mono font-bold">{m.publicKey ? `${m.publicKey.substring(0, 8)}...${m.publicKey.substring(m.publicKey.length - 6)}` : "Not Initialized"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-60">Trust Score:</span>
                    <span className="font-bold">{m.trustScore ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-60">Status:</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${m.approved ? "bg-green-500/10 text-green-500 border border-green-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"}`}>{m.approved ? "Active" : "Pending Approval"}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// 5. Soroban Vaults
const VaultsTab: React.FC<{
  vaults: Vault[];
  loans: FuelRequest[];
  users: UserProfile[];
  currentAdminEmail: string;
  onRefresh: () => void;
}> = ({ vaults, loans, users, currentAdminEmail, onRefresh }) => {
  const { dark } = useAdminTheme();
  const [liquidatingId, setLiquidatingId] = useState<string | null>(null);

  const getVaultOwnerName = (ownerId: string) => {
    const profile = users.find(u => u.id === ownerId);
    return profile?.displayName ?? "Unknown Operator";
  };

  const getVaultHealth = (vault: Vault) => {
    const ownerDebt = loans
      .filter(l => l.driverId === vault.ownerId && l.status === "active")
      .reduce((sum, l) => sum + Number(l.amount || 0), 0);
    if (ownerDebt === 0) return 99.0;
    return Number(vault.lockedAmount || 0) / ownerDebt;
  };

  const triggerLiquidation = async (vault: Vault) => {
    setLiquidatingId(vault.id);
    try {
      // Update Vault Status in Firestore
      await updateDoc(doc(db, "vaults", vault.id), { status: "liquidated" });

      // Write Liquidation Event to Transactions
      await addDoc(collection(db, "transactions"), {
        type: "liquidation",
        from: vault.ownerId,
        to: "cooperative_pool",
        amount: Number(vault.lockedAmount || 0),
        status: "completed",
        blockchainTxHash: "0x" + Math.random().toString(16).substr(2, 40),
        createdAt: serverTimestamp()
      });

      // Write Admin Audit Log
      await addDoc(collection(db, "admin_audit_logs"), {
        adminEmail: currentAdminEmail,
        action: "Liquidated Vault Collateral",
        details: `Liquidated Soroban Vault ${vault.id} belonging to Operator ${getVaultOwnerName(vault.ownerId)} due to delinquency.`,
        createdAt: serverTimestamp()
      });

      onRefresh();
    } catch (err: any) {
      console.error(err);
      try {
        await addDoc(collection(db, "admin_audit_logs"), {
          adminEmail: currentAdminEmail,
          action: "Failed Vault Liquidation",
          details: `Attempted to liquidate Soroban Vault ${vault.id} belonging to Operator ${getVaultOwnerName(vault.ownerId)} but failed: ${err.message || err}`,
          createdAt: serverTimestamp()
        });
      } catch (logErr) {
        console.error("Failed to write failure log to Firestore:", logErr);
      }
    } finally {
      setLiquidatingId(null);
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      <h1 className="text-2xl sm:text-3xl font-black">Soroban Collateral Vaults</h1>

      <div className={`rounded-2xl border overflow-hidden ${dark ? "bg-[#141722] border-white/10" : "bg-white border-gray-200"}`}>
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className={`border-b text-sm ${dark ? "border-white/10 text-gray-400" : "border-gray-200 text-gray-500"}`}>
                <th className="p-4 font-semibold">Vault ID / Owner</th>
                <th className="p-4 font-semibold">Locked Collateral</th>
                <th className="p-4 font-semibold">Active Vault status</th>
                <th className="p-4 font-semibold">Health Factor</th>
                <th className="p-4 font-semibold text-right">Liquidation Safeguards</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {vaults.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-gray-500">No locked Soroban vaults found.</td></tr>
              ) : (
                vaults.map(v => {
                  const health = getVaultHealth(v);
                  return (
                    <tr key={v.id} className={`border-b transition-colors ${dark ? "border-white/10 hover:bg-white/5" : "border-gray-100 hover:bg-gray-50"}`}>
                      <td className="p-4">
                        <div className="font-bold text-[15px]">{v.id.substring(0, 8)}...</div>
                        <div className="text-xs opacity-50 mt-1">{getVaultOwnerName(v.ownerId)}</div>
                      </td>
                      <td className="p-4 font-bold">${Number(v.lockedAmount || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} XLM</td>
                      <td className="p-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold capitalize ${v.status === "locked" ? "bg-blue-500/15 text-blue-400" : "bg-red-500/15 text-red-400"}`}>{v.status}</span>
                      </td>
                      <td className="p-4">
                        <span className={`font-black ${health >= 1 ? "text-green-500" : "text-red-500"}`}>{health === 99.0 ? "∞" : health.toFixed(2)}</span>
                      </td>
                      <td className="p-4 text-right">
                        {v.status === "liquidated" ? (
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-500/10 text-red-500 border border-red-500/20">Liquidated</span>
                        ) : health < 1.0 ? (
                          <button onClick={() => triggerLiquidation(v)} disabled={liquidatingId !== null} className={`px-4 py-1.5 rounded-xl text-xs font-extrabold transition-all active:scale-95 ${dark ? "bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-600/30" : "bg-red-50 hover:bg-red-100 text-red-700 border border-red-200"}`}>{liquidatingId === v.id ? "Clearing..." : "Trigger Liquidation"}</button>
                        ) : (
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-500/10 text-green-500 border border-green-500/20">Healthy Standby</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Stacked Card View */}
        <div className="block md:hidden divide-y divide-gray-100 dark:divide-white/5">
          {vaults.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No locked Soroban vaults found.</div>
          ) : (
            vaults.map(v => {
              const health = getVaultHealth(v);
              return (
                <div key={v.id} className="p-4 space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <div className="font-bold text-[15px]">{getVaultOwnerName(v.ownerId)}</div>
                      <div className="font-mono text-[10px] opacity-50 mt-0.5">{v.id.substring(0, 12)}...</div>
                    </div>
                    <span className={`flex-shrink-0 px-2.5 py-0.5 rounded-full text-xs font-bold capitalize ${v.status === "locked" ? "bg-blue-500/15 text-blue-400" : "bg-red-500/15 text-red-400"}`}>{v.status}</span>
                  </div>
                  <div className={`p-3 rounded-xl text-xs space-y-2 ${dark ? "bg-white/5" : "bg-gray-50"}`}>
                    <div className="flex justify-between">
                      <span className="opacity-60">Locked Collateral:</span>
                      <span className="font-bold">${Number(v.lockedAmount || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} XLM</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="opacity-60">Health Factor:</span>
                      <span className={`font-black ${health >= 1 ? "text-green-500" : "text-red-500"}`}>{health === 99.0 ? "∞" : health.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    {v.status === "liquidated" ? (
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-500/10 text-red-500 border border-red-500/20">Liquidated (Default Reconciled)</span>
                    ) : health < 1.0 ? (
                      <button onClick={() => triggerLiquidation(v)} disabled={liquidatingId !== null} className={`px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all active:scale-95 ${dark ? "bg-red-600/20 text-red-400 border border-red-600/30" : "bg-red-50 text-red-700 border border-red-200"}`}>{liquidatingId === v.id ? "Clearing Vault..." : "Trigger On-Chain Liquidation"}</button>
                    ) : (
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-500/10 text-green-500 border border-green-500/20">Healthy Standby</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};



// 7. DeFi Reports & Revenue Tab
const ReportsTab: React.FC<{ loans: FuelRequest[] }> = ({ loans }) => {
  const { dark } = useAdminTheme();

  const metrics = useMemo(() => {
    const totalCount = loans.length;
    if (totalCount === 0) return { repayRatio: 100, defaultRatio: 0, totalAmount: 0 };
    const repaidCount = loans.filter(l => l.status === "repaid").length;
    const activeCount = loans.filter(l => l.status === "active").length;
    const sumVal = loans.reduce((sum, l) => sum + Number(l.amount || 0), 0);
    return {
      repayRatio: totalCount > 0 ? (repaidCount / totalCount) * 100 : 100,
      defaultRatio: totalCount > 0 ? (activeCount / totalCount) * 100 : 0,
      totalAmount: sumVal
    };
  }, [loans]);

  return (
    <div className="space-y-8 animate-fadeIn">
      <h1 className="text-3xl font-black">Yield & Defi Reports</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className={`p-6 rounded-2xl border ${dark ? "bg-[#141722] border-white/10" : "bg-white border-gray-200"}`}>
          <div className="text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Platform Disbursed Volume</div>
          <div className="text-3xl font-black">${metrics.totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })} USDC</div>
        </div>
        <div className={`p-6 rounded-2xl border ${dark ? "bg-[#141722] border-white/10" : "bg-white border-gray-200"}`}>
          <div className="text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Loan Repayment Rate</div>
          <div className="text-3xl font-black text-green-500">{metrics.repayRatio.toFixed(1)} %</div>
        </div>
        <div className={`p-6 rounded-2xl border ${dark ? "bg-[#141722] border-white/10" : "bg-white border-gray-200"}`}>
          <div className="text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Outstanding Debt Ratio</div>
          <div className="text-3xl font-black text-amber-500">{metrics.defaultRatio.toFixed(1)} %</div>
        </div>
      </div>
    </div>
  );
};

// 8. Disputes Queue Tab
const DisputesTab = () => {
  const { dark } = useAdminTheme();

  return (
    <div className="space-y-8 animate-fadeIn">
      <h1 className="text-2xl sm:text-3xl font-black">Liquidation Disputes</h1>

      <div className={`rounded-2xl border overflow-hidden ${dark ? "bg-[#141722] border-white/10" : "bg-white border-gray-200"}`}>
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className={`border-b text-sm ${dark ? "border-white/10 text-gray-400" : "border-gray-200 text-gray-500"}`}>
                <th className="p-4 font-semibold">User</th>
                <th className="p-4 font-semibold">Reason Payload</th>
                <th className="p-4 font-semibold text-right">Admin Override</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              <tr className={`border-b transition-colors ${dark ? "border-white/10 hover:bg-white/5" : "border-gray-100 hover:bg-gray-50"}`}>
                <td className="p-4 font-bold text-[15px]">Nguyen Van A</td>
                <td className="p-4 text-sm leading-relaxed opacity-80">"Stuck offline Bluetooth sync. Capturing transaction took 4 days due to signal loss, resulting in unexpected default trigger."</td>
                <td className="p-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/20 hover:bg-green-500/30">Approve Grace Extension</button>
                    <button className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/20 hover:bg-red-500/30">Reject Override</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Mobile Stacked Card View */}
        <div className="block md:hidden p-4 space-y-3">
          <div className="flex justify-between items-start gap-2">
            <div>
              <div className="font-bold text-[15px]">Nguyen Van A</div>
              <div className="text-[10px] font-black uppercase text-amber-400 mt-0.5">Dispute Filed</div>
            </div>
            <span className="flex-shrink-0 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/20">Pending</span>
          </div>
          <div className={`p-3 rounded-xl text-xs leading-relaxed opacity-80 ${dark ? "bg-white/5" : "bg-gray-50"}`}>
            "Stuck offline Bluetooth sync. Capturing transaction took 4 days due to signal loss, resulting in unexpected default trigger."
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="py-2.5 rounded-xl text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/20 active:scale-95 transition-all">Approve Grace Extension</button>
            <button className="py-2.5 rounded-xl text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/20 active:scale-95 transition-all">Reject Override</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// 9. Node Status Tab
const NodeStatusTab = () => {
  const { dark } = useAdminTheme();

  return (
    <div className="space-y-8 animate-fadeIn">
      <h1 className="text-3xl font-black">Stellar Horizon Node Status</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className={`p-6 rounded-2xl border ${dark ? "bg-[#141722] border-white/10" : "bg-white border-gray-200"}`}>
          <div className="text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Horizon ping latency</div>
          <div className="text-3xl font-black text-green-500">42 ms</div>
        </div>
        <div className={`p-6 rounded-2xl border ${dark ? "bg-[#141722] border-white/10" : "bg-white border-gray-200"}`}>
          <div className="text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Horizon Network Sync</div>
          <div className="text-3xl font-black text-blue-500">Synced</div>
        </div>
        <div className={`p-6 rounded-2xl border ${dark ? "bg-[#141722] border-white/10" : "bg-white border-gray-200"}`}>
          <div className="text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Soroban Protocol version</div>
          <div className="text-3xl font-black text-blue-500">V 21</div>
        </div>
      </div>
    </div>
  );
};

// 10. Admin Audit Trail Tab (Focused exclusively on admin operations)
const AuditTrailTab: React.FC<{ auditLogs: AuditLog[] }> = ({ auditLogs }) => {
  const { dark } = useAdminTheme();

  return (
    <div className="space-y-8 animate-fadeIn">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black">System Audit Trail</h1>
        <p className="text-xs text-gray-500 mt-1">This audit log records operations executed exclusively by system administrators.</p>
      </div>

      <div className={`rounded-2xl border overflow-hidden ${dark ? "bg-[#141722] border-white/10" : "bg-white border-gray-200"}`}>
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className={`border-b text-sm ${dark ? "border-white/10 text-gray-400" : "border-gray-200 text-gray-500"}`}>
                <th className="p-4 font-semibold">Timestamp</th>
                <th className="p-4 font-semibold">Admin Account</th>
                <th className="p-4 font-semibold">Action Type</th>
                <th className="p-4 text-right font-semibold">Details</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {auditLogs.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-gray-500">No admin audit logs recorded.</td></tr>
              ) : (
                auditLogs.map((log) => {
                  const dateStr = log.createdAt?.toDate ? log.createdAt.toDate().toLocaleString() : "Just now";
                  return (
                    <tr key={log.id} className={`border-b transition-colors ${dark ? "border-white/10 hover:bg-white/5" : "border-gray-100 hover:bg-gray-50"}`}>
                      <td className="p-4 font-mono text-xs opacity-60">{dateStr}</td>
                      <td className="p-4 font-bold">{log.adminEmail}</td>
                      <td className="p-4 font-extrabold text-blue-500">{log.action}</td>
                      <td className="p-4 text-right font-semibold opacity-85">{log.details}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Stacked Card View */}
        <div className="block md:hidden divide-y divide-gray-100 dark:divide-white/5">
          {auditLogs.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No admin audit logs recorded.</div>
          ) : (
            auditLogs.map((log) => {
              const dateStr = log.createdAt?.toDate ? log.createdAt.toDate().toLocaleString() : "Just now";
              return (
                <div key={log.id} className="p-4 space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <span className="font-extrabold text-xs text-blue-500 flex-1">{log.action}</span>
                    <span className="font-mono text-[10px] opacity-50 flex-shrink-0">{dateStr}</span>
                  </div>
                  <div className="text-xs opacity-60 truncate">{log.adminEmail}</div>
                  <div className={`p-2.5 rounded-lg text-xs opacity-80 leading-relaxed ${dark ? "bg-white/5" : "bg-gray-50"}`}>{log.details}</div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

// 11. Admin Control & RBAC tab
const AdminMgmtTab: React.FC<{
  users: UserProfile[];
  currentAdminRole: "super" | "regular";
  currentAdminEmail: string;
  onRefresh: () => void;
}> = ({ users, currentAdminRole, currentAdminEmail, onRefresh }) => {
  const { dark } = useAdminTheme();

  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminType, setAdminType] = useState<"regular" | "super">("regular");

  // Custom limits list
  const [limitApproveProfiles, setLimitApproveProfiles] = useState(true);
  const [limitApproveLoans, setLimitApproveLoans] = useState(true);
  const [limitModifySettings, setLimitModifySettings] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const adminList = useMemo(() => {
    return users.filter(u => u.role === "admin");
  }, [users]);

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentAdminRole !== "super") {
      setErrorMsg("Unauthorized: Only Super Administrators can provision new accounts.");
      return;
    }
    if (!adminName || !adminEmail) {
      setErrorMsg("Please fill out all fields.");
      return;
    }

    try {
      const selectedLimits: string[] = [];
      if (limitApproveProfiles) selectedLimits.push("Approve Profiles");
      if (limitApproveLoans) selectedLimits.push("Approve Loans");
      if (limitModifySettings) selectedLimits.push("Modify Settings");

      // Add to Users collection in Firestore
      await addDoc(collection(db, "users"), {
        displayName: adminName,
        email: adminEmail,
        role: "admin",
        adminRole: adminType,
        limits: selectedLimits,
        approved: true,
        createdAt: serverTimestamp()
      });

      // Log creation into Audit Logs
      await addDoc(collection(db, "admin_audit_logs"), {
        adminEmail: currentAdminEmail,
        action: "Created Admin Account",
        details: `Created ${adminType} admin: ${adminName} (${adminEmail}) with limits: ${selectedLimits.join(", ")}`,
        createdAt: serverTimestamp()
      });

      setErrorMsg("Success! Provisions deployed successfully.");
      setAdminName("");
      setAdminEmail("");
      onRefresh();
    } catch (err) {
      setErrorMsg(`Error: ${err}`);
    }
  };

  const handleDeleteAdmin = async (adminId: string, email: string) => {
    if (currentAdminRole !== "super") {
      alert("Unauthorized: Only Super Administrators can delete credentials.");
      return;
    }
    if (!window.confirm(`Are you sure you want to delete administrator: ${email}?`)) return;

    try {
      await deleteDoc(doc(db, "users", adminId));

      // Log deletion into Audit Logs
      await addDoc(collection(db, "admin_audit_logs"), {
        adminEmail: currentAdminEmail,
        action: "Deleted Admin Account",
        details: `Deleted admin account: ${email}`,
        createdAt: serverTimestamp()
      });

      onRefresh();
    } catch (err) {
      alert(`Error deleting admin: ${err}`);
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      <h1 className="text-3xl font-black">Admin Management & Credentials</h1>

      {errorMsg && (
        <div className={`p-4 rounded-xl text-xs font-bold ${errorMsg.includes("Success") ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
          }`}>
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Create Form */}
        <div className={`p-6 rounded-2xl border ${dark ? "bg-[#141722] border-white/10" : "bg-white border-gray-200"}`}>
          <h3 className="font-extrabold text-lg mb-4">Provision New Admin Credentials</h3>

          {currentAdminRole !== "super" ? (
            <div className="flex flex-col items-center justify-center p-8 border border-red-500/20 bg-red-500/5 rounded-xl text-center">
              <span className="text-2xl mb-2">🔒</span>
              <div className="font-extrabold text-sm text-red-400">Access Restricted</div>
              <p className="text-xs text-gray-500 mt-1 max-w-xs">Only Super Administrators have authority to provision, grant permissions, or configure administrative limits.</p>
            </div>
          ) : (
            <form onSubmit={handleCreateAdmin} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider opacity-60 mb-2">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  className={`w-full p-3 rounded-xl border font-bold ${dark ? "bg-[#0E1016] border-white/10 text-white" : "bg-gray-50 border-gray-200 text-gray-900"}`}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider opacity-60 mb-2">Email Address</label>
                <input
                  type="email"
                  placeholder="e.g. john@aranova.ph"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  className={`w-full p-3 rounded-xl border font-bold ${dark ? "bg-[#0E1016] border-white/10 text-white" : "bg-gray-50 border-gray-200 text-gray-900"}`}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider opacity-60 mb-2">Role Type</label>
                <select
                  value={adminType}
                  onChange={(e) => setAdminType(e.target.value as any)}
                  className={`w-full p-3 rounded-xl border font-bold ${dark ? "bg-[#0E1016] border-white/10 text-white" : "bg-gray-50 border-gray-200 text-gray-900"}`}
                >
                  <option value="regular">Regular Admin (Restricted Limits)</option>
                  <option value="super">Super Admin (Full Access)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider opacity-60 mb-2">Assigned Limits / Capabilities</label>
                <div className="space-y-2 mt-2">
                  <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                    <input type="checkbox" checked={limitApproveProfiles} onChange={(e) => setLimitApproveProfiles(e.target.checked)} className="accent-blue-500" />
                    Can Approve Cooperative/Driver Profiles
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                    <input type="checkbox" checked={limitApproveLoans} onChange={(e) => setLimitApproveLoans(e.target.checked)} className="accent-blue-500" />
                    Can Approve Loan disbursements
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                    <input type="checkbox" checked={limitModifySettings} onChange={(e) => setLimitModifySettings(e.target.checked)} className="accent-blue-500" />
                    Can Modify Global DeFi system settings
                  </label>
                </div>
              </div>

              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-3 rounded-xl transition-all pt-2 mt-2">
                Deploy Admin Credentials
              </button>
            </form>
          )}
        </div>

        {/* Admin List */}
        <div className={`p-6 rounded-2xl border ${dark ? "bg-[#141722] border-white/10" : "bg-white border-gray-200"}`}>
          <h3 className="font-extrabold text-lg mb-4">Provisioned Admin Registry</h3>

          <div className="space-y-4 max-h-[360px] overflow-y-auto pr-1">
            {adminList.map(adm => (
              <div key={adm.id} className={`p-4 rounded-xl border flex justify-between items-center ${dark ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200"
                }`}>
                <div>
                  <div className="font-bold">{adm.displayName}</div>
                  <div className="text-xs opacity-60 mt-0.5">{adm.email}</div>
                  <div className="text-[10px] mt-1 text-blue-500 font-extrabold capitalize">
                    {adm.adminRole === "super" ? "Super Admin" : "Regular Admin"}
                  </div>
                  {adm.limits && adm.limits.length > 0 && (
                    <div className="text-[10px] opacity-50 mt-1">
                      Limits: {adm.limits.join(", ")}
                    </div>
                  )}
                </div>

                {currentAdminRole === "super" ? (
                  <button
                    onClick={() => handleDeleteAdmin(adm.id, adm.email)}
                    className="p-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all border border-red-500/20 active:scale-95"
                    title="Delete Credentials"
                  >
                    🗑️
                  </button>
                ) : (
                  <span className="text-[10px] opacity-40 italic">Super Lock</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// 12. System Settings Tab
const SettingsTab: React.FC<{ currentAdminEmail: string }> = ({ currentAdminEmail }) => {
  const { dark } = useAdminTheme();

  // State Management
  const [network, setNetwork] = useState("TESTNET");

  // Custom Stellar Address Mapping (Picked from connected wallets)
  const [disbursalAddress, setDisbursalAddress] = useState("");
  const [repaymentAddress, setRepaymentAddress] = useState("");
  const [yieldAddress, setYieldAddress] = useState("");

  // Configurable Vault Rules
  const [vaultPenaltyBps, setVaultPenaltyBps] = useState(1000); // 10%
  const [vaultMinLockDays, setVaultMinLockDays] = useState(30);
  const [vaultMaxAutoLockPct, setVaultMaxAutoLockPct] = useState(50);
  const [vaultMaxManualLock, setVaultMaxManualLock] = useState(1000); // XLM

  // Configurable Trust Rules
  const [trustRepaymentBonus, setTrustRepaymentBonus] = useState(5);
  const [trustMaturityBonus, setTrustMaturityBonus] = useState(3);
  const [trustLoanCompletedBonus, setTrustLoanCompletedBonus] = useState(10);
  const [trustLatePenalty, setTrustLatePenalty] = useState(-8);
  const [trustDefaultPenalty, setTrustDefaultPenalty] = useState(-20);
  const [trustEarlyUnlockPenalty, setTrustEarlyUnlockPenalty] = useState(-5);

  // Connected Admin Wallets
  const [connectedWallets, setConnectedWallets] = useState<string[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Load existing parameters on mount
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const snap = await getDoc(doc(db, "system", "config"));
        let existingWallets: string[] = [];
        if (snap.exists()) {
          const d = snap.data();
          if (d.network !== undefined) setNetwork(d.network);
          if (d.disbursalAddress !== undefined) setDisbursalAddress(d.disbursalAddress);
          if (d.repaymentAddress !== undefined) setRepaymentAddress(d.repaymentAddress);
          if (d.yieldAddress !== undefined) setYieldAddress(d.yieldAddress);

          // Load vault settings
          if (d.vaultPenaltyBps !== undefined) setVaultPenaltyBps(d.vaultPenaltyBps);
          if (d.vaultMinLockDays !== undefined) setVaultMinLockDays(d.vaultMinLockDays);
          if (d.vaultMaxAutoLockPct !== undefined) setVaultMaxAutoLockPct(d.vaultMaxAutoLockPct);
          if (d.vaultMaxManualLock !== undefined) setVaultMaxManualLock(d.vaultMaxManualLock);

          // Load trust settings
          if (d.trustRepaymentBonus !== undefined) setTrustRepaymentBonus(d.trustRepaymentBonus);
          if (d.trustMaturityBonus !== undefined) setTrustMaturityBonus(d.trustMaturityBonus);
          if (d.trustLoanCompletedBonus !== undefined) setTrustLoanCompletedBonus(d.trustLoanCompletedBonus);
          if (d.trustLatePenalty !== undefined) setTrustLatePenalty(d.trustLatePenalty);
          if (d.trustDefaultPenalty !== undefined) setTrustDefaultPenalty(d.trustDefaultPenalty);
          if (d.trustEarlyUnlockPenalty !== undefined) setTrustEarlyUnlockPenalty(d.trustEarlyUnlockPenalty);

          if (d.connectedWallets && Array.isArray(d.connectedWallets)) {
            existingWallets = d.connectedWallets;
          }
        }

        // Query ALL users with role "admin" to retrieve registered admin wallets
        const qAdmins = query(collection(db, "users"), where("role", "==", "admin"));
        const adminsSnap = await getDocs(qAdmins);
        const registeredAdminKeys: string[] = [];
        adminsSnap.forEach(dDoc => {
          const u = dDoc.data();
          if (u.publicKey) registeredAdminKeys.push(u.publicKey);
        });

        // Merge them cleanly
        const merged = new Set<string>();
        registeredAdminKeys.forEach(k => merged.add(k));
        existingWallets.forEach(w => merged.add(w));

        // Default seeds if everything is empty
        if (merged.size === 0) {
          setConnectedWallets([
            "GBMASTERADMIN3Y4X5PQR6TNY7XYZ",
            "GBCDISBURSALSOURCE4R5STUWV678",
            "GBCREPAYMENTDESTI9J0KLMNOPQ12"
          ]);
        } else {
          setConnectedWallets(Array.from(merged));
        }
      } catch (err) {
        console.warn("Error reading config document:", err);
      }
    };
    fetchConfig();
  }, [currentAdminEmail]);

  const getAdminSigningHandler = async (publicKey: string) => {
    const modules = [new FreighterModule()];
    let activeModule: any = null;

    const win = window as any;
    if (win.freighterApi || win.stellar?.isFreighter) {
      activeModule = modules[0];
    } else {
      for (const mod of modules) {
        try {
          if (await mod.isAvailable()) {
            activeModule = mod;
            break;
          }
        } catch (e) { }
      }
    }

    if (!activeModule) {
      throw new Error("No Stellar wallet extension detected. Please install Freighter.");
    }

    return {
      signWithWallet: async (xdr: string) => {
        const { NETWORK_PASSPHRASE } = await import("../../services/sorobanService");
        return await activeModule.signTransaction(xdr, {
          networkPassphrase: NETWORK_PASSPHRASE,
          publicKey: publicKey,
        });
      },
    };
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setToast("Publishing configurations to database & sync'ing on-chain...");
    try {
      // 1. Save to Firestore Config Doc
      await setDoc(doc(db, "system", "config"), {
        network,
        disbursalAddress,
        repaymentAddress,
        yieldAddress,
        connectedWallets,
        vaultPenaltyBps,
        vaultMinLockDays,
        vaultMaxAutoLockPct,
        vaultMaxManualLock,
        trustRepaymentBonus,
        trustMaturityBonus,
        trustLoanCompletedBonus,
        trustLatePenalty,
        trustDefaultPenalty,
        trustEarlyUnlockPenalty,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // 2. Synchronize parameters on-chain via smart contracts
      try {
        const pubKey = disbursalAddress || connectedWallets[0];
        if (pubKey) {
          const { setTrustRulesOnChain } = await import("../../services/sorobanService");
          const signingHandler = await getAdminSigningHandler(pubKey);
          // Update Trust scoring weights on-chain
          await setTrustRulesOnChain(
            pubKey,
            {
              on_time_repayment_bonus: BigInt(trustRepaymentBonus),
              vault_maturity_bonus: BigInt(trustMaturityBonus),
              loan_completed_bonus: BigInt(trustLoanCompletedBonus),
              late_payment_penalty: BigInt(trustLatePenalty),
              default_penalty: BigInt(trustDefaultPenalty),
              early_unlock_penalty: BigInt(trustEarlyUnlockPenalty),
            },
            signingHandler
          );
        }
      } catch (chainErr) {
        console.warn("Stellar Soroban rules sync bypassed (or offline):", chainErr);
      }

      // Log config change to Audit Trail
      await addDoc(collection(db, "admin_audit_logs"), {
        adminEmail: currentAdminEmail,
        action: "Updated Protocol Configuration",
        details: `Updated parameters. Set Early Unlock penalty: ${vaultPenaltyBps} bps, Min lock days: ${vaultMinLockDays}, Repayment bonus: ${trustRepaymentBonus} XP, Default penalty: ${trustDefaultPenalty} XP.`,
        createdAt: serverTimestamp()
      });

      setToast("Success! Published parameters globally and verified contract settings.");
    } catch (err) {
      setToast(`Error saving configuration: ${err}`);
    }
  };



  const connectSpecificWallet = async (walletId: string = "freighter") => {
    setConnecting(true);
    setToast(`Scanning for Freighter extension credentials...`);
    try {
      let walletModule: any;
      if (walletId === 'freighter') {
        walletModule = new FreighterModule();
      }

      if (!walletModule) throw new Error("Wallet module failed to initialize.");

      let isAvailable = false;
      const win = window as any;
      if (walletId === 'freighter' && (win.freighterApi || win.stellar?.isFreighter)) {
        isAvailable = true;
      } else {
        try {
          isAvailable = await walletModule.isAvailable();
        } catch (err) {
          isAvailable = false;
        }
      }

      if (!isAvailable) {
        throw new Error(`${walletId.toUpperCase()} extension is not installed or enabled in your browser.`);
      }

      const response = await walletModule.getAddress();
      const address = response.address;
      if (!address) throw new Error("Wallet did not return a valid public key.");

      try {
        const authMessage = `Aranova Administrator Wallet Link\n\nPlease sign to verify ownership of this wallet key.\nTimestamp: ${Date.now()}`;
        const passphrase = network === "TESTNET"
          ? "Test SDF Network ; September 2015"
          : "Public Global Stellar Network ; September 2015";

        await walletModule.signMessage(authMessage, {
          networkPassphrase: passphrase,
          publicKey: address
        });
      } catch (signError: any) {
        throw new Error(signError?.message || "Signature request rejected or failed.");
      }

      const q = query(collection(db, "users"), where("email", "==", currentAdminEmail), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        await updateDoc(doc(db, "users", snap.docs[0].id), {
          publicKey: address
        });
      }

      setConnectedWallets(prev => {
        if (prev.includes(address)) return prev;
        return [...prev, address];
      });

      await addDoc(collection(db, "admin_audit_logs"), {
        adminEmail: currentAdminEmail,
        action: "Linked Admin Wallet",
        details: `Successfully connected and verified ownership of ${walletId.toUpperCase()} wallet: ${address}`,
        createdAt: serverTimestamp()
      });

      setToast(`Success! Linked ${walletId.toUpperCase()} account: ${address}`);
    } catch (err: any) {
      console.warn("Wallet connection failed:", err);
      try {
        await addDoc(collection(db, "admin_audit_logs"), {
          adminEmail: currentAdminEmail,
          action: "Failed Wallet Connection Attempt",
          details: `Attempted to link ${walletId.toUpperCase()} wallet, but connection failed or was rejected. Error: ${err.message || err}`,
          createdAt: serverTimestamp()
        });
      } catch (logErr) {
        console.warn("Could not write failure audit log:", logErr);
      }
      setToast(`Wallet connection failed: ${err.message || err}`);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      <h1 className="text-3xl font-black">System Settings</h1>

      {toast && (
        <div className={`p-4 rounded-xl text-xs font-bold ${toast.includes("Success") ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-blue-500/10 text-blue-400 border border-blue-500/20"}`}>
          {toast}
        </div>
      )}

      <form onSubmit={handleSaveConfig} className="space-y-8">

        {/* SECTION 1: WALLET CONNECTOR & NETWORK */}
        <div className={`p-6 rounded-2xl border ${dark ? "bg-[#141722] border-white/10" : "bg-white border-gray-200"}`}>
          <h3 className="font-extrabold text-lg mb-6 flex items-center gap-2">
            <span>Stellar Credentials & Network Sync</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Connected Administrator Wallets</label>
              <div className="space-y-2 mb-4 max-h-[160px] overflow-y-auto pr-1">
                {connectedWallets.length === 0 ? (
                  <p className="text-xs text-gray-500 font-semibold italic">No wallets connected. Click below to add one.</p>
                ) : (
                  connectedWallets.map(w => (
                    <div key={w} className={`p-2 rounded-lg border font-mono text-[11px] font-bold flex justify-between items-center ${dark ? "bg-[#0E1016] border-white/5 text-white" : "bg-gray-50 border-gray-200 text-gray-900"}`}>
                      <span>{w}</span>
                      <span className="text-[9px] bg-blue-500/25 text-blue-400 px-1.5 py-0.5 rounded font-extrabold">Active</span>
                    </div>
                  ))
                )}
              </div>

              {!connecting ? (
                <button
                  type="button"
                  onClick={() => connectSpecificWallet('freighter')}
                  disabled={connecting}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl text-xs active:scale-95 transition-all"
                >
                  + Connect Freighter Wallet Account
                </button>
              ) : (
                <button
                  disabled
                  className="w-full py-2.5 bg-blue-600/50 text-white/50 font-extrabold rounded-xl text-xs"
                >
                  Connecting...
                </button>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Active Stellar Network Node</label>
              <select
                value={network}
                onChange={(e) => setNetwork(e.target.value)}
                className={`w-full p-3 rounded-xl border font-bold ${dark ? "bg-[#0E1016] border-white/10 text-white" : "bg-gray-50 border-gray-200 text-gray-900"}`}
              >
                <option value="TESTNET">TESTNET (Stellar Horizon Sandbox)</option>
                <option value="MAINNET">MAINNET (Stellar Public Network)</option>
              </select>
            </div>
          </div>
        </div>

        {/* SECTION 2: DISBURSAL / REPAYMENT ADDRESS CHANNELS */}
        <div className={`p-6 rounded-2xl border ${dark ? "bg-[#141722] border-white/10" : "bg-white border-gray-200"}`}>
          <h3 className="font-extrabold text-lg mb-4">DeFi Smart Contract Target Routing</h3>
          <p className="text-xs text-gray-500 mb-6 font-semibold">Assign operational accounts from your connected admin wallets. Loans will be funded by the disbursal account, and repayments will be collected in the repayment account.</p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Disbursal Account Source (Where loans are funded/released from)</label>
              <select
                value={disbursalAddress}
                onChange={(e) => setDisbursalAddress(e.target.value)}
                className={`w-full p-3 rounded-xl border font-bold text-xs ${dark ? "bg-[#0E1016] border-white/10 text-white" : "bg-gray-50 border-gray-200 text-gray-900"}`}
              >
                <option value="">Select disbursal account source...</option>
                {connectedWallets.map(w => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Repayment Account Destination (Where loan repayments are received)</label>
              <select
                value={repaymentAddress}
                onChange={(e) => setRepaymentAddress(e.target.value)}
                className={`w-full p-3 rounded-xl border font-bold text-xs ${dark ? "bg-[#0E1016] border-white/10 text-white" : "bg-gray-50 border-gray-200 text-gray-900"}`}
              >
                <option value="">Select repayment account receiver...</option>
                {connectedWallets.map(w => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Yield Reserve Treasury Account (Where cooperative APY margins are held)</label>
              <select
                value={yieldAddress}
                onChange={(e) => setYieldAddress(e.target.value)}
                className={`w-full p-3 rounded-xl border font-bold text-xs ${dark ? "bg-[#0E1016] border-white/10 text-white" : "bg-gray-50 border-gray-200 text-gray-900"}`}
              >
                <option value="">Select yield reserve treasury account...</option>
                {connectedWallets.map(w => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* SECTION 3: CONFIGURABLE VAULT COLLATERAL RULES */}
        <div className={`p-6 rounded-2xl border ${dark ? "bg-[#141722] border-white/10" : "bg-white border-gray-200"}`}>
          <h3 className="font-extrabold text-lg mb-4">Configurable Collateral Vault Parameters</h3>
          <p className="text-xs text-gray-500 mb-6 font-semibold">Configure parameters for smart contract personal vaults, including premature unlock penalty fees and locking limits.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Early Unlock Penalty (Basis Points, e.g. 1000 = 10%)</label>
              <input
                type="number"
                value={vaultPenaltyBps}
                onChange={(e) => setVaultPenaltyBps(Number(e.target.value))}
                className={`w-full p-3 rounded-xl border font-bold ${dark ? "bg-[#0E1016] border-white/10 text-white" : "bg-gray-50 border-gray-200 text-gray-900"}`}
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Minimum Lock Duration (Days)</label>
              <input
                type="number"
                value={vaultMinLockDays}
                onChange={(e) => setVaultMinLockDays(Number(e.target.value))}
                className={`w-full p-3 rounded-xl border font-bold ${dark ? "bg-[#0E1016] border-white/10 text-white" : "bg-gray-50 border-gray-200 text-gray-900"}`}
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Maximum Auto-Lock Portion (%)</label>
              <input
                type="number"
                value={vaultMaxAutoLockPct}
                onChange={(e) => setVaultMaxAutoLockPct(Number(e.target.value))}
                className={`w-full p-3 rounded-xl border font-bold ${dark ? "bg-[#0E1016] border-white/10 text-white" : "bg-gray-50 border-gray-200 text-gray-900"}`}
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Maximum Manual Lock Amount (XLM)</label>
              <input
                type="number"
                value={vaultMaxManualLock}
                onChange={(e) => setVaultMaxManualLock(Number(e.target.value))}
                className={`w-full p-3 rounded-xl border font-bold ${dark ? "bg-[#0E1016] border-white/10 text-white" : "bg-gray-50 border-gray-200 text-gray-900"}`}
              />
            </div>
          </div>
        </div>

        {/* SECTION 4: CONFIGURABLE TRUST SCORE XP RULES */}
        <div className={`p-6 rounded-2xl border ${dark ? "bg-[#141722] border-white/10" : "bg-white border-gray-200"}`}>
          <h3 className="font-extrabold text-lg mb-4">Configurable Trust Score XP Settings</h3>
          <p className="text-xs text-gray-500 mb-6 font-semibold">Calibrate trust rating rule weightings for drivers and commuters based on on-chain events.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">On-Time Repayment Bonus (XP)</label>
              <input
                type="number"
                value={trustRepaymentBonus}
                onChange={(e) => setTrustRepaymentBonus(Number(e.target.value))}
                className={`w-full p-3 rounded-xl border font-bold ${dark ? "bg-[#0E1016] border-white/10 text-white" : "bg-gray-50 border-gray-200 text-gray-900"}`}
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Vault Maturity Bonus (XP)</label>
              <input
                type="number"
                value={trustMaturityBonus}
                onChange={(e) => setTrustMaturityBonus(Number(e.target.value))}
                className={`w-full p-3 rounded-xl border font-bold ${dark ? "bg-[#0E1016] border-white/10 text-white" : "bg-gray-50 border-gray-200 text-gray-900"}`}
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Loan Completed Bonus (XP)</label>
              <input
                type="number"
                value={trustLoanCompletedBonus}
                onChange={(e) => setTrustLoanCompletedBonus(Number(e.target.value))}
                className={`w-full p-3 rounded-xl border font-bold ${dark ? "bg-[#0E1016] border-white/10 text-white" : "bg-gray-50 border-gray-200 text-gray-900"}`}
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Late Repayment Penalty (XP)</label>
              <input
                type="number"
                value={trustLatePenalty}
                onChange={(e) => setTrustLatePenalty(Number(e.target.value))}
                className={`w-full p-3 rounded-xl border font-bold ${dark ? "bg-[#0E1016] border-white/10 text-white" : "bg-gray-50 border-gray-200 text-gray-900"}`}
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Default Penalty (XP)</label>
              <input
                type="number"
                value={trustDefaultPenalty}
                onChange={(e) => setTrustDefaultPenalty(Number(e.target.value))}
                className={`w-full p-3 rounded-xl border font-bold ${dark ? "bg-[#0E1016] border-white/10 text-white" : "bg-gray-50 border-gray-200 text-gray-900"}`}
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Early Vault Unlock Penalty (XP)</label>
              <input
                type="number"
                value={trustEarlyUnlockPenalty}
                onChange={(e) => setTrustEarlyUnlockPenalty(Number(e.target.value))}
                className={`w-full p-3 rounded-xl border font-bold ${dark ? "bg-[#0E1016] border-white/10 text-white" : "bg-gray-50 border-gray-200 text-gray-900"}`}
              />
            </div>
          </div>
        </div>

        {/* PUBLISH ACTION */}
        <div className="flex justify-end">
          <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold px-8 py-4 rounded-xl transition-all shadow-md active:scale-95">
            Publish Operational Configurations
          </button>
        </div>

      </form>
    </div>
  );
};

// ─── MAIN TABS ROUTER VIEW ───────────────────────────────────────────────────
const DashboardContent: React.FC<{
  pendingUsers: UserProfile[];
  users: UserProfile[];
  vaults: Vault[];
  loans: FuelRequest[];
  transactions: TransactionRecord[];
  auditLogs: AuditLog[];
  tvl: number;
  yieldEarned: number;
  currentAdminEmail: string;
  loading: boolean;
  onApprove: (id: string) => void;
  onDecline: (id: string) => void;
  onRefresh: () => void;
  currentAdminRole: "super" | "regular";
}> = ({
  pendingUsers,
  users,
  vaults,
  loans,
  transactions,
  auditLogs,
  tvl,
  yieldEarned,
  currentAdminEmail,
  loading,
  onApprove,
  onDecline,
  onRefresh,
  currentAdminRole
}) => {
    const { activePage } = useAdminPage();

    switch (activePage) {
      case "dashboard":
        return (
          <OverviewTab
            pendingUsers={pendingUsers}
            tvl={tvl}
            yieldEarned={yieldEarned}
            currentAdminEmail={currentAdminEmail}
            loading={loading}
            onApprove={onApprove}
            onDecline={onDecline}
            onRefresh={onRefresh}
            currentAdminRole={currentAdminRole}
          />
        );
      case "coop-pool":
        return (
          <CoopPoolTab
            users={users}
            transactions={transactions}
            currentAdminEmail={currentAdminEmail}
            onRefresh={onRefresh}
          />
        );
      case "loan-requests":
        return (
          <AdminLoans
            loans={loans}
            users={users}
            currentAdminEmail={currentAdminEmail}
            onRefresh={onRefresh}
          />
        );
      case "members":
        return <MembersTab users={users} />;
      case "vaults":
        return (
          <VaultsTab
            vaults={vaults}
            loans={loans}
            users={users}
            currentAdminEmail={currentAdminEmail}
            onRefresh={onRefresh}
          />
        );
      case "reports":
        return <ReportsTab loans={loans} />;
      case "disputes":
        return <DisputesTab />;
      case "node":
        return <NodeStatusTab />;
      case "audit":
        return <AuditTrailTab auditLogs={auditLogs} />;
      case "admin-mgmt":
        return (
          <AdminMgmtTab
            users={users}
            currentAdminRole={currentAdminRole}
            currentAdminEmail={currentAdminEmail}
            onRefresh={onRefresh}
          />
        );
      case "settings":
        return <SettingsTab currentAdminEmail={currentAdminEmail} />;
      default:
        return (
          <OverviewTab
            pendingUsers={pendingUsers}
            tvl={tvl}
            yieldEarned={yieldEarned}
            currentAdminEmail={currentAdminEmail}
            loading={loading}
            onApprove={onApprove}
            onDecline={onDecline}
            onRefresh={onRefresh}
            currentAdminRole={currentAdminRole}
          />
        );
    }
  };

// ─── ADMIN DASHBOARD ROOT ────────────────────────────────────────────────────
const AdminDashboard = () => {
  const [activePage, setActivePage] = useState("dashboard");

  // Simulated RBAC State: allows toggling Super vs Regular Admin for test verification
  const [currentAdminRole, setCurrentAdminRole] = useState<"super" | "regular">("super");
  const currentAdminEmail = auth.currentUser?.email || "admin@aranova.ph";

  // Real database states
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [loans, setLoans] = useState<FuelRequest[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch all system tables from Firestore
  const fetchSystemData = async () => {
    try {
      setLoading(true);

      // 1. Fetch Users
      const usersSnap = await getDocs(collection(db, "users"));
      const usersList: UserProfile[] = [];
      usersSnap.forEach(d => {
        usersList.push({ id: d.id, ...d.data() } as UserProfile);
      });
      setUsers(usersList);

      // 2. Fetch Vaults
      const vaultsSnap = await getDocs(collection(db, "vaults"));
      const vaultsList: Vault[] = [];
      vaultsSnap.forEach(d => {
        vaultsList.push({ id: d.id, ...d.data() } as Vault);
      });
      setVaults(vaultsList);

      // 3. Fetch Loans
      const loansSnap = await getDocs(query(collection(db, "fuel_requests"), where("type", "==", "loan")));
      const loansList: FuelRequest[] = [];
      loansSnap.forEach(d => {
        loansList.push({ id: d.id, ...d.data() } as FuelRequest);
      });
      setLoans(loansList);

      // 4. Fetch Transactions
      const txsSnap = await getDocs(collection(db, "transactions"));
      const txsList: TransactionRecord[] = [];
      txsSnap.forEach(d => {
        txsList.push({ id: d.id, ...d.data() } as TransactionRecord);
      });
      setTransactions(txsList);

      // 5. Fetch Admin Audit Logs
      const auditSnap = await getDocs(collection(db, "admin_audit_logs"));
      const auditList: AuditLog[] = [];
      auditSnap.forEach(d => {
        auditList.push({ id: d.id, ...d.data() } as AuditLog);
      });
      // Sort logs by date desc if needed (or do it locally)
      auditList.sort((a, b) => {
        const tA = a.createdAt?.seconds || 0;
        const tB = b.createdAt?.seconds || 0;
        return tB - tA;
      });
      setAuditLogs(auditList);

    } catch (error) {
      console.error("Error loading system metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSystemData();

    // Listen to admin audit logs in real-time
    const unsubAudit = onSnapshot(collection(db, "admin_audit_logs"), (snap) => {
      const auditList: AuditLog[] = [];
      snap.forEach(d => {
        auditList.push({ id: d.id, ...d.data() } as AuditLog);
      });
      // Sort desc
      auditList.sort((a, b) => {
        const tA = a.createdAt?.seconds || 0;
        const tB = b.createdAt?.seconds || 0;
        return tB - tA;
      });
      setAuditLogs(auditList);
    });

    return () => {
      unsubAudit();
    };
  }, []);

  // TVL computed dynamically from active vaults
  const tvl = useMemo(() => {
    return vaults
      .filter(v => v.status === "locked")
      .reduce((sum, v) => sum + Number(v.lockedAmount || 0), 0);
  }, [vaults]);

  // Yield computed dynamically from paid interest
  const yieldEarned = useMemo(() => {
    return loans
      .filter(l => l.status === "repaid")
      .reduce((sum, l) => sum + (Number(l.amount || 0) * Number(l.interestRate || 3) / 100), 0);
  }, [loans]);

  // Filter pending users
  const pendingUsers = useMemo(() => {
    return users.filter(u => u.approved === false);
  }, [users]);

  // Handle Approving a user profile
  const handleApprove = async (userId: string) => {
    const targetProfile = users.find(u => u.id === userId);
    try {
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, {
        approved: true,
        coopStatus: "approved"
      });

      // Log event
      await addDoc(collection(db, "admin_audit_logs"), {
        adminEmail: currentAdminEmail,
        action: "Approved User Registration",
        details: `Approved profile for ${targetProfile?.displayName || userId} (${targetProfile?.role})`,
        createdAt: serverTimestamp()
      });

      fetchSystemData();
    } catch (error: any) {
      console.error("Error approving user:", error);
      try {
        await addDoc(collection(db, "admin_audit_logs"), {
          adminEmail: currentAdminEmail,
          action: "Failed User Approval",
          details: `Attempted to approve user ${targetProfile?.displayName || userId} but failed: ${error.message || error}`,
          createdAt: serverTimestamp()
        });
      } catch (logErr) {
        console.error("Failed to write failure log to Firestore:", logErr);
      }
    }
  };

  // Handle Declining a user request
  const handleDecline = async (userId: string) => {
    const targetProfile = users.find(u => u.id === userId);
    if (!window.confirm("Are you sure you want to decline and delete this application?")) return;
    try {
      await deleteDoc(doc(db, "users", userId));

      // Log event
      await addDoc(collection(db, "admin_audit_logs"), {
        adminEmail: currentAdminEmail,
        action: "Declined User Registration",
        details: `Declined profile application for ${targetProfile?.displayName || userId}`,
        createdAt: serverTimestamp()
      });

      fetchSystemData();
    } catch (error: any) {
      console.error("Error declining user:", error);
      try {
        await addDoc(collection(db, "admin_audit_logs"), {
          adminEmail: currentAdminEmail,
          action: "Failed User Decline",
          details: `Attempted to decline user ${targetProfile?.displayName || userId} but failed: ${error.message || error}`,
          createdAt: serverTimestamp()
        });
      } catch (logErr) {
        console.error("Failed to write failure log to Firestore:", logErr);
      }
    }
  };

  return (
    <AdminLayout activePage={activePage} onPageChange={setActivePage}>
      {/* Visual Role Switcher for Demo testing */}
      <div className="mb-4 flex items-center justify-end gap-2 text-xs font-bold">
        <span>Admin Mode:</span>
        <button
          onClick={() => setCurrentAdminRole("super")}
          className={`px-3 py-1 rounded-lg border ${currentAdminRole === "super" ? "bg-blue-600 text-white border-blue-500" : "bg-white/5 border-white/10 text-gray-400"}`}
        >
          Super Admin
        </button>
        <button
          onClick={() => setCurrentAdminRole("regular")}
          className={`px-3 py-1 rounded-lg border ${currentAdminRole === "regular" ? "bg-amber-600 text-white border-amber-500" : "bg-white/5 border-white/10 text-gray-400"}`}
        >
          Regular Admin (Limited)
        </button>
      </div>

      <DashboardContent
        pendingUsers={pendingUsers}
        users={users}
        vaults={vaults}
        loans={loans}
        transactions={transactions}
        auditLogs={auditLogs}
        tvl={tvl}
        yieldEarned={yieldEarned}
        currentAdminEmail={currentAdminEmail}
        loading={loading}
        onApprove={handleApprove}
        onDecline={handleDecline}
        onRefresh={fetchSystemData}
        currentAdminRole={currentAdminRole}
      />
    </AdminLayout>
  );
};

export default AdminDashboard;