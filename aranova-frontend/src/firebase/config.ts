import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, disableNetwork } from "firebase/firestore";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

// Enable conditional network disabling. If VITE_OFFLINE_SANDBOX is set to 'true',
// we disable the network to save quota. Otherwise, keep it connected.
let database = getFirestore(app);
if (import.meta.env.VITE_OFFLINE_SANDBOX === "true") {
    console.log("Firestore offline sandbox mode enabled (network disabled).");
    disableNetwork(database).catch(() => undefined);
} else {
    console.log("Firestore online mode enabled (network connected).");
}

export const db = database;