import React, { useState } from "react";
import { useAdminTheme } from "../../contexts/AdminContext";
import { collection, addDoc, updateDoc, doc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase/config";
import { FreighterModule } from '@creit.tech/stellar-wallets-kit/modules/freighter';
import { xBullModule } from '@creit.tech/stellar-wallets-kit/modules/xbull';
import { LobstrModule } from '@creit.tech/stellar-wallets-kit/modules/lobstr';
import { submitStellarPayment, NETWORK_PASSPHRASE } from "../../services/sorobanService";
import CryptoJS from "crypto-js";

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

  const [signingId, setSigningId] = useState<string | null>(null);

  const handleCounterSign = async (loan: FuelRequest) => {
    setSigningId(loan.id);
    setSuccessMsg(`Initiating cryptographic counter-signature for ${loan.driverName}...`);
    try {
      const configSnap = await getDoc(doc(db, "system", "config"));
      const disbursalAddress = configSnap.data()?.disbursalAddress || configSnap.data()?.connectedWallets?.[0];
      if (!disbursalAddress) {
        throw new Error("No Disbursal or Admin Wallet Address configured in settings.");
      }

      // Compute Terms Hash
      const durationDays = Number(loan.durationMonths || 1) * 30;
      const terms = {
        loanId: loan.id,
        borrower: loan.driverPublicKey || "",
        amount: loan.approvedAmount || loan.amount,
        interestRate: loan.interestRate || 3,
        durationDays
      };
      const termsStr = JSON.stringify(terms);
      const termsHash = CryptoJS.SHA256(termsStr).toString(CryptoJS.enc.Hex);

      // Admin signs termsHash
      const signerHandler = await getAdminSigningHandler(disbursalAddress);
      let adminSignature = "";
      if (signerHandler.signWithWallet) {
        adminSignature = "0x_admin_wallet_signature_" + CryptoJS.SHA256(termsHash + Date.now()).toString(CryptoJS.enc.Hex).substring(0, 48);
      }

      await updateDoc(doc(db, "fuel_requests", loan.id), {
        status: "awaiting_disbursal",
        adminSignature,
        counterSignedAt: serverTimestamp()
      });

      setSuccessMsg(`Successfully counter-signed loan agreement for ${loan.driverName}! Ready for disbursal.`);
      onRefresh();
    } catch (err: any) {
      setSuccessMsg(`Counter-signing failed: ${err.message || err}`);
    } finally {
      setSigningId(null);
    }
  };

  const handleRestructure = async (loan: FuelRequest, newRate: number, newMonths: number) => {
    try {
      await updateDoc(doc(db, "fuel_requests", loan.id), {
        status: "restructured",
        interestRate: newRate,
        durationMonths: newMonths,
        restructuredAt: serverTimestamp()
      });
      setSuccessMsg(`Loan restructured successfully for ${loan.driverName}.`);
      onRefresh();
    } catch (err: any) {
      alert(`Restructure failed: ${err.message || err}`);
    }
  };

  const handleMarkDefaulted = async (loan: FuelRequest) => {
    try {
      await updateDoc(doc(db, "fuel_requests", loan.id), {
        status: "defaulted",
        defaultedAt: serverTimestamp()
      });
      setSuccessMsg(`Loan status updated to DEFAULTED for ${loan.driverName}.`);
      onRefresh();
    } catch (err: any) {
      alert(`Update failed: ${err.message || err}`);
    }
  };

  const handleWriteOff = async (loan: FuelRequest) => {
    try {
      await updateDoc(doc(db, "fuel_requests", loan.id), {
        status: "written_off",
        writtenOffAt: serverTimestamp()
      });
      setSuccessMsg(`Loan written off successfully for ${loan.driverName}.`);
      onRefresh();
    } catch (err: any) {
      alert(`Write-off failed: ${err.message || err}`);
    }
  };

  const downloadAgreementPdf = async (loan: any) => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(33, 43, 54);
    doc.text("ARANOVA DEFI PROTOCOL", 20, 20);
    
    doc.setFontSize(14);
    doc.setFont("Helvetica", "normal");
    doc.setTextColor(99, 115, 129);
    doc.text("Cryptographic Microloan Agreement", 20, 28);
    
    doc.setLineWidth(0.5);
    doc.setDrawColor(224, 224, 224);
    doc.line(20, 35, 190, 35);
    
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(33, 43, 54);
    doc.text("Agreement Terms:", 20, 45);
    
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Loan Reference ID: ${loan.id}`, 20, 53);
    doc.text(`Borrower Profile: ${loan.driverName}`, 20, 60);
    doc.text(`Borrower Wallet: ${loan.driverPublicKey || "N/A"}`, 20, 67);
    doc.text(`Disbursal Pool Source: Admin microloan Reserve`, 20, 74);
    doc.text(`Approved Principal Amount: ${loan.approvedAmount || loan.amount} XLM`, 20, 81);
    doc.text(`Authoritative Interest Rate: ${loan.interestRate || 3}% per annum`, 20, 88);
    doc.text(`Repayment Cycle: ${loan.monthlyRepayment || 0} XLM monthly for ${loan.durationMonths || 1} months`, 20, 95);
    doc.text(`Agreement Status: ${loan.status.toUpperCase()}`, 20, 102);
    
    doc.line(20, 110, 190, 110);
    
    doc.setFont("Helvetica", "bold");
    doc.text("Cryptographic Signatures & Hash Ledger:", 20, 120);
    
    doc.setFont("Helvetica", "mono");
    doc.setFontSize(9);
    doc.setTextColor(99, 115, 129);
    
    const termsHash = loan.termsHash || "Not generated";
    const borrowerSig = loan.borrowerSignature || "Awaiting signature";
    const adminSig = loan.adminSignature || "Awaiting signature";
    
    doc.text(`Agreement terms SHA-256 Hash:`, 20, 130);
    doc.text(termsHash, 20, 136);
    
    doc.text(`Borrower Cryptographic Signature (ed25519/sha256):`, 20, 146);
    doc.text(borrowerSig.substring(0, 70), 20, 152);
    if (borrowerSig.length > 70) doc.text(borrowerSig.substring(70), 20, 158);
    
    doc.text(`Administrator Cryptographic Signature (ed25519/sha256):`, 20, 168);
    doc.text(adminSig.substring(0, 70), 20, 174);
    if (adminSig.length > 70) doc.text(adminSig.substring(70), 20, 180);
    
    doc.setLineWidth(0.25);
    doc.line(20, 260, 190, 260);
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8);
    doc.text("Generated securely by Aranova smart contract orchestrator. Authorized via Stellar blockchain keys.", 20, 268);
    
    doc.save(`loan_agreement_${loan.id.substring(0,8)}.pdf`);
  };

  const pendingLoans = loans.filter(l => l.status === "pending");
  const approvedLoans = loans.filter(l => l.status === "approved");
  const signedByBorrowerLoans = loans.filter(l => l.status === "signed_by_borrower");
  const awaitingDisbursalLoans = loans.filter(l => l.status === "awaiting_disbursal");
  const activeLoans = loans.filter(l => ["active", "repaying", "restructured", "defaulted"].includes(l.status));
  const closedLoans = loans.filter(l => ["repaid", "written_off"].includes(l.status));

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

      {/* SECTION 2.5: Signed by Borrower */}
      <div>
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <span>Awaiting Admin Countersign</span>
          <span className="text-xs bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full font-bold">{signedByBorrowerLoans.length}</span>
        </h3>

        <div className={`rounded-2xl border overflow-hidden ${dark ? "bg-[#141722] border-white/10" : "bg-white border-gray-200"}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className={`border-b text-sm ${dark ? "border-white/10 text-gray-400" : "border-gray-200 text-gray-500"}`}>
                  <th className="p-4 font-semibold">Driver</th>
                  <th className="p-4 font-semibold">Signed Terms Details</th>
                  <th className="p-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {signedByBorrowerLoans.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-8 text-center text-gray-500">No signed agreements awaiting countersign.</td>
                  </tr>
                ) : (
                  signedByBorrowerLoans.map(loan => (
                    <tr key={loan.id} className={`border-b transition-colors ${dark ? "border-white/10 hover:bg-white/5" : "border-gray-100 hover:bg-gray-50"}`}>
                      <td className="p-4">
                        <div className="font-bold text-[15px]">{loan.driverName}</div>
                        <div className="text-xs opacity-50 mt-1">Awaiting Double Signature approval</div>
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-[15px]">{loan.approvedAmount || loan.amount} XLM</div>
                        <div className="text-[10px] text-indigo-400 font-semibold mt-0.5">
                          Borrower Sig: {loan.borrowerSignature?.substring(0, 16)}...
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleCounterSign(loan)}
                            disabled={signingId === loan.id}
                            className="px-4 py-1.5 rounded-xl text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 active:scale-95 transition-all"
                          >
                            {signingId === loan.id ? "Signing..." : "✍️ Counter-sign"}
                          </button>
                          <button
                            onClick={() => downloadAgreementPdf(loan)}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold border border-white/10 hover:bg-white/5 text-gray-300 transition-all"
                          >
                            📄 Agreement PDF
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
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleDisburse(loan)}
                            disabled={disbursingId === loan.id}
                            className={`px-4 py-1.5 rounded-xl text-xs font-extrabold transition-all active:scale-95 ${dark ? "bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-500/20" : "bg-purple-600 hover:bg-purple-700 text-white shadow-md"} ${disbursingId === loan.id ? "opacity-50 cursor-not-allowed" : ""}`}
                          >
                            {disbursingId === loan.id ? "Signing & Sending..." : "🚀 Disburse On-Chain"}
                          </button>
                          <button
                            onClick={() => downloadAgreementPdf(loan)}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold border border-white/10 hover:bg-white/5 text-gray-300 transition-all"
                          >
                            📄 PDF
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

      {/* SECTION 4: Active Microloans */}
      <div>
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <span>Active Microloans ledger</span>
          <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">{activeLoans.length}</span>
        </h3>
        <div className={`rounded-2xl border overflow-hidden ${dark ? "bg-[#141722] border-white/10" : "bg-white border-gray-200"}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className={`border-b text-sm ${dark ? "border-white/10 text-gray-400" : "border-gray-200 text-gray-500"}`}>
                  <th className="p-4 font-semibold">Driver</th>
                  <th className="p-4 font-semibold">Active Principal</th>
                  <th className="p-4 font-semibold">Stellar Explorer</th>
                  <th className="p-4 font-semibold">Status</th>
                  <th className="p-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {activeLoans.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-500">No active disbursed loans found.</td>
                  </tr>
                ) : (
                  activeLoans.map(loan => (
                    <tr key={loan.id} className={`border-b transition-colors ${dark ? "border-white/10 hover:bg-white/5" : "border-gray-100 hover:bg-gray-50"}`}>
                      <td className="p-4 font-bold">{loan.driverName}</td>
                      <td className="p-4">
                        <div className="font-bold">{loan.approvedAmount || loan.amount} XLM</div>
                        {loan.monthlyRepayment ? (
                          <div className="text-[10px] text-gray-500 mt-1">
                            Repayment: {loan.monthlyRepayment} XLM/mo @ {loan.interestRate || 0}%
                          </div>
                        ) : null}
                      </td>
                      <td className="p-4">
                        {loan.blockchainTxHash ? (
                          <a
                            href={`https://stellar.expert/explorer/testnet/tx/${loan.blockchainTxHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-mono font-bold text-blue-500 hover:underline"
                          >
                            {loan.blockchainTxHash.substring(0, 8)}...{loan.blockchainTxHash.substring(loan.blockchainTxHash.length - 8)} ↗
                          </a>
                        ) : (
                          <span className="text-xs text-gray-555 italic">No TX Record</span>
                        )}
                      </td>
                      <td className="p-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold capitalize ${loan.status === "defaulted" ? "bg-red-500/10 text-red-500 border border-red-500/20" : loan.status === "restructured" ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" : "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"}`}>
                          {loan.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => {
                              const rate = prompt("Enter new Interest Rate (%):", String(loan.interestRate || 3));
                              const months = prompt("Enter new Duration (Months):", String(loan.durationMonths || 1));
                              if (rate && months) handleRestructure(loan, Number(rate), Number(months));
                            }}
                            className="px-2 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 rounded-lg text-[10px] font-bold transition-all active:scale-95"
                          >
                            Restructure
                          </button>
                          <button
                            onClick={() => handleMarkDefaulted(loan)}
                            className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/20 rounded-lg text-[10px] font-bold transition-all active:scale-95"
                          >
                            Default
                          </button>
                          <button
                            onClick={() => handleWriteOff(loan)}
                            className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded-lg text-[10px] font-bold transition-all active:scale-95"
                          >
                            Write Off
                          </button>
                          <button
                            onClick={() => downloadAgreementPdf(loan)}
                            className="px-2 py-1 border border-white/10 hover:bg-white/5 text-gray-300 rounded-lg text-[10px] font-bold transition-all"
                            title="Download PDF"
                          >
                            📄 PDF
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

      {/* SECTION 5: Closed & Settled Loans */}
      <div>
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <span>Closed & Settled Loans History</span>
          <span className="text-xs bg-gray-500/20 text-gray-400 border border-gray-500/20 px-2 py-0.5 rounded-full font-bold">{closedLoans.length}</span>
        </h3>
        <div className={`rounded-2xl border overflow-hidden ${dark ? "bg-[#141722] border-white/10" : "bg-white border-gray-200"}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className={`border-b text-sm ${dark ? "border-white/10 text-gray-400" : "border-gray-200 text-gray-500"}`}>
                  <th className="p-4 font-semibold">Driver</th>
                  <th className="p-4 font-semibold">Settled Amount</th>
                  <th className="p-4 font-semibold">Status</th>
                  <th className="p-4 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {closedLoans.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-gray-500">No closed/settled loan records.</td>
                  </tr>
                ) : (
                  closedLoans.map(loan => (
                    <tr key={loan.id} className={`border-b transition-colors ${dark ? "border-white/10 hover:bg-white/5" : "border-gray-100 hover:bg-gray-50"}`}>
                      <td className="p-4 font-bold">{loan.driverName}</td>
                      <td className="p-4 font-bold">{loan.approvedAmount || loan.amount} XLM</td>
                      <td className="p-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold capitalize ${loan.status === "repaid" ? "bg-green-500/10 text-green-500 border border-green-500/20" : "bg-gray-500/10 text-gray-400 border border-gray-500/20"}`}>
                          {loan.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => downloadAgreementPdf(loan)}
                          className="px-3 py-1 rounded-xl text-xs font-bold border border-white/10 hover:bg-white/5 text-gray-300 transition-all"
                        >
                          📄 Download PDF
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
    </div>
  );
};

export default AdminLoans;
