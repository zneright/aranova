import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyBI_ANxz_e5BDVsn1gIoZBSnMm6B3cVYuU",
    authDomain: "aranova-14025.firebaseapp.com",
    projectId: "aranova-14025",
    storageBucket: "aranova-14025.firebasestorage.app",
    messagingSenderId: "197034267462",
    appId: "1:197034267462:web:b56335f3d6ef616e5ecb47",
    measurementId: "G-GZ3EZHQ97G"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);