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
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                setCurrentUser(user);
                // Listen to the user's document in Firestore in real-time
                const unsubDoc = onSnapshot(doc(db, "users", user.uid), (doc) => {
                    setUserData(doc.data() || null);
                    setLoading(false);
                }, (error) => {
                    console.error("Firestore snapshot error:", error);
                    setLoading(false);
                });
                return () => unsubDoc();
            } else {
                setCurrentUser(null);
                setUserData(null);
                setLoading(false);
            }
        });
        return unsubscribe;
    }, []);

    return (
        <AuthContext.Provider value={{ currentUser, userData, loading }}>
            {children}
        </AuthContext.Provider>
    );
};