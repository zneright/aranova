import React, { useState } from "react";
import { useAdminTheme } from "../../contexts/AdminContext";
import { collection, addDoc, updateDoc, doc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase/config";
import { FreighterModule } from '@creit.tech/stellar-wallets-kit/modules/freighter';
import { xBullModule } from '@creit.tech/stellar-wallets-kit/modules/xbull';
import { LobstrModule } from '@creit.tech/stellar-wallets-kit/modules/lobstr';
import { submitStellarPayment, NETWORK_PASSPHRASE } from "../../services/sorobanService";

export interface FuelRequest {
  id: string;
  driverId: string;
  driverName: string;
  driverPublicKey?: string;
  coopId: string;
  amount: number;
  approvedAmount?: number;
  interestRate?: number;
  gracePeriodDays?: number;
  durationMonths?: number;
  monthlyRepayment?: number;
  status: string;
  purpose?: string;
}

export interface UserProfile {
  id: string;
  role: string;
  displayName: string;
  trustScore?: number;
  publicKey?: string;
}

const AdminLoans: React.FC<{
  loans: FuelRequest[];
  users: UserProfile[];
  currentAdminEmail: string;
  onRefresh: () => void;
}> = ({ loans, users, currentAdminEmail, onRefresh }) => {
  const { dark } = useAdminTheme();
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [reviewLoan, setReviewLoan] = useState<FuelRequest | null>(null);
  const [approvedAmount, setApprovedAmount] = useState("");
  const [monthlyRepayment, setMonthlyRepayment] = useState("");
  const [durationMonths, setDurationMonths] = useState("");
  const [interestRate, setInterestRate] = useState("");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newLoanDriverId, setNewLoanDriverId] = useState("");
  const [newLoanAmount, setNewLoanAmount] = useState("");
  const [newMonthlyRepayment, setNewMonthlyRepayment] = useState("");
  const [newDurationMonths, setNewDurationMonths] = useState("");
  const [newInterestRate, setNewInterestRate] = useState("");
  const [disbursingId, setDisbursingId] = useState<string | null>(null);

  const getDriverScore = (driverId: string) => {
    const profile = users.find(u => u.id === driverId);
    return profile?.trustScore ?? 0;
  };

  const handleCreateLoanOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLoanDriverId || !newLoanAmount) return;
    const driver = users.find(u => u.id === newLoanDriverId);
    if (!driver) return;

    try {
      await addDoc(collection(db, "fuel_requests"), {
        driverId: driver.id,
        driverName: driver.displayName,
        driverPublicKey: driver.publicKey || "",
        coopId: "admin", // Unused for admin loans, but kept for interface compliance
        type: "loan",
        amount: Number(newLoanAmount),
        approvedAmount: Number(newLoanAmount),
        monthlyRepayment: Number(newMonthlyRepayment || 0),
        durationMonths: Number(newDurationMonths || 1),
        interestRate: Number(newInterestRate || 0),
        status: "approved",
        approvedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
      
      await addDoc(collection(db, "admin_audit_logs"), {
        adminEmail: currentAdminEmail,
        action: "Issued Microloan Offer",
        details: `Issued new ${newLoanAmount} XLM loan offer to Driver ${driver.displayName} with repayment of ${newMonthlyRepayment} XLM/mo for ${newDurationMonths} months.`,
        createdAt: serverTimestamp()
      });

      setSuccessMsg(`Success! Issued new loan offer to ${driver.displayName}.`);
      setShowCreateModal(false);
      setNewLoanDriverId("");
      setNewLoanAmount("");
      setNewMonthlyRepayment("");
      setNewDurationMonths("");
      setNewInterestRate("");
      onRefresh();
    } catch (err: any) {
      try {
        await addDoc(collection(db, "admin_audit_logs"), {
          adminEmail: currentAdminEmail,
          action: "Failed Microloan Issue",
          details: `Attempted to issue new ${newLoanAmount} XLM loan offer to Driver ${driver.displayName} but failed: ${err.message || err}`,
          createdAt: serverTimestamp()
        });
      } catch (logErr) {
        console.error("Failed to write failure log to Firestore:", logErr);
      }
      setSuccessMsg(`Error creating offer: ${err}`);
    }
  };

  const openReview = (loan: FuelRequest) => {
    setReviewLoan(loan);
    setApprovedAmount(String(loan.amount));
    setMonthlyRepayment("");
    setDurationMonths("");
    setInterestRate("");
  };

  const handleIssueOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewLoan) return;

    setSuccessMsg(`Issuing loan offer for ${approvedAmount} XLM...`);
    try {
      await updateDoc(doc(db, "fuel_requests", reviewLoan.id), {
        status: "approved",
        approvedAmount: Number(approvedAmount),
        monthlyRepayment: Number(monthlyRepayment || 0),
        durationMonths: Number(durationMonths || 1),
        interestRate: Number(interestRate || 0),
        approvedAt: serverTimestamp()
      });

      await addDoc(collection(db, "admin_audit_logs"), {
        adminEmail: currentAdminEmail,
        action: "Issued Microloan Offer",
        details: `Issued ${approvedAmount} XLM loan offer to Driver ${reviewLoan.driverName} with repayment of ${monthlyRepayment} XLM/mo for ${durationMonths} months.`,
        createdAt: serverTimestamp()
      });

      setSuccessMsg(`Success! Issued custom loan offer to ${reviewLoan.driverName}. Waiting for driver acceptance.`);
      setReviewLoan(null);
      onRefresh();
    } catch (err: any) {
      try {
        await addDoc(collection(db, "admin_audit_logs"), {
          adminEmail: currentAdminEmail,
          action: "Failed Custom Microloan Issue",
          details: `Attempted to issue custom loan offer for ${approvedAmount} XLM to Driver ${reviewLoan.driverName} but failed: ${err.message || err}`,
          createdAt: serverTimestamp()
        });
      } catch (logErr) {
        console.error("Failed to write failure log to Firestore:", logErr);
      }
      setSuccessMsg(`Error: ${err}`);
    }
  };

  const getAdminSigningHandler = async (publicKey: string) => {
    const modules = [new FreighterModule(), new xBullModule(), new LobstrModule()];
    let activeModule: any = null;

    for (const mod of modules) {
      try {
        if (await mod.isAvailable()) {
          activeModule = mod;
          break;
        }
      } catch (e) { }
    }

    if (!activeModule) {
      throw new Error("No Stellar wallet extension detected. Please install Freighter, xBull, or Lobstr.");
    }

    return {
      signWithWallet: async (xdr: string) => {
        return await activeModule.signTransaction(xdr, {
          networkPassphrase: NETWORK_PASSPHRASE,
          publicKey: publicKey,
        });
      },
    };
  };

  const handleDisburse = async (loan: FuelRequest) => {
    setDisbursingId(loan.id);
    setSuccessMsg(`Initiating on-chain disbursal for ${loan.driverName}...`);
    try {
      const configSnap = await getDoc(doc(db, "system", "config"));
      const disbursalAddress = configSnap.data()?.disbursalAddress;
      if (!disbursalAddress) {
        throw new Error("No Disbursal Wallet Address configured in System Settings.");
      }
      if (!loan.driverPublicKey) {
        throw new Error("Driver does not have a registered Stellar public key.");
      }

      const signerHandler = await getAdminSigningHandler(disbursalAddress);
      const amount = String(loan.approvedAmount || loan.amount);
      const txHash = await submitStellarPayment(disbursalAddress, loan.driverPublicKey, amount, signerHandler);

      await updateDoc(doc(db, "fuel_requests", loan.id), {
        status: "active",
        disbursedAt: serverTimestamp(),
        blockchainTxHash: txHash
      });

      await addDoc(collection(db, "transactions"), {
        type: "credit_release",
        from: disbursalAddress,
        to: loan.driverPublicKey,
        amount: Number(amount),
        status: "completed",
        blockchainTxHash: txHash,
        createdAt: serverTimestamp(),
      });

      setSuccessMsg(`Success! Funds disbursed. Tx Hash: ${txHash}`);
      onRefresh();
    } catch (err: any) {
      console.error(err);
      try {
        await addDoc(collection(db, "admin_audit_logs"), {
          adminEmail: currentAdminEmail,
          action: "Failed Loan Disbursal",
          details: `Attempted to disburse ${loan.approvedAmount || loan.amount} XLM to Driver ${loan.driverName} but failed: ${err.message || err}`,
          createdAt: serverTimestamp()
        });
      } catch (logErr) {
        console.error("Failed to write failure log to Firestore:", logErr);
      }
      setSuccessMsg(`Disbursal Error: ${err.message || err}`);
    } finally {
      setDisbursingId(null);
    }
  };

  const pendingLoans = loans.filter(l => l.status === "pending");
  const approvedLoans = loans.filter(l => l.status === "approved");
  const awaitingDisbursalLoans = loans.filter(l => l.status === "awaiting_disbursal");
  const activeLoans = loans.filter(l => l.status === "active" || l.status === "repaid");

  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="flex justify-between items-end">
        <h1 className="text-3xl font-black">Admin Loans</h1>
        <button 
          onClick={() => setShowCreateModal(true)}
          className="px-6 py-3 rounded-2xl font-black text-white bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
        >
          + Issue New Loan Offer
        </button>
      </div>

      {successMsg && (
        <div className={`p-4 rounded-xl text-xs font-bold ${successMsg.includes("Success") ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-blue-500/10 text-blue-400 border border-blue-500/20"}`}>
          {successMsg}
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`w-full max-w-md p-6 rounded-[28px] shadow-2xl ${dark ? "bg-[#141722] border border-white/10" : "bg-white"}`}>
            <h2 className="text-xl font-black mb-4">Issue New Loan Offer</h2>
            <form onSubmit={handleCreateLoanOffer} className="space-y-4">
              <div>
                <label className="block text-xs font-bold mb-1 opacity-70">Select Driver</label>
                <select 
                  value={newLoanDriverId} 
                  onChange={e => setNewLoanDriverId(e.target.value)}
                  className={`w-full p-3 rounded-xl border font-semibold outline-none ${dark ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200"}`}
                  required
                >
                  <option value="">-- Choose User --</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.displayName} ({u.role}, Score: {u.trustScore || 0})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1 opacity-70">Offer Amount (XLM)</label>
                <input 
                  type="number" 
                  value={newLoanAmount} 
                  onChange={e => setNewLoanAmount(e.target.value)}
                  className={`w-full p-3 rounded-xl border font-bold outline-none ${dark ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200"}`}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1 opacity-70">Monthly Repayment (XLM)</label>
                  <input 
                    type="number" 
                    value={newMonthlyRepayment} 
                    onChange={e => setNewMonthlyRepayment(e.target.value)}
                    className={`w-full p-3 rounded-xl border font-bold outline-none ${dark ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200"}`}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 opacity-70">Duration (Months)</label>
                  <input 
                    type="number" 
                    value={newDurationMonths} 
                    onChange={e => setNewDurationMonths(e.target.value)}
                    className={`w-full p-3 rounded-xl border font-bold outline-none ${dark ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200"}`}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1 opacity-70">Interest Rate (%)</label>
                <input 
                  type="number" 
                  value={newInterestRate} 
                  onChange={e => setNewInterestRate(e.target.value)}
                  className={`w-full p-3 rounded-xl border font-bold outline-none ${dark ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200"}`}
                  placeholder="e.g. 3"
                  required
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowCreateModal(false)} className="flex-1 py-3 rounded-xl font-bold opacity-70 hover:opacity-100 transition-opacity">Cancel</button>
                <button type="submit" className="flex-1 py-3 rounded-xl font-black text-white bg-blue-600 hover:bg-blue-500 transition-colors">Issue Offer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {reviewLoan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`w-full max-w-md p-6 rounded-[28px] shadow-2xl ${dark ? "bg-[#141722] border border-white/10" : "bg-white"}`}>
            <h2 className="text-xl font-black mb-4">Review & Approve Loan</h2>
            <form onSubmit={handleIssueOffer} className="space-y-4">
              <div>
                <label className="block text-xs font-bold mb-1 opacity-70">Approved Amount (XLM)</label>
                <input type="number" value={approvedAmount} onChange={e => setApprovedAmount(e.target.value)} className={`w-full p-3 rounded-xl border font-bold outline-none ${dark ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200"}`} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1 opacity-70">Monthly Repayment (XLM)</label>
                  <input 
                    type="number" 
                    value={monthlyRepayment} 
                    onChange={e => setMonthlyRepayment(e.target.value)}
                    className={`w-full p-3 rounded-xl border font-bold outline-none ${dark ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200"}`}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 opacity-70">Duration (Months)</label>
                  <input 
                    type="number" 
                    value={durationMonths} 
                    onChange={e => setDurationMonths(e.target.value)}
                    className={`w-full p-3 rounded-xl border font-bold outline-none ${dark ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200"}`}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1 opacity-70">Interest Rate (%)</label>
                <input 
                  type="number" 
                  value={interestRate} 
                  onChange={e => setInterestRate(e.target.value)}
                  className={`w-full p-3 rounded-xl border font-bold outline-none ${dark ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200"}`}
                  placeholder="e.g. 3"
                  required
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setReviewLoan(null)} className="flex-1 py-3 rounded-xl font-bold opacity-70 hover:opacity-100 transition-opacity">Cancel</button>
                <button type="submit" className="flex-1 py-3 rounded-xl font-black text-white bg-blue-600 hover:bg-blue-500 transition-colors">Approve Loan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SECTION 1: Awaiting Admin Review */}
      <div>
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <span>Awaiting Admin Review</span>
          <span className="text-xs bg-amber-500/20 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded-full font-bold">{pendingLoans.length}</span>
        </h3>

        <div className={`rounded-2xl border overflow-hidden ${dark ? "bg-[#141722] border-white/10" : "bg-white border-gray-200"}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className={`border-b text-sm ${dark ? "border-white/10 text-gray-400" : "border-gray-200 text-gray-500"}`}>
                  <th className="p-4 font-semibold">Driver</th>
                  <th className="p-4 font-semibold">Trust Rating</th>
                  <th className="p-4 font-semibold">Requested Amount</th>
                  <th className="p-4 font-semibold text-right">Approval Decision</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {pendingLoans.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-gray-500">No new microloan requests awaiting review.</td>
                  </tr>
                ) : (
                  pendingLoans.map(loan => {
                    const score = getDriverScore(loan.driverId);
                    return (
                      <tr key={loan.id} className={`border-b transition-colors ${dark ? "border-white/10 hover:bg-white/5" : "border-gray-100 hover:bg-gray-50"}`}>
                        <td className="p-4">
                          <div className="font-bold text-[15px]">{loan.driverName}</div>
                          <div className="text-xs opacity-50 mt-1">Direct Admin Loan</div>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <span className={`w-3.5 h-3.5 rounded-full ${score > 700 ? "bg-green-500" : score > 450 ? "bg-amber-500" : "bg-red-500"}`} />
                            <span className="font-bold">{score}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="font-bold text-[15px]">{loan.amount} XLM</div>
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => openReview(loan)}
                            className={`px-4 py-1.5 rounded-xl text-xs font-extrabold transition-all active:scale-95 ${dark ? "bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-500/20" : "bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200"}`}
                          >
                            Review & Approve
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* SECTION 2: Awaiting Driver Acceptance */}
      <div>
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <span>Awaiting Driver Acceptance</span>
          <span className="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-bold">{approvedLoans.length}</span>
        </h3>

        <div className={`rounded-2xl border overflow-hidden ${dark ? "bg-[#141722] border-white/10" : "bg-white border-gray-200"}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className={`border-b text-sm ${dark ? "border-white/10 text-gray-400" : "border-gray-200 text-gray-500"}`}>
                  <th className="p-4 font-semibold">Driver</th>
                  <th className="p-4 font-semibold">Issued Offer Details</th>
                  <th className="p-4 font-semibold text-right">Status</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {approvedLoans.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-8 text-center text-gray-500">No active offers awaiting driver signatures.</td>
                  </tr>
                ) : (
                  approvedLoans.map(loan => (
                    <tr key={loan.id} className={`border-b transition-colors ${dark ? "border-white/10 hover:bg-white/5" : "border-gray-100 hover:bg-gray-50"}`}>
                      <td className="p-4">
                        <div className="font-bold text-[15px]">{loan.driverName}</div>
                        <div className="text-xs opacity-50 mt-1">Direct Admin Loan</div>
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-[15px]">{loan.amount} XLM</div>
                        <div className="text-xs opacity-50 mt-0.5 font-semibold text-blue-400">Approved: {loan.approvedAmount || loan.amount} XLM</div>
                        {loan.monthlyRepayment ? (
                          <div className="text-xs text-amber-500 font-bold mt-1">
                            Repayment: {loan.monthlyRepayment} XLM/mo over {loan.durationMonths || 1} mo @ {loan.interestRate || 0}%
                          </div>
                        ) : null}
                      </td>
                      <td className="p-4 text-right">
                        <span className="text-xs font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full animate-pulse">
                          Awaiting Driver Signature
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* SECTION 3: Awaiting Admin Disbursal */}
      <div>
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <span>Awaiting Admin Disbursal</span>
          <span className="text-xs bg-purple-500/20 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full font-bold">{awaitingDisbursalLoans.length}</span>
        </h3>

        <div className={`rounded-2xl border overflow-hidden ${dark ? "bg-[#141722] border-white/10" : "bg-white border-gray-200"}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className={`border-b text-sm ${dark ? "border-white/10 text-gray-400" : "border-gray-200 text-gray-500"}`}>
                  <th className="p-4 font-semibold">Driver</th>
                  <th className="p-4 font-semibold">Accepted Offer Details</th>
                  <th className="p-4 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {awaitingDisbursalLoans.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-8 text-center text-gray-500">No approved loans awaiting disbursal.</td>
                  </tr>
                ) : (
                  awaitingDisbursalLoans.map(loan => (
                    <tr key={loan.id} className={`border-b transition-colors ${dark ? "border-white/10 hover:bg-white/5" : "border-gray-100 hover:bg-gray-50"}`}>
                      <td className="p-4">
                        <div className="font-bold text-[15px]">{loan.driverName}</div>
                        <div className="text-xs opacity-50 mt-1">Direct Admin Loan</div>
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-[15px]">{loan.approvedAmount || loan.amount} XLM</div>
                        {loan.monthlyRepayment ? (
                          <div className="text-xs text-amber-500 font-bold mt-1">
                            Repayment: {loan.monthlyRepayment} XLM/mo over {loan.durationMonths || 1} mo @ {loan.interestRate || 0}%
                          </div>
                        ) : null}
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => handleDisburse(loan)}
                          disabled={disbursingId === loan.id}
                          className={`px-4 py-1.5 rounded-xl text-xs font-extrabold transition-all active:scale-95 ${dark ? "bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-500/20" : "bg-purple-600 hover:bg-purple-700 text-white shadow-md"
                            } ${disbursingId === loan.id ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                          {disbursingId === loan.id ? "Signing & Sending..." : "Disburse Funds On-Chain"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* SECTION 4: Disbursed Ledger History */}
      <div>
        <h3 className="text-lg font-bold mb-4">Disbursed Ledger History</h3>
        <div className={`rounded-2xl border overflow-hidden ${dark ? "bg-[#141722] border-white/10" : "bg-white border-gray-200"}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className={`border-b text-sm ${dark ? "border-white/10 text-gray-400" : "border-gray-200 text-gray-500"}`}>
                  <th className="p-4 font-semibold">Driver</th>
                  <th className="p-4 font-semibold">Active Amount</th>
                  <th className="p-4 font-semibold text-right">Status</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {activeLoans.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-8 text-center text-gray-500">No disbursed loan history found.</td>
                  </tr>
                ) : (
                  activeLoans.map(loan => (
                    <tr key={loan.id} className={`border-b transition-colors ${dark ? "border-white/10 hover:bg-white/5" : "border-gray-100 hover:bg-gray-50"}`}>
                      <td className="p-4 font-bold">{loan.driverName}</td>
                      <td className="p-4">
                        <div className="font-bold">{loan.approvedAmount || loan.amount} XLM</div>
                        {loan.monthlyRepayment ? (
                          <div className="text-xs text-amber-500 font-bold mt-1">
                            Repayment: {loan.monthlyRepayment} XLM/mo over {loan.durationMonths || 1} mo @ {loan.interestRate || 0}%
                          </div>
                        ) : null}
                      </td>
                      <td className="p-4 text-right">
                        <span className="text-xs font-bold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
                          {loan.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLoans;
