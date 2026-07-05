import { addDoc, collection, doc, getDoc, getDocs, increment, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { db } from "../firebase/config";

export const ADMIN_PUBLIC_KEY = "GADMINAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
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
  const snap = await getDoc(ref);

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
      trustScore: 72,
      cooperativeId: null,
      lastTrustUpdate: null,
      createdAt: serverTimestamp(),
    };
    await setDoc(ref, profile, { merge: true });
    return profile;
  }

  return { uid: user.uid, ...snap.data() };
};

export const maybeRunDailyTrustUpdate = async (userData: any) => {
  const lastUpdate = parseTimestamp(userData.lastTrustUpdate);
  if (lastUpdate && Date.now() - lastUpdate.getTime() < dayMs) return;

  let nextScore = Number(userData.trustScore || 72);
  const now = Date.now();

  const loanSnap = await getDocsSafe(query(collection(db, "fuel_requests"), where("driverId", "==", userData.uid)));
  const overdue = loanSnap.some((item) => {
    const record = item as Record<string, any>;
    const createdAt = parseTimestamp(record.createdAt);
    const durationDays = Number(record.durationDays || defaultPolicy.durationValue);
    return record.status === "active" && createdAt && now - createdAt.getTime() > durationDays * dayMs;
  });

  if (overdue) nextScore -= 4;

  const vaultSnap = await getDocsSafe(query(collection(db, "vaults"), where("ownerId", "==", userData.uid)));
  const matured = vaultSnap.some((item) => {
    const record = item as Record<string, any>;
    const maturityDate = parseTimestamp(record.maturityDate);
    return record.status === "locked" && maturityDate && now >= maturityDate.getTime();
  });

  if (matured) nextScore += 2;

  await updateDoc(doc(db, "users", userData.uid), {
    trustScore: Math.max(0, Math.min(100, nextScore)),
    lastTrustUpdate: serverTimestamp(),
  });
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
    await addDoc(collection(db, "transactions"), {
      type: "bluetooth_payment",
      from: userId,
      to: payment.recipient,
      amount: payment.amount,
      metadata: payment,
      status: "synced",
      createdAt: serverTimestamp(),
    });
  }

  localStorage.removeItem(key);
};
