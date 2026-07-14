import { db } from "../firebase/config";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export type MetricType = 
  | "wallet_failure" 
  | "rpc_failure" 
  | "horizon_failure" 
  | "bluetooth_sync_failure" 
  | "firestore_lock_failure" 
  | "soroban_vm_error";

export interface LogPayload {
  type: MetricType;
  message: string;
  details?: any;
  userId?: string;
}

export const logMetric = async (payload: LogPayload) => {
  const timestamp = Date.now();
  console.warn(`[Observability Facade] Type: ${payload.type} | Message: ${payload.message}`, payload.details || "");
  
  try {
    await addDoc(collection(db, "telemetry_logs"), {
      type: payload.type,
      message: payload.message,
      details: payload.details ? JSON.stringify(payload.details) : "",
      userId: payload.userId || "system",
      timestamp,
      createdAt: serverTimestamp()
    });
  } catch (err) {
    console.error("Observability logger failed to upload log to Firestore:", err);
  }
};
