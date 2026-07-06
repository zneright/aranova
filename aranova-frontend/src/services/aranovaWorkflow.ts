import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, increment } from "firebase/firestore";
import { db } from "../firebase/config";

export const ADMIN_PUBLIC_KEY = "GADMINPABORANOVAPLACEHOLDERRRRRRRRRRRRRRRRRRRRRRRRRRRRA";
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

export const makePublicKey = (uid: string) => `G${uid.replace(/[^a-zA-Z0-9]/g, "").slice(0, 55)}`.padEnd(56, "A");

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
            publicKey: makePublicKey(user.uid),
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
        
        let score = 0; // Starting baseline
        const now = Date.now();

        // 1. Vault locks (+1 point for every 5 XLM locked)
        const vaultSnap = await getDocs(query(collection(db, "vaults"), where("ownerId", "==", userId)));
        vaultSnap.forEach((docSnap) => {
            const v = docSnap.data();
            const lockedAmount = Number(v.lockedAmount || 0);
            if (v.status === "locked") {
                score += Math.floor(lockedAmount / 5);
            } else if (v.status === "redeemed") {
                score += 10; // Lifecycle completed reward
            }
        });

        // 2. Admin Loan repayments and daily bonuses (type:"loan" only — never mix with fuel_credit)
        const loanSnap = await getDocs(query(collection(db, "fuel_requests"), where("driverId", "==", userId), where("type", "==", "loan")));
        const repaidDates: Set<string> = new Set();
        
        loanSnap.forEach((docSnap) => {
            const loan = docSnap.data();
            if (loan.status === "repaid") {
                score += 5; // Standard repayment points
                
                // Add daily bonus tracking
                const repaidAtDate = parseTimestamp(loan.repaidAt || loan.createdAt);
                if (repaidAtDate) {
                    const dateKey = repaidAtDate.toISOString().split("T")[0]; // YYYY-MM-DD
                    repaidDates.add(dateKey);
                }
            }
        });

        // Add +2 points for every unique day a loan was settled
        score += repaidDates.size * 2;

        // 3. Penalize active loans that are past their due date
        loanSnap.forEach((docSnap) => {
            const loan = docSnap.data();
            if (loan.status === "active") {
                const approvedAt = parseTimestamp(loan.approvedAt || loan.createdAt);
                if (approvedAt) {
                    const durationDays = Number(loan.durationDays || 30);
                    const dueDate = approvedAt.getTime() + durationDays * 24 * 60 * 60 * 1000;
                    
                    if (now > dueDate) {
                        const msOverdue = now - dueDate;
                        const daysOverdue = Math.floor(msOverdue / (24 * 60 * 60 * 1000));
                        
                        // Penalty: -20 base points + (-5 points for each full day overdue)
                        score -= (20 + daysOverdue * 5);
                    }
                }
            }
        });

        // Lower limit is 0
        const finalScore = Math.max(0, score);
        
        await updateDoc(userRef, {
            trustScore: finalScore,
            lastTrustUpdate: serverTimestamp()
        });

        return finalScore;
    } catch (error) {
        console.error("Error recalculating trust score:", error);
        return 0;
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

                        // Credit Cooperative pool
                        await setDoc(doc(db, "coop_stats", loan.coopId), {
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
    const key = `aranova_offline_queue_${userId}`;
    const queued = JSON.parse(localStorage.getItem(key) || "[]") as any[];
    if (!queued.length) return;

    for (const payment of queued) {
        const amt = Number(payment.amount || 0);
        if (amt <= 0) continue;

        try {
            // Deduct commuter's balance
            await updateDoc(doc(db, "users", userId), {
                walletBalance: increment(-amt)
            });

            // Credit driver's balance by matching driver public key
            const qRecipient = query(collection(db, "users"), where("publicKey", "==", payment.recipient));
            const recipientDocs = await getDocs(qRecipient);
            if (!recipientDocs.empty) {
                const driverId = recipientDocs.docs[0].id;
                await updateDoc(doc(db, "users", driverId), {
                    walletBalance: increment(amt)
                });
            }

            await addDoc(collection(db, "transactions"), {
                type: "bluetooth_payment",
                from: userId,
                to: payment.recipient,
                amount: amt,
                status: "synced",
                createdAt: serverTimestamp(),
            });
        } catch (err) {
            console.error("Failed to sync offline payment:", err);
        }
    }

    localStorage.removeItem(key);
};
