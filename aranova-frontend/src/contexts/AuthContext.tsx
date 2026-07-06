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
                setCurrentUser(JSON.parse(cachedUser));
                setUserData(JSON.parse(cachedProfile));
                setLoading(false);
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
                unsubDoc = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
                    if (docSnap.exists()) {
                        const data = { uid: user.uid, ...docSnap.data() };
                        setUserData(data);
                        localStorage.setItem("aranova_auth_profile", JSON.stringify(data));
                    }
                    setLoading(false);
                }, (error) => {
                    console.error("Firestore snapshot error:", error);
                    // Fall back to local storage profile if offline or blocked
                    const localProfile = localStorage.getItem("aranova_auth_profile");
                    if (localProfile) {
                        try {
                            setUserData(JSON.parse(localProfile));
                        } catch (e) {}
                    }
                    setLoading(false);
                });
            } else {
                setCurrentUser(null);
                setUserData(null);
                localStorage.removeItem("aranova_auth_user");
                localStorage.removeItem("aranova_auth_profile");
                setLoading(false);
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