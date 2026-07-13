import React, { createContext, useContext, useEffect, useState } from "react";
// 💡 Added 'type' keyword before User to fix the compilation error
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebase/config";

interface AuthContextType {
    currentUser: User | null;
    userData: any;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
    currentUser: null,
    userData: null,
    loading: true,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [userData, setUserData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let unsubDoc: (() => void) | null = null;
        
        // 1. Immediately restore cached auth states from LocalStorage for instant offline startup
        const cachedUser = localStorage.getItem("aranova_auth_user");
        const cachedProfile = localStorage.getItem("aranova_auth_profile");
        if (cachedUser && cachedProfile) {
            try {
                const parsedUser = JSON.parse(cachedUser);
                const parsedProfile = JSON.parse(cachedProfile);
                if (parsedUser && parsedProfile && parsedUser.uid === parsedProfile.uid) {
                    setCurrentUser(parsedUser);
                    setUserData(parsedProfile);
                    setLoading(false);
                }
            } catch (e) {
                console.warn("Failed to load local cached auth credentials:", e);
            }
        }



        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            if (unsubDoc) {
                unsubDoc();
                unsubDoc = null;
            }

            if (user) {
                setCurrentUser(user);
                localStorage.setItem("aranova_auth_user", JSON.stringify({
                    uid: user.uid,
                    email: user.email,
                    displayName: user.displayName
                }));

                // Listen to the user's document in Firestore (uses Firestore offline IndexedDB cache)
                if (localStorage.getItem("aranova_firestore_exhausted") === "true") {
                    const localProfileStr = localStorage.getItem("aranova_auth_profile");
                    if (localProfileStr) {
                        try {
                            const parsed = JSON.parse(localProfileStr);
                            if (parsed && parsed.uid === user.uid) {
                                setUserData(parsed);
                            }
                        } catch (e) {}
                    }
                    setLoading(false);
                } else {
                    unsubDoc = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
                        if (docSnap.exists()) {
                            const data = { uid: user.uid, ...docSnap.data() };
                            setUserData(data);
                            localStorage.setItem("aranova_auth_profile", JSON.stringify(data));
                        }
                        setLoading(false);
                    }, (error) => {
                        console.error("Firestore snapshot error:", error);
                        const errorMsg = error.message || "";
                        if (errorMsg.toLowerCase().includes("quota") || errorMsg.toLowerCase().includes("exhausted") || error.code === "permission-denied") {
                            localStorage.setItem("aranova_firestore_exhausted", "true");
                        }
                        // Fall back to local storage profile if offline or blocked
                        const localProfileStr = localStorage.getItem("aranova_auth_profile");
                        if (localProfileStr) {
                            try {
                                const parsed = JSON.parse(localProfileStr);
                                if (parsed && parsed.uid === user.uid) {
                                    setUserData(parsed);
                                }
                            } catch (e) {}
                        }
                        setLoading(false);
                    });
                }
            } else {
                const isSandbox = import.meta.env.VITE_OFFLINE_SANDBOX === "true" || localStorage.getItem("aranova_firestore_exhausted") === "true";
                const localUser = localStorage.getItem("aranova_auth_user");
                if (isSandbox && localUser) {
                    setLoading(false);
                } else {
                    setCurrentUser(null);
                    setUserData(null);
                    localStorage.removeItem("aranova_auth_user");
                    localStorage.removeItem("aranova_auth_profile");
                    setLoading(false);
                }
            }
        });
        
        return () => {
            unsubscribeAuth();
            if (unsubDoc) unsubDoc();
        };
    }, []);

    return (
        <AuthContext.Provider value={{ currentUser, userData, loading }}>
            {children}
        </AuthContext.Provider>
    );
};