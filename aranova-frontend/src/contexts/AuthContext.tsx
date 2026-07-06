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
        
        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            if (unsubDoc) {
                unsubDoc();
                unsubDoc = null;
            }

            if (user) {
                setCurrentUser(user);
                // Listen to the user's document in Firestore in real-time
                unsubDoc = onSnapshot(doc(db, "users", user.uid), (doc) => {
                    setUserData(doc.data() || null);
                    setLoading(false);
                }, (error) => {
                    console.error("Firestore snapshot error:", error);
                    setLoading(false);
                });
            } else {
                setCurrentUser(null);
                setUserData(null);
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