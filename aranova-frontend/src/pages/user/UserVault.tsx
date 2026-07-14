import { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import UserLayout from "../../components/layout/UserLayout";
import { useTheme } from "../../contexts/ThemeContext";
import LoadingWorkspace from "../../components/ui/LoadingWorkspace";
import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  increment,
  serverTimestamp,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { scoreDeltaForVault, dayMs, formatXlm, recalculateAndSyncTrustScore, encryptWithPin, decryptWithPin, checkPinLockout, registerFailedPinAttempt, clearPinAttempts } from "../../services/aranovaWorkflow";
import { Keypair } from "@stellar/stellar-sdk";
import { lockVaultOnChain, redeemVaultOnChain, getVaultBalanceOnChain } from "../../services/sorobanService";

const UserVault = () => {
  const { userData, loading: authLoading } = useAuth();
  const { dark } = useTheme();

  // State
  const [vaults, setVaults] = useState<any[]>([]);
  const [lockPercent, setLockPercent] = useState("0");
  const [lockDays, setLockDays] = useState("30");
  const [busy, setBusy] = useState(false);
  const [showLockForm, setShowLockForm] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [routingPct, setRoutingPct] = useState(0);
  const [showTermsModal, setShowTermsModal] = useState(false);

  // PIN verification modal state
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinDigits, setPinDigits] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinPurpose, setPinPurpose] = useState("");
  const [pinCallback, setPinCallback] = useState<((secret: string) => void) | null>(null);

  // PIN Step state machine
  const [pinStep, setPinStep] = useState<"idle" | "action" | "setup_new" | "confirm_new" | "confirm_existing">("idle");
  const [newPinVal, setNewPinVal] = useState("");

  // Page level PIN lock state
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [unlockDigits, setUnlockDigits] = useState("");
  const [unlockError, setUnlockError] = useState("");

  // Telemetry state
  const [telemetryLogs, setTelemetryLogs] = useState<any[]>([]);

  // Loading status state
  const [processingState, setProcessingState] = useState<string | null>(null);

  const [offlineReserve, setOfflineReserve] = useState(0);
  const [inputReserve, setInputReserve] = useState("");

  // Sync routingPct and terms state from profile
  useEffect(() => {
    if (userData) {
      if (userData.vaultRoutingPct !== undefined) {
        setRoutingPct(userData.vaultRoutingPct);
      }
      if (userData.vaultPreferredDays !== undefined) {
        setLockDays(userData.vaultPreferredDays.toString());
      }
      if (userData.offlineReserve !== undefined) {
        setOfflineReserve(userData.offlineReserve);
      }
      setShowTermsModal(!userData.vaultTermsAgreed);
    }
  }, [userData]);

  // Subscribe to user vaults & sync on-chain balance
  useEffect(() => {
    if (authLoading || !userData?.uid || !userData?.publicKey) return;

    const q = query(
      collection(db, "vaults"),
      where("ownerId", "==", userData.uid)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      setVaults(list);
    }, (err) => console.warn("User vaults snapshot error:", err));

    const syncVaultBalance = async () => {
      try {
        const onChainBalBig = await getVaultBalanceOnChain(userData.publicKey);
        const onChainVault = Number(onChainBalBig) / 10_000_000;
        if (onChainBalBig >= 0n && onChainVault !== Number(userData.vaultBalance || 0)) {
          await updateDoc(doc(db, "users", userData.uid), { vaultBalance: onChainVault });
        }
      } catch (err) {
        console.warn("Could not sync vault balance on vault page mount:", err);
      }
    };
    syncVaultBalance();

    return () => unsub();
  }, [userData?.uid, userData?.publicKey, authLoading]);

  // Subscribe to telemetry transactions logs
  useEffect(() => {
    if (authLoading || !userData?.uid) return;

    const qSend = query(
      collection(db, "transactions"),
      where("from", "==", userData.uid)
    );
    const qReceive = query(
      collection(db, "transactions"),
      where("to", "==", userData.uid)
    );

    const logsMap: Record<string, any> = {};

    const updateMergedLogs = () => {
      const merged = Object.values(logsMap).sort((a: any, b: any) => b.time - a.time);
      setTelemetryLogs(merged);
    };

    const unsubSend = onSnapshot(qSend, (snap) => {
      snap.docs.forEach((docSnap) => {
        const d = docSnap.data();
        const txHash = d.blockchainTxHash || docSnap.id;
        const time = d.createdAt?.toMillis() || Date.now();
        if (d.type === "vault_lock") {
          logsMap[docSnap.id] = {
            id: docSnap.id,
            type: "lock",
            text: `Manual time-lock of +${formatXlm(d.amount)} XLM initialized.`,
            time,
            tx: txHash,
          };
        }
      });
      updateMergedLogs();
    }, (err) => console.warn("Send transactions error:", err));

    const unsubReceive = onSnapshot(qReceive, (snap) => {
      snap.docs.forEach((docSnap) => {
        const d = docSnap.data();
        const txHash = d.blockchainTxHash || docSnap.id;
        const time = d.createdAt?.toMillis() || Date.now();
        if (d.type === "send" || d.type === "offline_qr_settled") {
          const totalPaid = Number(d.amount || 0);
          const routedVal = (totalPaid * routingPct) / 100;
          if (routingPct > 0 && routedVal > 0) {
            logsMap[docSnap.id] = {
              id: docSnap.id,
              type: "routed",
              text: `P2P Split Routing: +${formatXlm(routedVal)} XLM automatically routed to vault.`,
              time,
              tx: txHash,
            };
          } else {
            logsMap[docSnap.id] = {
              id: docSnap.id,
              type: "deposit",
              text: `P2P Transfer settled: +${formatXlm(totalPaid)} XLM deposited to liquid wallet.`,
              time,
              tx: txHash,
            };
          }
        } else if (d.type === "vault_redeem") {
          logsMap[docSnap.id] = {
            id: docSnap.id,
            type: "redeem",
            text: `Maturation redemption: -${formatXlm(d.amount)} XLM returned to liquid wallet.`,
            time,
            tx: txHash,
          };
        }
      });
      updateMergedLogs();
    }, (err) => console.warn("Receive transactions error:", err));

    return () => {
      unsubSend();
      unsubReceive();
    };
  }, [userData?.uid, authLoading, routingPct]);

  if (authLoading || !userData) {
    return <LoadingWorkspace message="Syncing vault cryptographic allocations..." dark={dark} />;
  }

  const walletBalance = Number(userData.walletBalance || 0);
  const vaultBalance = Number(userData.vaultBalance || 0);

  // Form calculated values
  const percentVal = Number(lockPercent) || 0;
  const daysVal = Number(lockDays) || 0;
  const calculatedLockAmount = (walletBalance * percentVal) / 100;
  const calculatedMaturityDate = new Date(Date.now() + daysVal * dayMs).toISOString().slice(0, 10);

  const handleSliderChange = async (val: number) => {
    setRoutingPct(val);
    if (!userData?.uid) return;
    try {
      await updateDoc(doc(db, "users", userData.uid), {
        vaultRoutingPct: val,
      });
    } catch (err) {
      console.warn("Failed to update vault routing pct:", err);
    }
  };

  const handleLockDaysChange = async (days: number) => {
    setLockDays(days.toString());
    if (!userData?.uid) return;
    try {
      await updateDoc(doc(db, "users", userData.uid), {
        vaultPreferredDays: days,
      });
    } catch (err) {
      console.warn("Failed to update preferred lock days:", err);
    }
  };

  const handleSetOfflineReserve = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(inputReserve);
    if (isNaN(amt) || amt < 0) return alert("Please enter a valid amount.");
    if (amt > walletBalance) return alert("Offline reserve cannot exceed your current wallet balance.");
    setBusy(true);
    try {
      await updateDoc(doc(db, "users", userData.uid), {
        offlineReserve: amt
      });
      setOfflineReserve(amt);
      setInputReserve("");
      alert(`Successfully locked ${amt} XLM into your Offline Reserve Buffer!`);
    } catch (err) {
      console.warn("Failed to set offline reserve:", err);
    } finally {
      setBusy(false);
    }
  };

  const handleAgreeTerms = async () => {
    if (!userData?.uid) return;

    if (userData.encryptedSecretKey) {
      setPinPurpose("Enter current PIN to activate Vault");
      setPinStep("confirm_existing");
      setPinDigits("");
      setPinError("");
      setShowPinModal(true);
    } else {
      setPinPurpose("Create a 4-Digit Vault PIN");
      setPinStep("setup_new");
      setPinDigits("");
      setPinError("");
      setShowPinModal(true);
    }
  };

  // Lock Funds Handler
  const handleLockFunds = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreeToTerms) return alert("You must agree to the lockup terms and conditions.");
    if (calculatedLockAmount <= 0) return alert("Select a valid percentage and balance to lock.");
    if (calculatedLockAmount > walletBalance) return alert("Insufficient wallet balance.");
    if (daysVal <= 0) return alert("Select a valid duration.");

    // Trigger PIN authorization modal first
    setPinPurpose(`Lock ${calculatedLockAmount.toFixed(2)} XLM into Vault`);
    setPinStep("action");
    setPinDigits("");
    setPinError("");
    setPinCallback(() => async (secret: string) => {
      setBusy(true);
      setProcessingState("Constructing on-chain locking payload...");
      try {
        const handler = { signWithSecret: secret };
        const amountStroops = BigInt(Math.round(calculatedLockAmount * 10_000_000));
        
        setProcessingState("Simulating smart contract on Soroban...");
        const txHash = await lockVaultOnChain(userData.publicKey, amountStroops, daysVal, handler);
        console.log("On-chain vault lock successful:", txHash);

        setProcessingState("Recording metadata & sync...");
        const vaultId = `${userData.uid}_vault_${Date.now()}`;
        await setDoc(doc(db, "vaults", vaultId), {
          ownerId: userData.uid,
          lockedAmount: calculatedLockAmount,
          lockPercent: percentVal,
          lockDays: daysVal,
          maturityDate: calculatedMaturityDate,
          status: "locked",
          txHash: txHash,
          createdAt: serverTimestamp(),
        });

        await updateDoc(doc(db, "users", userData.uid), {
          walletBalance: increment(-calculatedLockAmount),
          vaultBalance: increment(calculatedLockAmount),
          lastTrustUpdate: serverTimestamp(),
        });
        await recalculateAndSyncTrustScore(userData.uid);

        await addDoc(collection(db, "transactions"), {
          type: "vault_lock",
          from: userData.uid,
          to: "vault",
          amount: calculatedLockAmount,
          status: "completed",
          blockchainTxHash: txHash,
          createdAt: serverTimestamp(),
        });

        alert(`Successfully locked ${formatXlm(calculatedLockAmount)} XLM in your Personal Vault!`);
        setShowLockForm(false);
        setAgreeToTerms(false);
      } catch (err: any) {
        console.error(err);
        alert("Failed to lock funds: " + (err.message || err));
      } finally {
        setBusy(false);
        setProcessingState(null);
      }
    });
    setShowPinModal(true);
  };

  // Redeem Matured Vault Handler
  const handleRedeem = async (vault: any) => {
    const redeemAmount = Number(vault.lockedAmount || 0);

    // Trigger PIN authorization modal first
    setPinPurpose(`Redeem ${redeemAmount.toFixed(2)} XLM from Vault`);
    setPinStep("action");
    setPinDigits("");
    setPinError("");
    setPinCallback(() => async (secret: string) => {
      setBusy(true);
      setProcessingState("Awaiting block validation...");
      try {
        const handler = { signWithSecret: secret };
        const amountStroops = BigInt(Math.round(redeemAmount * 10_000_000));
        
        setProcessingState("Executing Soroban redeem contract...");
        const txHash = await redeemVaultOnChain(userData.publicKey, amountStroops, handler);
        console.log("On-chain vault redemption successful:", txHash);

        setProcessingState("Syncing balances...");
        await updateDoc(doc(db, "vaults", vault.id), {
          status: "redeemed",
          redeemTxHash: txHash,
          redeemedAt: serverTimestamp(),
        });

        await updateDoc(doc(db, "users", userData.uid), {
          walletBalance: increment(redeemAmount),
          vaultBalance: increment(-redeemAmount),
          lastTrustUpdate: serverTimestamp(),
        });
        await recalculateAndSyncTrustScore(userData.uid);

        await addDoc(collection(db, "transactions"), {
          type: "vault_redeem",
          from: "vault",
          to: userData.uid,
          amount: redeemAmount,
          status: "completed",
          blockchainTxHash: txHash,
          createdAt: serverTimestamp(),
        });

        alert(`Successfully redeemed ${formatXlm(redeemAmount)} XLM back to your wallet!`);
      } catch (err: any) {
        console.error(err);
        alert("Failed to redeem vault: " + (err.message || err));
      } finally {
        setBusy(false);
        setProcessingState(null);
      }
    });
    setShowPinModal(true);
  };

  // Check if a vault is matured
  const isMatured = (maturityDateStr: string) => {
    if (!maturityDateStr) return false;
    const maturity = new Date(maturityDateStr);
    return Date.now() >= maturity.getTime();
  };

  const handlePinSubmit = async () => {
    if (pinDigits.length < 4) {
      setPinError("PIN must be 4 digits.");
      return;
    }
    setPinError("");

    if (!userData?.uid) return;
    
    // Check lockout first
    const lockoutMsg = checkPinLockout(userData.uid);
    if (lockoutMsg) {
      setPinError(lockoutMsg);
      return;
    }

    const entered = pinDigits;
    setPinDigits("");

    if (pinStep === "action") {
      try {
        const secret = decryptWithPin(userData.encryptedSecretKey, entered);
        if (!secret || !secret.startsWith("S") || secret.length !== 56) {
          throw new Error("Invalid PIN.");
        }
        clearPinAttempts(userData.uid);
        setShowPinModal(false);
        setPinStep("idle");
        if (pinCallback) {
          pinCallback(secret);
        }
      } catch (err) {
        const msg = registerFailedPinAttempt(userData.uid);
        setPinError(msg);
      }
    } else if (pinStep === "confirm_existing") {
      setBusy(true);
      try {
        const secret = decryptWithPin(userData.encryptedSecretKey, entered);
        if (!secret || !secret.startsWith("S") || secret.length !== 56) {
          throw new Error("Invalid PIN.");
        }
        clearPinAttempts(userData.uid);
        await updateDoc(doc(db, "users", userData.uid), {
          vaultTermsAgreed: true,
        });
        setShowTermsModal(false);
        setShowPinModal(false);
        setPinStep("idle");
        alert("Vault activated successfully!");
      } catch (err: any) {
        const msg = registerFailedPinAttempt(userData.uid);
        setPinError("Activation failed: " + msg);
      } finally {
        setBusy(false);
      }
    } else if (pinStep === "setup_new") {
      setNewPinVal(entered);
      setPinStep("confirm_new");
      setPinPurpose("Confirm 4-Digit Vault PIN");
    } else if (pinStep === "confirm_new") {
      if (entered !== newPinVal) {
        setPinError("PINs do not match.");
        return;
      }
      setBusy(true);
      try {
        const pair = Keypair.random();
        const publicKey = pair.publicKey();
        const encryptedSecret = encryptWithPin(pair.secret(), entered);

        await updateDoc(doc(db, "users", userData.uid), {
          publicKey: publicKey,
          encryptedSecretKey: encryptedSecret,
          vaultTermsAgreed: true,
          walletCreated: true
        });
        setShowTermsModal(false);
        setShowPinModal(false);
        setPinStep("idle");
        alert("Vault activated and secure wallet created successfully!");
      } catch (err: any) {
        setPinError("Activation failed: " + err.message);
      } finally {
        setBusy(false);
      }
    }
  };

  const handlePinKey = (num: string) => {
    setPinError("");
    if (pinDigits.length < 4) {
      setPinDigits(prev => prev + num);
    }
  };

  const handlePinBackspace = () => {
    setPinError("");
    setPinDigits(prev => prev.slice(0, -1));
  };

  const hasPinBackButton = () => {
    return pinStep === "confirm_new";
  };

  const handlePinBack = () => {
    setPinError("");
    if (pinStep === "confirm_new") {
      setPinStep("setup_new");
      setPinPurpose("Create a 4-Digit Vault PIN");
      setPinDigits("");
    } else {
      setShowPinModal(false);
      setPinStep("idle");
    }
  };

  // Page level PIN verification handlers
  const handleUnlockSubmit = (pin: string) => {
    if (!userData?.uid) return;
    const lockoutMsg = checkPinLockout(userData.uid);
    if (lockoutMsg) {
      setUnlockError(lockoutMsg);
      return;
    }

    try {
      const secret = decryptWithPin(userData.encryptedSecretKey, pin);
      if (!secret || !secret.startsWith("S") || secret.length !== 56) {
          throw new Error("Invalid PIN.");
      }
      clearPinAttempts(userData.uid);
      setUnlockError("");
      setIsUnlocked(true);
    } catch (err) {
      const msg = registerFailedPinAttempt(userData.uid);
      setUnlockError("Access Denied: " + msg);
      setUnlockDigits("");
    }
  };

  const handleUnlockKey = (num: string) => {
    setUnlockError("");
    if (unlockDigits.length < 4) {
      const val = unlockDigits + num;
      setUnlockDigits(val);
      if (val.length === 4) {
        handleUnlockSubmit(val);
      }
    }
  };

  const handleUnlockBackspace = () => {
    setUnlockError("");
    setUnlockDigits(prev => prev.slice(0, -1));
  };

  const role = userData?.role || "commuter";

  const getRoleTheme = () => {
    switch (role) {
      case "driver":
        return {
          accent: "#FF6B00",
          accentText: "text-[#FF8833]",
          accentBorder: "border-[#FF6B00]/30",
          accentBg: "bg-[#FF6B00] text-white hover:bg-[#E05E00]",
          accentLightBg: "bg-[#FF6B00]/10",
          badgeBg: "bg-[#FF6B00]/10 text-[#FF8833] border-[#FF6B00]/20",
          progressBg: "bg-[#FF6B00]",
          card: dark ? "bg-[#141620] border-white/5" : "bg-white border-[#EAE6DF]",
          buttonAccent: "bg-[#FF6B00] text-white hover:bg-[#E05E00]",
        };
      case "cooperative":
        return {
          accent: "#10B981",
          accentText: "text-[#34D399]",
          accentBorder: "border-[#10B981]/30",
          accentBg: "bg-[#10B981] text-white hover:bg-[#0E9F6E]",
          accentLightBg: "bg-[#10B981]/10",
          badgeBg: "bg-[#10B981]/10 text-[#34D399] border-[#10B981]/20",
          progressBg: "bg-[#10B981]",
          card: dark ? "bg-[#0A1128] border-white/5" : "bg-white border-[#D5E2EC]",
          buttonAccent: "bg-[#10B981] text-white hover:bg-[#0E9F6E]",
        };
      case "commuter":
      default:
        return {
          accent: "#FFE600",
          accentText: "text-[#FFE600]",
          accentBorder: "border-[#FFE600]/30",
          accentBg: "bg-[#FFE600] text-black hover:bg-[#E6CE00]",
          accentLightBg: "bg-[#FFE600]/10",
          badgeBg: "bg-[#FFE600]/10 text-black dark:text-[#FFE600] border-[#FFE600]/20",
          progressBg: "bg-[#FFE600]",
          card: dark ? "bg-[#0E0F14] border-white/5" : "bg-white border-[#E2E2DF]",
          buttonAccent: "bg-[#FFE600] text-black hover:bg-[#E6CE00]",
        };
    }
  };

  const theme = getRoleTheme();

  // Page locking overlay builder (within page view boundaries, keeping sidebar accessible)
  const renderUnlockPage = () => (
    <div className={`flex flex-col items-center justify-center py-16 px-4 text-center w-full`}>
      <div className={`max-w-sm w-full rounded-[32px] p-8 border shadow-2xl ${
        dark ? 'bg-[#141620] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'
      }`}>
        <div className="mb-6">
          <span className="text-4xl">🔐</span>
          <h2 className="text-xl font-black mt-3">Vault Security Lock</h2>
          <p className="text-xs text-gray-405 mt-1 uppercase tracking-wider font-extrabold">Enter PIN to access savings ledger</p>
        </div>

        <div className="flex justify-center gap-4 my-8">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={`w-4 h-4 rounded-full border-2 transition-all duration-155 ${
                unlockDigits.length > idx
                  ? (role === 'driver' ? 'bg-[#FF6B00] border-transparent scale-110' : role === 'cooperative' ? 'bg-[#10B981] border-transparent scale-110' : 'bg-[#FFE600] border-transparent scale-110')
                  : 'bg-transparent border-gray-400'
              }`}
            />
          ))}
        </div>

        {unlockError && <p className="text-red-500 text-xs font-black mb-6">{unlockError}</p>}

        <div className="grid grid-cols-3 gap-3 max-w-[240px] mx-auto">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => handleUnlockKey(num)}
              className={`h-12 rounded-xl text-lg font-black transition-all active:scale-90 ${
                dark ? 'bg-white/5 hover:bg-white/10 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
              }`}
            >
              {num}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setUnlockDigits("")}
            className={`h-12 rounded-xl text-xs font-black text-red-505 transition-all active:scale-90 ${
              dark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 text-gray-800'
            }`}
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => handleUnlockKey("0")}
            className={`h-12 rounded-xl text-lg font-black transition-all active:scale-90 ${
              dark ? 'bg-white/5 hover:bg-white/10 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
            }`}
          >
            0
          </button>
          <button
            type="button"
            onClick={handleUnlockBackspace}
            className={`h-12 rounded-xl text-sm font-black text-gray-400 transition-all active:scale-90 ${
              dark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100'
            }`}
          >
            ⌫
          </button>
        </div>

        <button
          onClick={() => window.location.href = "/user"}
          className={`text-xs font-black uppercase tracking-wider mt-6 hover:underline ${
            role === 'driver' ? 'text-[#FF8833]' : role === 'cooperative' ? 'text-[#34D399]' : 'text-[#8A7D00] dark:text-[#FFE600]'
          }`}
        >
          &larr; Back to Dashboard
        </button>
      </div>
    </div>
  );

  // Telemetry logs terminal builder
  const renderTelemetryLogs = () => (
    <div className={`p-6 rounded-[28px] border shadow-sm flex flex-col font-mono ${theme.card}`}>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-black text-xs uppercase tracking-wider text-gray-400">Personal Vault Telemetry Logs</h3>
        <span className="inline-flex items-center gap-1 text-[8px] font-black text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 uppercase tracking-widest animate-pulse">
          ● SYSTEM LIVE
        </span>
      </div>

      {/* System Status Indicators */}
      <div className="grid grid-cols-2 gap-2 text-[9px] font-bold text-gray-500 mb-4 pb-4 border-b border-white/5">
        <div>NETWORK: <span className="text-gray-300">STELLAR TESTNET</span></div>
        <div>SOROBAN CONTRACT: <span className="text-emerald-500">ACTIVE</span></div>
        <div>ROUTING CHANNEL: <span className="text-amber-500">P2P AUTO-ROUTING ({routingPct}%)</span></div>
        <div>PRE_SET LOCK TERM: <span className="text-blue-400">{lockDays} DAYS</span></div>
      </div>

      {/* Terminal Log Console */}
      <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1 text-[10px] leading-relaxed">
        <div className="text-gray-500">
          <span className="text-emerald-500">[OK]</span> Soroban smart contract AranovaContract initialized.
        </div>
        <div className="text-gray-500">
          <span className="text-emerald-500">[OK]</span> P2P auto-routing listener active on blockchain ledger.
        </div>
        {routingPct > 0 && (
          <div className="text-amber-400 animate-pulse">
            <span className="text-amber-500">[ACTIVE]</span> Splitting {routingPct}% of received transfers into vault (Lock: {lockDays}d).
          </div>
        )}

        {telemetryLogs.length === 0 ? (
          <div className="text-gray-600 text-center py-4 italic">No ledger transaction logs recorded.</div>
        ) : (
          telemetryLogs.map((log, idx) => (
            <div key={idx} className="text-gray-400 border-l border-white/5 pl-2.5">
              <span className="text-gray-600">[{new Date(log.time).toLocaleTimeString()}]</span>{" "}
               <span className={log.type === "lock" ? "text-amber-400" : log.type === "redeem" ? "text-blue-400" : "text-emerald-400"}>
                 {log.text}
               </span>
              {log.tx && <span className="text-gray-600 text-[8px] block mt-0.5">Hash: {log.tx.slice(0, 16)}...</span>}
            </div>
          ))
        )}
      </div>
    </div>
  );

  // Secure action PIN modal overlay
  const renderPinModal = () => (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-[99999] p-6">
      <div className={`rounded-[32px] p-8 max-w-sm w-full border shadow-2xl text-center ${
        dark ? 'bg-[#0E0F14] border-white/10 text-white' : 'bg-white border-gray-100 text-gray-900'
      }`}>
        <div className="mb-4">
          <span className="text-3xl">🔑</span>
          <h3 className="text-lg font-black mt-2">PIN Authorization</h3>
          <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-wider font-extrabold">{pinPurpose}</p>
        </div>

        <div className="flex justify-center gap-4 my-6">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={`w-4 h-4 rounded-full border-2 transition-all duration-155 ${
                pinDigits.length > idx
                  ? (role === 'driver' ? 'bg-[#FF6B00] border-transparent scale-110' : role === 'cooperative' ? 'bg-[#10B981] border-transparent scale-110' : 'bg-[#FFE600] border-transparent scale-110')
                  : 'bg-transparent border-gray-400'
              }`}
            />
          ))}
        </div>

        {pinError && <p className="text-red-500 text-xs font-black mb-4">{pinError}</p>}

        <div className="grid grid-cols-3 gap-3 max-w-[240px] mx-auto mb-6">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => handlePinKey(num)}
              className={`h-12 rounded-xl text-lg font-black transition-all active:scale-90 ${
                dark ? 'bg-white/5 hover:bg-white/10 text-white' : 'bg-gray-50 hover:bg-gray-100 text-gray-900'
              }`}
            >
              {num}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPinDigits("")}
            className={`h-12 rounded-xl text-xs font-black text-red-500 transition-all active:scale-90 ${
              dark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 text-gray-800'
            }`}
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => handlePinKey("0")}
            className={`h-12 rounded-xl text-lg font-black transition-all active:scale-90 ${
              dark ? 'bg-white/5 hover:bg-white/10 text-white' : 'bg-gray-50 hover:bg-gray-100 text-gray-900'
            }`}
          >
            0
          </button>
          <button
            type="button"
            onClick={handlePinBackspace}
            className={`h-12 rounded-xl text-sm font-black text-gray-400 transition-all active:scale-90 ${
              dark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100'
            }`}
          >
            ⌫
          </button>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handlePinSubmit}
            disabled={pinDigits.length < 4}
            className={`flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all disabled:opacity-50 active:scale-95 ${theme.buttonAccent}`}
          >
            Confirm
          </button>
          <button
            onClick={handlePinBack}
            className={`flex-1 py-3 rounded-xl font-bold text-xs uppercase tracking-wider border transition-all ${
              dark ? 'border-white/10 text-white hover:bg-white/5' : 'border-gray-200'
            }`}
          >
            {hasPinBackButton() ? "Back" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );

  // Secure full-screen milestone processing loader overlay
  const renderProcessingOverlay = () => {
    if (!busy || showTermsModal || showPinModal) return null;
    return (
      <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center z-[99999] p-6 text-center text-white">
        <div className="relative w-20 h-20 mb-6 flex items-center justify-center">
          <div className={`absolute w-full h-full rounded-full border-4 border-t-transparent animate-spin ${
            role === 'driver' ? 'border-[#FF6B00]' : role === 'cooperative' ? 'border-[#10B981]' : 'border-[#FFE600]'
          }`} />
          <span className="text-xl animate-pulse">🔒</span>
        </div>
        <h3 className="text-lg font-black mb-1">Processing Vault Operation</h3>
        <p className="text-xs text-gray-400 mb-4 uppercase tracking-wider font-bold">{processingState || "Broadcasting..."}</p>
        <div className="text-xs text-gray-500 animate-pulse">
          Please wait for Stellar ledger agreement...
        </div>
      </div>
    );
  };

  // Terms and conditions modal builder
  const renderFirstTimeTermsModal = () => (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[99999] p-6 overflow-y-auto">
      <div className={`rounded-[32px] p-8 max-w-lg w-full border shadow-2xl transition-all my-8 ${
        dark ? 'bg-[#0E0F14] border-white/10 text-white' : 'bg-white border-gray-100 text-gray-900'
      }`}>
        <div className="text-center mb-6">
          <span className="text-4xl">🔐</span>
          <h2 className="text-2xl font-black mt-3">Vault Ledger Agreement</h2>
          <p className="text-xs text-gray-400 mt-1">Please accept the on-chain terms to unlock your Personal Vault</p>
        </div>

        <div className="space-y-4 mb-8 max-h-[300px] overflow-y-auto pr-2 text-xs leading-relaxed font-semibold">
          <div className={`p-4 rounded-2xl border ${dark ? 'bg-white/5 border-white/5' : 'bg-gray-50 border-gray-100'}`}>
            <h4 className="font-extrabold mb-1 text-amber-500">1. Immutable On-Chain Time-Lock</h4>
            <p className="text-gray-400">Funds locked inside the vault are mathematically restricted by the Stellar Soroban smart contract. Once set, there are zero mechanisms for early redemption, override, or cancellation by any party.</p>
          </div>

          <div className={`p-4 rounded-2xl border ${dark ? 'bg-white/5 border-white/5' : 'bg-gray-50 border-gray-100'}`}>
            <h4 className="font-extrabold mb-1 text-red-400">2. Cooperative Liquidation Lien</h4>
            <p className="text-gray-400">Your vault assets serve as primary security backing for outstanding fuel cooperative allowances. Defaulting on repayments authorizes smart-contract liquidation actions to satisfy the lien debt.</p>
          </div>

          <div className={`p-4 rounded-2xl border ${dark ? 'bg-white/5 border-white/5' : 'bg-gray-50 border-gray-100'}`}>
            <h4 className="font-extrabold mb-1 text-emerald-400">3. Trust Amplification benefits</h4>
            <p className="text-gray-400">Maintaining active vault balances generates trust metrics which increase credit availability thresholds and decrease interest rate basis points on active fuel lines.</p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleAgreeTerms}
            disabled={busy}
            className={`flex-1 py-4 rounded-xl font-black text-xs uppercase tracking-wider transition-all disabled:opacity-50 active:scale-95 ${theme.buttonAccent}`}
          >
            {busy ? "Authorizing..." : "I Accept the Vault Terms & Conditions"}
          </button>
          
          <button
            onClick={() => window.location.href = "/user"}
            className={`px-6 py-4 rounded-xl font-bold text-xs uppercase tracking-wider border transition-all active:scale-95 ${
              dark ? 'border-white/10 text-white hover:bg-white/5' : 'border-gray-200 text-gray-800'
            }`}
          >
            Back
          </button>
        </div>
      </div>
    </div>
  );

  // Form builder
  const renderLockForm = () => (
    <div className={`p-6 rounded-[24px] border shadow-sm space-y-4 ${theme.card}`}>
      <h3 className="text-base font-black">Configure Vault Lock</h3>
      <form onSubmit={handleLockFunds} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="block text-[10px] font-black mb-1.5 uppercase text-gray-400">Lock Percentage ({percentVal}%)</label>
            <select
              value={lockPercent}
              onChange={(e) => setLockPercent(e.target.value)}
              className={`w-full p-3 rounded-xl border text-xs font-semibold focus:outline-none focus:ring-1 ${
                dark ? 'bg-[#1f2937] border-white/10 text-white focus:ring-amber-500' : 'bg-gray-50 border-gray-200 focus:ring-blue-500'
              }`}
            >
              <option value="0">0% of Wallet Balance</option>
              <option value="25">25% of Wallet Balance</option>
              <option value="50">50% of Wallet Balance</option>
              <option value="75">75% of Wallet Balance</option>
              <option value="100">100% of Wallet Balance</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-black mb-1.5 uppercase text-gray-400">Lock Duration ({daysVal} Days)</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="1"
                max="180"
                value={lockDays}
                onChange={(e) => handleLockDaysChange(Number(e.target.value))}
                className="w-full h-2 rounded-full cursor-pointer transition-all duration-150"
                style={{ accentColor: theme.accent }}
              />
              <span className="text-xs font-black w-12 text-right shrink-0">{daysVal} d</span>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center p-3.5 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-400">
          <span>Estimated Lock Amount:</span>
          <span className="font-extrabold">{formatXlm(calculatedLockAmount)} XLM</span>
        </div>

        <div className="flex justify-between items-center p-3.5 rounded-xl text-xs font-bold bg-blue-500/10 text-blue-400">
          <span>Maturity Date:</span>
          <span className="font-extrabold">{calculatedMaturityDate}</span>
        </div>

        {/* Critical Terms Warning */}
        <div className={`p-4 rounded-xl text-[11px] leading-relaxed border ${dark ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-red-50 border-red-200 text-red-800'} space-y-2`}>
          <p className="font-extrabold uppercase tracking-wider">⚠️ Critical Vault Lockup Terms</p>
          <ul className="list-disc pl-4 space-y-1 font-semibold">
            <li><strong>No Early Redemptions:</strong> Once locked, these funds are cryptographically secured on-chain. There is absolutely no way to retrieve them until the maturity date ({calculatedMaturityDate}) is reached.</li>
            <li><strong>Cooperative Liquidation Lien:</strong> By locking funds, you agree that these assets serve as collateral. If a fuel credit line becomes overdue, cooperatives are authorized to automatically liquidate vault assets to settle the outstanding debt.</li>
            <li><strong>Trust Standing:</strong> Successful maturation redemptions increase your credit limit and score, reinforcing your scan-and-beam capabilities.</li>
          </ul>
        </div>

        {/* Agreement Checkbox */}
        <label className="flex items-start gap-2.5 cursor-pointer pt-2">
          <input
            type="checkbox"
            checked={agreeToTerms}
            onChange={(e) => setAgreeToTerms(e.target.checked)}
            className={`mt-0.5 rounded border-gray-300 focus:ring-opacity-50 ${
              role === 'driver' ? 'text-[#FF6B00] focus:ring-[#FF6B00]' : role === 'cooperative' ? 'text-[#10B981] focus:ring-[#10B981]' : 'text-[#FFE600] focus:ring-[#FFE600]'
            }`}
          />
          <span className="text-[10px] font-bold text-gray-400 select-none">
            I understand and agree to the lockup terms, maturity policy, and cooperative liquidation lien.
          </span>
        </label>

        <button
          type="submit"
          disabled={busy || calculatedLockAmount <= 0 || !agreeToTerms}
          className={`w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all disabled:opacity-50 ${theme.buttonAccent}`}
        >
          {busy ? "Locking..." : "Confirm & Authorize Lock"}
        </button>
      </form>
    </div>
  );

  // Trust Impact Card builder
  const renderTrustImpactCard = () => (
    <div className={`p-6 rounded-[24px] border shadow-sm relative overflow-hidden flex flex-col justify-center ${theme.card}`}>
      <div className={`absolute left-0 top-0 bottom-0 w-2.5 ${
        role === 'driver' ? 'bg-[#FF6B00]' : role === 'cooperative' ? 'bg-[#10B981]' : 'bg-[#FFE600]'
      }`}></div>
      <h3 className="text-sm font-black mb-3">Trust Score Impact</h3>
      <div className="space-y-4">
        <div>
          <div className="flex justify-between text-[10px] font-black mb-1.5">
            <span className="text-gray-400 uppercase tracking-wide">Trust Rating (Infinite)</span>
            <span className={role === 'driver' ? 'text-[#FF8833]' : role === 'cooperative' ? 'text-[#34D399]' : 'text-[#8A7D00] dark:text-[#FFE600]'}>
              {userData.trustScore} XP (Lvl {Math.floor(userData.trustScore / 100) + 1})
            </span>
          </div>
          <div className={`w-full rounded-full h-2 ${dark ? 'bg-white/5' : 'bg-gray-200'}`}>
            <div className={`h-2 rounded-full ${
              role === 'driver' ? 'bg-[#FF6B00]' : role === 'cooperative' ? 'bg-[#10B981]' : 'bg-[#FFE600]'
            }`} style={{ width: `${userData.trustScore % 100}%` }}></div>
          </div>
        </div>
        <p className="text-xs text-gray-500 leading-relaxed font-medium">
          Your locked savings vault is an unalterable representation of creditworthiness. Redemptions at maturity boost your trust score, while overdue credit lines may automatically liquidate vault assets.
        </p>
      </div>
    </div>
  );

  // Vault reminders card builder
  const renderVaultReminderCard = () => (
    <div className={`p-6 rounded-[24px] border shadow-sm ${theme.card}`}>
      <h3 className="text-sm font-black mb-3 uppercase tracking-wide text-gray-400">Vault Terms & Reminders</h3>
      <div className="space-y-4 text-xs">
        <div className="flex gap-3">
          <span className="text-lg">⏳</span>
          <div>
            <p className={`font-extrabold ${dark ? 'text-white' : 'text-gray-900'}`}>Time-Lock Enforcement</p>
            <p className="text-[10px] text-gray-500 mt-0.5">Funds are locked on the Stellar ledger for user-designated periods. Early extraction is cryptographically blocked.</p>
          </div>
        </div>
        <div className="flex gap-3">
          <span className="text-lg">🛡️</span>
          <div>
            <p className={`font-extrabold ${dark ? 'text-white' : 'text-gray-900'}`}>Collateral Liens</p>
            <p className="text-[10px] text-gray-500 mt-0.5">Active vaults back cooperative lines of credit. Unpaid balances will trigger auto-liquidation.</p>
          </div>
        </div>
        <div className="flex gap-3">
          <span className="text-lg">📈</span>
          <div>
            <p className={`font-extrabold ${dark ? 'text-white' : 'text-gray-900'}`}>Credit Limit Scaling</p>
            <p className="text-[10px] text-gray-500 mt-0.5">Maintaining vault balance improves your Trust Score, unlocking higher fuel allowances.</p>
          </div>
        </div>
      </div>
    </div>
  );

  // Dynamic Slider Card Builder
  const renderVaultRoutingSliderCard = () => {
    const accentColor = theme.accent;
    const progressPct = `${routingPct}%`;

    return (
      <div className={`p-6 rounded-[28px] border shadow-sm relative overflow-hidden transition-all duration-300 hover:shadow-md ${theme.card}`}>
        <div className="flex justify-between items-center mb-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wide text-gray-400">Vault Payment Routing</h3>
            <p className="text-[10px] text-gray-500 font-semibold mt-0.5">Automated on-chain allocation rate</p>
          </div>
          <span className={`text-2xl font-black ${
            role === 'driver' ? 'text-[#FF8833]' : role === 'cooperative' ? 'text-[#34D399]' : 'text-[#8A7D00] dark:text-[#FFE600]'
          }`}>
            {routingPct}%
          </span>
        </div>

        {/* Interactive range slider track */}
        <div className="py-4 space-y-3">
          <div className="relative w-full h-3 rounded-full bg-gray-200 dark:bg-white/5 flex items-center">
            {/* Dynamic colored progress fill */}
            <div 
              className="absolute left-0 h-full rounded-full transition-all duration-150" 
              style={{ 
                width: progressPct,
                backgroundColor: accentColor,
                opacity: 0.8
              }}
            />
            {/* Overlay Input Range control */}
            <input
              type="range"
              min="0"
              max="100"
              value={routingPct}
              onChange={(e) => handleSliderChange(Number(e.target.value))}
              className="absolute w-full h-full cursor-pointer opacity-0 z-20"
            />
            {/* Custom drag handle */}
            <div 
              className="absolute w-6 h-6 rounded-full border shadow-md flex items-center justify-center pointer-events-none transition-all duration-150 z-10"
              style={{ 
                left: `calc(${progressPct} - 12px)`,
                backgroundColor: dark ? '#0E0F14' : '#fff',
                borderColor: accentColor
              }}
            >
              <span className="text-[8px] font-black text-gray-500 select-none">↔</span>
            </div>
          </div>
          <div className="flex justify-between text-[8px] font-black text-gray-500 uppercase px-1">
            <span>0% (Direct)</span>
            <span>50% (Split)</span>
            <span>100% (Full Locked)</span>
          </div>
        </div>

        <p className="text-[10px] text-gray-500 leading-relaxed font-semibold">
          {routingPct === 0 ? (
            "No incoming P2P transfers are routed. All received assets go to your liquid balance."
          ) : (
            `Automatically slices ${routingPct}% of incoming payments and deposits them directly into your locked Personal Vault on-chain.`
          )}
        </p>
      </div>
    );
  };

  const renderOfflineReserveCard = () => {
    return (
      <div className={`p-6 rounded-[28px] border shadow-sm relative overflow-hidden transition-all duration-300 hover:shadow-md ${theme.card}`}>
        <div className="flex justify-between items-center mb-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wide text-gray-400">Offline Reserve Buffer</h3>
            <p className="text-[10px] text-gray-500 font-semibold mt-0.5">Funds reserved for offline Bluetooth payments</p>
          </div>
          <span className="text-2xl font-black text-amber-500">
            {offlineReserve} XLM
          </span>
        </div>
        <form onSubmit={handleSetOfflineReserve} className="flex gap-2 mt-4">
          <input
            type="number"
            min="0"
            max={walletBalance}
            step="any"
            placeholder="Reserve Amount (XLM)"
            value={inputReserve}
            onChange={(e) => setInputReserve(e.target.value)}
            className={`flex-1 px-4 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 ${
              dark ? 'bg-black/40 border-white/10 text-white placeholder-gray-400 focus:ring-amber-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-500 focus:ring-amber-500'
            }`}
          />
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl bg-amber-500 text-black hover:bg-amber-400 active:scale-95 transition-all"
          >
            Lock
          </button>
        </form>
        <p className="text-[10px] text-gray-500 leading-relaxed font-semibold mt-3">
          Your spendable online balance will be reduced by your offline reserve. When offline, you can spend up to your reserved balance.
        </p>
      </div>
    );
  };

  // Active Locks List builder
  const renderActiveLocksList = () => (
    <div className={`p-6 rounded-[24px] border shadow-sm flex flex-col ${theme.card}`}>
      <h3 className="font-black text-sm mb-4 uppercase tracking-wider text-gray-400">Lock Registry</h3>
      <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
        {vaults.length === 0 ? (
          <p className="text-xs font-bold text-gray-500 text-center py-10">No vault records found.</p>
        ) : (
          vaults.map((vault) => {
            const matured = isMatured(vault.maturityDate);
            return (
              <div key={vault.id} className={`p-4 rounded-xl border ${dark ? 'bg-white/5 border-white/5' : 'bg-gray-50 border-gray-200'}`}>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-black text-sm">{formatXlm(vault.lockedAmount)} XLM</p>
                    <p className="text-[10px] font-black text-gray-400 mt-0.5 uppercase tracking-wider">
                      {vault.lockDays}-Day Lock
                    </p>
                  </div>
                  <span className={`text-[10px] font-black px-2 py-1 rounded-md uppercase tracking-wider ${
                    vault.status === "redeemed"
                      ? "bg-blue-500/10 text-blue-400"
                      : vault.status === "liquidated"
                      ? "bg-red-500/10 text-red-400"
                      : matured
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-amber-500/10 text-amber-400"
                  }`}>
                    {vault.status === "locked" && matured ? "Matured" : vault.status}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs font-semibold text-gray-500">
                  <span className="text-[10px]">📅 Due: {vault.maturityDate}</span>
                  {vault.status === "locked" && matured && (
                    <button
                      onClick={() => handleRedeem(vault)}
                      disabled={busy}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all active:scale-95 ${theme.buttonAccent}`}
                    >
                      Redeem
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  // Mobile Bento Grid Layout Builder
  const renderMobileBentoGrid = () => (
    <div className="lg:hidden grid grid-cols-2 gap-4">
      {/* Locked Vault Hero (Full 2-column span) */}
      <div className={`col-span-2 relative overflow-hidden rounded-[28px] p-6 text-white shadow-lg transition-all ${
        dark ? 'bg-gradient-to-br from-[#141620] to-[#0E0F14] border border-white/5' : 'bg-gradient-to-br from-[#2D231E] to-[#1C1512]'
      }`}>
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#FFE600] opacity-[0.03] rounded-full blur-2xl -mr-8 -mt-8 pointer-events-none"></div>
        <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Locked Savings</span>
        <h2 className="text-3xl font-black mt-2">{formatXlm(vaultBalance)} XLM</h2>
        <button
          onClick={() => setShowLockForm(!showLockForm)}
          className={`w-full mt-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider shadow-md transition-all ${
            showLockForm ? 'bg-red-500 text-white' : theme.buttonAccent
          }`}
        >
          {showLockForm ? "Cancel Locking" : "+ Lock Funds"}
        </button>
      </div>

      {/* Lock Form (Full 2-column span if open) */}
      {showLockForm && (
        <div className="col-span-2">
          {renderLockForm()}
        </div>
      )}

      {/* Dynamic Touch Slider (Full 2-column span) */}
      <div className="col-span-2">
        {renderVaultRoutingSliderCard()}
      </div>

      {/* Offline Reserve Card (Full 2-column span) */}
      <div className="col-span-2">
        {renderOfflineReserveCard()}
      </div>

      {/* Available Balance Bento Box (Col 1) */}
      <div className={`rounded-[24px] p-5 border shadow-sm flex flex-col justify-between ${theme.card}`}>
        <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider">Available</span>
        <h3 className={`text-base font-black mt-1 ${theme.accentText}`}>{formatXlm(walletBalance)} XLM</h3>
      </div>

      {/* Trust Score / Multiplier Bento Box (Col 2) */}
      <div className={`rounded-[24px] p-5 border shadow-sm flex flex-col justify-between ${theme.card}`}>
        <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider">Trust Bonus</span>
        <h3 className="text-base font-black mt-1 text-emerald-500">
          +{vaults.filter(v => v.status === "locked").reduce((acc, v) => acc + scoreDeltaForVault(v.lockedAmount, v.lockDays), 0)} pts
        </h3>
      </div>

      {/* Active Locks List (Full 2-column span) */}
      <div className="col-span-2">
        {renderActiveLocksList()}
      </div>

      {/* Telemetry Logs Console (Full 2-column span) */}
      <div className="col-span-2">
        {renderTelemetryLogs()}
      </div>

      {/* Policy Reminders (Full 2-column span) */}
      <div className="col-span-2">
        {renderVaultReminderCard()}
      </div>
    </div>
  );

  // Commuter Layout - Sleek, large bento cards with yellow accents
  const renderCommuter = () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-slide-up">
      {/* Left 2 Cols: Main savings hero and interactive lock form */}
      <div className="lg:col-span-2 space-y-6">
        {/* Savings Hero Card */}
        <div className={`relative overflow-hidden rounded-[32px] p-8 sm:p-10 text-white shadow-xl premium-card transition-all ${
          dark ? 'bg-gradient-to-br from-[#0E0F14] to-[#12141C] border border-white/5' : 'bg-gradient-to-br from-[#1E293B] to-[#0F172A]'
        }`}>
          <div className="absolute top-0 right-0 w-48 h-48 bg-[#FFE600] opacity-[0.03] rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">🔒</span>
            <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">Total Locked Savings</p>
          </div>
          <div className="flex items-baseline gap-2 mb-8 relative z-10">
            <h2 className="text-4xl sm:text-5xl font-black tracking-tight">{formatXlm(vaultBalance)}</h2>
            <span className="text-lg font-bold text-gray-400">XLM</span>
          </div>
          <button
            onClick={() => setShowLockForm(!showLockForm)}
            className={`w-full sm:w-auto px-6 py-3.5 rounded-xl font-black text-xs uppercase tracking-wider shadow-lg active:scale-95 transition-all ${
              showLockForm ? 'bg-red-500 text-white' : 'bg-[#FFE600] text-black hover:bg-[#E6CE00]'
            }`}
          >
            {showLockForm ? "Cancel Locking" : "+ Lock Funds"}
          </button>
        </div>

        {/* Lock Form */}
        {showLockForm && renderLockForm()}

        {/* Dynamic Slider (Bento Box) */}
        {renderVaultRoutingSliderCard()}

        {/* Dynamic Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className={`p-6 rounded-[24px] border shadow-sm flex flex-col justify-between ${theme.card}`}>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Available Wallet Balance</p>
              <h3 className="text-2xl font-black mt-2 text-[#FFE600]">{formatXlm(walletBalance)} XLM</h3>
            </div>
            <p className="text-[10px] text-gray-500 mt-4">For standard peer-to-peer transfers</p>
          </div>
          <div className={`p-6 rounded-[24px] border shadow-sm flex flex-col justify-between ${theme.card}`}>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Trust Score Multiplier</p>
              <h3 className="text-2xl font-black mt-2 text-emerald-500">
                +{vaults.filter(v => v.status === "locked").reduce((acc, v) => acc + scoreDeltaForVault(v.lockedAmount, v.lockDays), 0)} pts
              </h3>
            </div>
            <p className="text-[10px] text-gray-500 mt-4">Currently boosting borrow ceilings</p>
          </div>
        </div>
      </div>

      {/* Right Column: Trust, Reminders and Active list */}
      <div className="space-y-6">
        {/* Trust Impact */}
        {renderTrustImpactCard()}
        {/* Policy Reminders */}
        {renderVaultReminderCard()}
        {/* Active Locks list */}
        {renderActiveLocksList()}
        {/* Telemetry Console */}
        {renderTelemetryLogs()}
      </div>
    </div>
  );

  // Driver Layout - Sturdy vertical stack optimized for mobile screen flow
  const renderDriver = () => (
    <div className="space-y-6">
      {/* Savings Hero Card */}
      <div className={`relative overflow-hidden rounded-[28px] p-8 text-white shadow-lg transition-all ${
        dark ? 'bg-gradient-to-br from-[#141620] to-[#0E0F14] border border-white/5' : 'bg-gradient-to-br from-[#2D231E] to-[#1C1512]'
      }`}>
        <div className="absolute top-0 right-0 w-48 h-48 bg-[#FF6B00] opacity-[0.03] rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">🔒</span>
          <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">Total Locked Savings</p>
        </div>
        <div className="flex items-baseline gap-2 mb-6">
          <h2 className="text-4xl sm:text-5xl font-black tracking-tight">{formatXlm(vaultBalance)}</h2>
          <span className="text-lg font-bold text-gray-400">XLM</span>
        </div>
        <button
          onClick={() => setShowLockForm(!showLockForm)}
          className={`w-full sm:w-auto px-6 py-3.5 rounded-xl font-black text-xs uppercase tracking-wider shadow-lg active:scale-95 transition-all ${
            showLockForm ? 'bg-red-500 text-white' : 'bg-[#FF6B00] text-white hover:bg-[#E05E00]'
          }`}
        >
          {showLockForm ? "Cancel Locking" : "+ Lock Funds"}
        </button>
      </div>

      {/* Lock Form */}
      {showLockForm && renderLockForm()}

      {/* Dynamic Touch Slider */}
      {renderVaultRoutingSliderCard()}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className={`p-6 rounded-[24px] border shadow-sm ${theme.card}`}>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Available Wallet Balance</p>
          <h3 className="text-2xl font-black mt-2 text-[#FF8833]">{formatXlm(walletBalance)} XLM</h3>
          <p className="text-[10px] text-gray-500 mt-2">Available for daily operations</p>
        </div>
        <div className={`p-6 rounded-[24px] border shadow-sm ${theme.card}`}>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Trust score multiplier</p>
          <h3 className="text-2xl font-black mt-2 text-emerald-500">
            +{vaults.filter(v => v.status === "locked").reduce((acc, v) => acc + scoreDeltaForVault(v.lockedAmount, v.lockDays), 0)} pts
          </h3>
          <p className="text-[10px] text-gray-500 mt-2">Currently boosting fuel credit limits</p>
        </div>
      </div>

      {/* Trust Score, Reminders, Telemetry & Active Locks */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {renderTrustImpactCard()}
        {renderVaultReminderCard()}
        {renderActiveLocksList()}
        {renderTelemetryLogs()}
      </div>
    </div>
  );

  // Cooperative Layout - Treasury grid and professional tables
  const renderCooperative = () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-slide-up">
      {/* Left Column: Treasury Lock Form */}
      <div className="lg:col-span-1 space-y-6">
        <div className={`p-6 rounded-[28px] border shadow-sm ${theme.card}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">🏛️</span>
            <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">Cooperative Reserves</p>
          </div>
          <h2 className="text-3xl font-black mt-1 text-[#34D399]">{formatXlm(vaultBalance)} XLM</h2>
          <p className="text-[11px] text-gray-500 mt-3 leading-relaxed">
            Reserve lockups establish the cooperative trust rating, bolstering system liquidity thresholds.
          </p>
          <button
            onClick={() => setShowLockForm(!showLockForm)}
            className={`w-full mt-6 px-5 py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all active:scale-95 ${
              showLockForm ? 'bg-red-500 text-white' : 'bg-[#10B981] text-white hover:bg-[#0E9F6E]'
            }`}
          >
            {showLockForm ? "Cancel Locking" : "+ Allocate Reserves"}
          </button>
        </div>

        {showLockForm && renderLockForm()}

        {/* Dynamic Touch Slider */}
        {renderVaultRoutingSliderCard()}

        {/* Secondary Stats */}
        <div className={`p-6 rounded-[28px] border shadow-sm ${theme.card}`}>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Wallet Reserves</p>
          <h3 className="text-xl font-black mt-2 text-gray-300">{formatXlm(walletBalance)} XLM</h3>
          <p className="text-[10px] text-gray-500 mt-2">Liquid and readily deployable</p>
        </div>
      </div>

      {/* Right 2 Columns: Lists and details */}
      <div className="lg:col-span-2 space-y-6">
        {renderTrustImpactCard()}
        {renderVaultReminderCard()}
        {renderActiveLocksList()}
        {renderTelemetryLogs()}
      </div>
    </div>
  );

  return (
    <UserLayout activeTab="vault" userData={userData}>
      <div className={`max-w-5xl mx-auto space-y-6 transition-colors duration-200`}>

        {/* Page locking entry screen overlay */}
        {!isUnlocked && renderUnlockPage()}

        {isUnlocked && (
          <>
            {/* Loading Overlay */}
            {renderProcessingOverlay()}

            {/* PIN Keyboard Modal */}
            {showPinModal && renderPinModal()}

            {/* Header Area */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h1 className={`text-2xl font-black ${dark ? 'text-white' : 'text-gray-900'}`}>Personal Vault</h1>
              <div className={`rounded-full px-4 py-2 flex items-center gap-2 shadow-sm w-max border ${dark ? 'bg-blue-955/20 border-blue-900/30' : 'bg-blue-50 border-blue-100'}`}>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
                </span>
                <span className={`text-[10px] font-black tracking-wider uppercase ${dark ? 'text-blue-300' : 'text-blue-800'}`}>
                  Bluetooth Sync Active
                </span>
              </div>
            </div>

            {/* First Time Terms Modal */}
            {showTermsModal && renderFirstTimeTermsModal()}

            {/* Responsive Layouts */}
            {/* Mobile View Bento Grid */}
            <div className="lg:hidden">
              {renderMobileBentoGrid()}
            </div>

            {/* Laptop / Desktop View Layouts */}
            <div className="hidden lg:block">
              {role === "driver" ? renderDriver() : role === "cooperative" ? renderCooperative() : renderCommuter()}
            </div>
          </>
        )}
      </div>
    </UserLayout>
  );
};

export default UserVault;
