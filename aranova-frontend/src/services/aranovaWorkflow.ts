import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, increment, runTransaction } from "firebase/firestore";
import { db } from "../firebase/config";
import CryptoJS from "crypto-js";

export const ADMIN_PUBLIC_KEY = import.meta.env.VITE_ADMIN_PUBLIC_KEY || "GBCCH2V73VZ7X4A7Y47M3X6JCEHHR3Y24O4FDR3PZ5MZEZNZWYYUP77X";
export const dayMs = 24 * 60 * 60 * 1000;

export type UserRole = "commuter" | "driver" | "cooperative";

export type Policy = {
    maxApprovedAmount: number;
    interestRate: number;
    durationValue: number;
    durationUnit: "days" | "weeks" | "months" | "years";
};

export const defaultPolicy: Policy = {
    maxApprovedAmount: 100,
    interestRate: 3,
    durationValue: 30,
    durationUnit: "days",
};

export const formatXlm = (value: number) => Number(value || 0).toFixed(2);

export const toDurationDays = (value: number, unit: Policy["durationUnit"]) => {
    switch (unit) {
        case "weeks":
            return value * 7;
        case "months":
            return value * 30;
        case "years":
            return value * 365;
        default:
            return value;
    }
};

export const parseTimestamp = (value: any) => {
    if (!value) return null;
    if (typeof value === "string") return new Date(value);
    if (typeof value?.toDate === "function") return value.toDate();
    if (value?.seconds) return new Date(value.seconds * 1000);
    return null;
};

export const scoreDeltaForVault = (lockedAmount: number, days: number) => {
    const base = Math.min(5, Math.ceil(lockedAmount / 20));
    return base + Math.min(5, Math.ceil(days / 14));
};

export const getDocsSafe = async (q: any): Promise<any[]> => {
    const snapshot = await getDocs(q);
    return snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Record<string, any>) }));
};

export const ensureUserProfile = async (user: any) => {
    const ref = doc(db, "users", user.uid);
    let snap;
    try {
        snap = await getDoc(ref);
    } catch (err) {
        console.warn("User profile fetch failed, retrying after 600ms auth synchronization...", err);
        await new Promise((res) => setTimeout(res, 600));
        snap = await getDoc(ref);
    }

    if (!snap.exists()) {
        const profile = {
            uid: user.uid,
            email: user.email || "",
            displayName: user.displayName || "New User",
            role: "commuter" as UserRole,
            approved: true,
            publicKey: "",
            walletBalance: 100,
            vaultBalance: 0,
            trustScore: 0,
            cooperativeId: null,
            lastTrustUpdate: null,
            createdAt: serverTimestamp(),
        };
        await setDoc(ref, profile, { merge: true });
        return profile;
    }

    return { uid: user.uid, ...snap.data() };
};

export const recalculateAndSyncTrustScore = async (userId: string) => {
    try {
        const userRef = doc(db, "users", userId);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) return 0;
        const userData = userSnap.data();

        let finalScore = 30; // starting baseline to prevent bootstrapping deadlock
        
        try {
            const { getTrustScoreOnChain } = await import("./sorobanService");
            if (userData.publicKey) {
                const onChainScore = await getTrustScoreOnChain(userData.publicKey);
                if (onChainScore >= 0n) {
                    finalScore = Number(onChainScore);
                }
            }
        } catch (chainErr) {
            console.warn("Failed to retrieve authoritative trust score from blockchain:", chainErr);
            // Default fallback logic if offline/blockchain not configured
            let fallbackScore = 30;
            const vaultSnap = await getDocs(query(collection(db, "vaults"), where("ownerId", "==", userId)));
            let vaultPoints = 0;
            vaultSnap.forEach((docSnap) => {
                const v = docSnap.data();
                if (v.status === "locked") vaultPoints += Math.floor(Number(v.lockedAmount || 0) / 5);
                else if (v.status === "redeemed") vaultPoints += 10;
            });
            fallbackScore += Math.min(50, vaultPoints);
            finalScore = Math.max(0, fallbackScore);
        }

        await updateDoc(userRef, {
            trustScore: finalScore,
            lastTrustUpdate: serverTimestamp()
        });

        return finalScore;
    } catch (error) {
        console.error("Error recalculating trust score:", error);
        return 30;
    }
};

export const maybeRunDailyTrustUpdate = async (userData: any) => {
    const lastUpdate = parseTimestamp(userData.lastTrustUpdate);
    if (lastUpdate && Date.now() - lastUpdate.getTime() < dayMs) return;

    const now = Date.now();

    // Admin Loans only — fuel_credit has its own overdue logic managed by the cooperative
    const loanSnap = await getDocsSafe(query(collection(db, "fuel_requests"), where("driverId", "==", userData.uid), where("type", "==", "loan")));
    const activeOverdueLoans = loanSnap.filter((item) => {
        const record = item as Record<string, any>;
        const approvedAt = parseTimestamp(record.approvedAt || record.createdAt);
        const durationDays = Number(record.durationDays || defaultPolicy.durationValue);
        return record.status === "active" && approvedAt && now - approvedAt.getTime() > durationDays * dayMs;
    });

    const overdue = activeOverdueLoans.length > 0;

    if (overdue) {
        // Auto vault redirection rule for overdue loans
        for (const loan of activeOverdueLoans) {
            const loanRef = doc(db, "fuel_requests", loan.id);
            const outstandingAmount = Number(loan.approvedAmount || loan.amount);

            // Fetch active vaults owned by this user
            const activeVaults = await getDocsSafe(query(
                collection(db, "vaults"),
                where("ownerId", "==", userData.uid),
                where("status", "==", "locked")
            ));

            if (activeVaults.length > 0) {
                for (const vault of activeVaults) {
                    const vaultRef = doc(db, "vaults", vault.id);
                    const vaultAmount = Number(vault.lockedAmount || 0);

                    if (vaultAmount > 0) {
                        const redirectAmount = Math.min(vaultAmount, outstandingAmount);

                        // Deduct from vault and user's vault balance
                        await updateDoc(vaultRef, {
                            lockedAmount: increment(-redirectAmount),
                            status: vaultAmount - redirectAmount <= 0 ? "liquidated" : "locked"
                        });

                        await updateDoc(doc(db, "users", userData.uid), {
                            vaultBalance: increment(-redirectAmount),
                        });

                        // Settle the loan
                        const isFullyPaid = redirectAmount === outstandingAmount;
                        await updateDoc(loanRef, {
                            status: isFullyPaid ? "repaid" : "active",
                            approvedAmount: increment(-redirectAmount),
                            amount: increment(-redirectAmount),
                            liquidatedFromVault: increment(redirectAmount)
                        });

                        // Credit Cooperative pool (route to admin_stats if coopId is 'admin' or empty)
                        const destStatsCol = (!loan.coopId || loan.coopId === "admin") ? "admin_stats" : "coop_stats";
                        const destStatsId = (!loan.coopId || loan.coopId === "admin") ? "global" : loan.coopId;

                        await setDoc(doc(db, destStatsCol, destStatsId), {
                            poolBalance: increment(redirectAmount),
                            totalRepaid: increment(redirectAmount),
                            outstanding: increment(-redirectAmount),
                        }, { merge: true });

                        // Log transaction
                        await addDoc(collection(db, "transactions"), {
                            type: "vault_liquidation",
                            from: userData.uid,
                            to: loan.coopId,
                            amount: redirectAmount,
                            status: "completed",
                            createdAt: serverTimestamp(),
                        });
                        break; // Liquidate one vault in this check
                    }
                }
            }
        }
    }

    // Dynamic dynamic recalculate after updates
    await recalculateAndSyncTrustScore(userData.uid);
};

export const queueBluetoothPayment = (userId: string, payload: any) => {
    const key = `aranova_offline_queue_${userId}`;
    const existing = JSON.parse(localStorage.getItem(key) || "[]") as any[];
    const item = { id: crypto.randomUUID(), ...payload, createdAt: new Date().toISOString() };
    existing.push(item);
    localStorage.setItem(key, JSON.stringify(existing));
    return item;
};

export const syncBluetoothQueue = async (userId: string) => {
    if (!navigator.onLine) return;

    // Concurrency Lock
    const lockKey = `aranova_sync_lock_${userId}`;
    const isLocked = localStorage.getItem(lockKey);
    if (isLocked) {
        const lockTime = Number(isLocked);
        if (Date.now() - lockTime < 10000) {
            console.warn("Queue sync is already running in another tab.");
            return;
        }
    }
    localStorage.setItem(lockKey, Date.now().toString());

    // 1. Process Outgoing Queue (Payer)
    const outgoingKey = `aranova_offline_queue_${userId}`;
    const outgoing = JSON.parse(localStorage.getItem(outgoingKey) || "[]") as any[];
    if (outgoing.length > 0) {
        const failedOutgoing: any[] = [];
        for (const payment of outgoing) {
            const amt = Number(payment.amount || 0);
            if (amt <= 0) continue;

            try {
                // Database transaction update
                const commuterRef = doc(db, "users", userId);
                await runTransaction(db, async (transaction) => {
                    const commuterDoc = await transaction.get(commuterRef);
                    if (!commuterDoc.exists()) {
                        throw new Error("Commuter profile not found.");
                    }
                    const currentBalance = Number(commuterDoc.data().walletBalance || 0);
                    if (currentBalance < amt) {
                        throw new Error("Insufficient balance on server.");
                    }
                    transaction.update(commuterRef, {
                        walletBalance: increment(-amt)
                    });
                });

                // Credit recipient
                const qRecipient = query(collection(db, "users"), where("publicKey", "==", payment.recipient));
                const recipientDocs = await getDocs(qRecipient);
                if (!recipientDocs.empty) {
                    const driverId = recipientDocs.docs[0].id;
                    await updateDoc(doc(db, "users", driverId), {
                        walletBalance: increment(amt)
                    });
                }

                // Submit native Stellar payment transaction if private key is stored
                try {
                    const secret = localStorage.getItem(`aranova_wallet_secret_${userId}`);
                    if (secret) {
                        const { Keypair, TransactionBuilder, Operation, Asset, Horizon } = await import("@stellar/stellar-sdk");
                        const kp = Keypair.fromSecret(secret);
                        const serverUrl = import.meta.env.VITE_HORIZON_URL || "https://horizon-testnet.stellar.org";
                        const server = new Horizon.Server(serverUrl);
                        const sourceAccount = await server.loadAccount(kp.publicKey());
                        const tx = new TransactionBuilder(sourceAccount, {
                            fee: "100",
                            networkPassphrase: import.meta.env.VITE_NETWORK_PASSPHRASE || "Test Stellar Network ; September 2015"
                        })
                        .addOperation(Operation.payment({
                            destination: payment.recipient,
                            asset: Asset.native(),
                            amount: amt.toFixed(7)
                        }))
                        .setTimeout(30)
                        .build();
                        tx.sign(kp);
                        await server.submitTransaction(tx);
                    }
                } catch (stellarErr) {
                    console.warn("Stellar on-chain sync failed for outgoing payment:", stellarErr);
                }

                const txDocId = payment.nonce || payment.id;
                await setDoc(doc(db, "transactions", txDocId), {
                    type: "bluetooth_payment",
                    from: userId,
                    to: payment.recipient,
                    amount: amt,
                    status: "synced",
                    createdAt: serverTimestamp(),
                });

                const pendingKey = `aranova_pending_offline_deductions_${userId}`;
                const currentPending = Number(localStorage.getItem(pendingKey) || "0");
                localStorage.setItem(pendingKey, Math.max(0, currentPending - amt).toString());
            } catch (err) {
                console.error("Failed to sync outgoing offline payment:", err);
                failedOutgoing.push(payment);
            }
        }
        if (failedOutgoing.length) {
            localStorage.setItem(outgoingKey, JSON.stringify(failedOutgoing));
        } else {
            localStorage.removeItem(outgoingKey);
        }
    }

    // 2. Process Received Queue (Receiver with double-signed receipts)
    const recKey = `aranova_received_offline_${userId}`;
    const received = JSON.parse(localStorage.getItem(recKey) || "[]") as any[];
    if (received.length > 0) {
        const failedReceived: any[] = [];
        for (const receipt of received) {
            const amt = Number(receipt.amount || 0);
            if (amt <= 0) continue;

            try {
                // Deduct payer
                const qPayer = query(collection(db, "users"), where("publicKey", "==", receipt.payerKey));
                const payerDocs = await getDocs(qPayer);
                if (!payerDocs.empty) {
                    const payerId = payerDocs.docs[0].id;
                    const payerRef = doc(db, "users", payerId);
                    await runTransaction(db, async (transaction) => {
                        const payerDoc = await transaction.get(payerRef);
                        if (!payerDoc.exists()) {
                            throw new Error("Payer profile not found.");
                        }
                        const currentBalance = Number(payerDoc.data().walletBalance || 0);
                        if (currentBalance < amt) {
                            throw new Error("Payer has insufficient balance.");
                        }
                        transaction.update(payerRef, {
                            walletBalance: increment(-amt)
                        });
                    });
                }

                // Credit receiver
                const receiverRef = doc(db, "users", userId);
                await updateDoc(receiverRef, {
                    walletBalance: increment(amt)
                });

                // Submit on-chain native Stellar payment using administrator funding account
                try {
                    const adminSecret = import.meta.env.VITE_ADMIN_SECRET;
                    if (adminSecret) {
                        const { Keypair, TransactionBuilder, Operation, Asset, Horizon } = await import("@stellar/stellar-sdk");
                        const adminKp = Keypair.fromSecret(adminSecret);
                        const serverUrl = import.meta.env.VITE_HORIZON_URL || "https://horizon-testnet.stellar.org";
                        const server = new Horizon.Server(serverUrl);
                        const sourceAccount = await server.loadAccount(adminKp.publicKey());
                        const tx = new TransactionBuilder(sourceAccount, {
                            fee: "100",
                            networkPassphrase: import.meta.env.VITE_NETWORK_PASSPHRASE || "Test Stellar Network ; September 2015"
                        })
                        .addOperation(Operation.payment({
                            destination: receipt.receiverKey,
                            asset: Asset.native(),
                            amount: amt.toFixed(7)
                        }))
                        .setTimeout(30)
                        .build();
                        tx.sign(adminKp);
                        await server.submitTransaction(tx);
                    }
                } catch (stellarErr) {
                    console.warn("Stellar on-chain sync failed for received receipt:", stellarErr);
                }

                const txDocId = receipt.nonce || receipt.id;
                await setDoc(doc(db, "transactions", txDocId), {
                    type: "double_signed_receipt_payment",
                    from: receipt.payerKey,
                    to: receipt.receiverKey,
                    amount: amt,
                    status: "synced",
                    doubleSigned: true,
                    createdAt: serverTimestamp(),
                });
            } catch (err) {
                console.error("Failed to sync received offline receipt:", err);
                failedReceived.push(receipt);
            }
        }
        if (failedReceived.length) {
            localStorage.setItem(recKey, JSON.stringify(failedReceived));
        } else {
            localStorage.removeItem(recKey);
        }
    }

    localStorage.removeItem(lockKey);
};

// ─── Cryptographic Helpers for Secure PIN Encryption ───
export const encryptWithPin = (plaintext: string, pin: string): string => {
    const salt = CryptoJS.lib.WordArray.random(128 / 8);
    const key = CryptoJS.PBKDF2(pin, salt, {
        keySize: 256 / 32,
        iterations: 5000
    });
    const iv = CryptoJS.lib.WordArray.random(128 / 8);
    const encrypted = CryptoJS.AES.encrypt(plaintext, key, { iv: iv });
    return `${salt.toString()}:${iv.toString()}:${encrypted.toString()}`;
};

export const decryptWithPin = (encryptedData: string, pin: string): string => {
    try {
        if (!encryptedData) return "";
        const parts = encryptedData.split(":");
        if (parts.length !== 3) {
            // Fallback for legacy simple CryptoJS.AES encryptions
            const bytes = CryptoJS.AES.decrypt(encryptedData, pin);
            return bytes.toString(CryptoJS.enc.Utf8);
        }
        const salt = CryptoJS.enc.Hex.parse(parts[0]);
        const iv = CryptoJS.enc.Hex.parse(parts[1]);
        const ciphertext = parts[2];
        const key = CryptoJS.PBKDF2(pin, salt, {
            keySize: 256 / 32,
            iterations: 5000
        });
        const decrypted = CryptoJS.AES.decrypt(ciphertext, key, { iv: iv });
        return decrypted.toString(CryptoJS.enc.Utf8);
    } catch (e) {
        return "";
    }
};

export const checkPinLockout = (userId: string): string | null => {
    const lockoutKey = `aranova_pin_lockout_${userId}`;
    const attemptsKey = `aranova_pin_attempts_${userId}`;
    const lockoutTimeStr = localStorage.getItem(lockoutKey);
    if (lockoutTimeStr) {
        const lockoutUntil = Number(lockoutTimeStr);
        if (Date.now() < lockoutUntil) {
            const remainingSeconds = Math.ceil((lockoutUntil - Date.now()) / 1000);
            return `Too many failed attempts. Try again in ${remainingSeconds} seconds.`;
        } else {
            localStorage.removeItem(lockoutKey);
            localStorage.setItem(attemptsKey, "0");
        }
    }
    return null;
};

export const registerFailedPinAttempt = (userId: string): string => {
    const attemptsKey = `aranova_pin_attempts_${userId}`;
    const lockoutKey = `aranova_pin_lockout_${userId}`;
    const currentAttempts = Number(localStorage.getItem(attemptsKey) || "0") + 1;
    localStorage.setItem(attemptsKey, currentAttempts.toString());
    
    if (currentAttempts >= 10) {
        const lockoutUntil = Date.now() + 15 * 60 * 1000;
        localStorage.setItem(lockoutKey, lockoutUntil.toString());
        return "Too many failed attempts. PIN locked for 15 minutes.";
    } else if (currentAttempts >= 3) {
        const lockoutUntil = Date.now() + 30 * 1000;
        localStorage.setItem(lockoutKey, lockoutUntil.toString());
        return "Incorrect PIN. Locked out for 30 seconds.";
    }
    return `Incorrect PIN. ${3 - (currentAttempts % 3)} attempts remaining before temp lock.`;
};

export const clearPinAttempts = (userId: string): void => {
    const attemptsKey = `aranova_pin_attempts_${userId}`;
    const lockoutKey = `aranova_pin_lockout_${userId}`;
    localStorage.removeItem(attemptsKey);
    localStorage.removeItem(lockoutKey);
};
