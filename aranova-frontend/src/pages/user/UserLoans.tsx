import React from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";
import UserLayout from "../../components/layout/UserLayout";
import DriverLoanSection from "../../components/ui/DriverLoanSection";
import LoadingWorkspace from "../../components/ui/LoadingWorkspace";

const UserLoans: React.FC = () => {
  const { userData: contextUserData, loading: authLoading, currentUser } = useAuth();
  const userData = (() => {
    if (contextUserData) return contextUserData;
    const cached = localStorage.getItem("aranova_auth_profile");
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (currentUser && parsed && parsed.uid === currentUser.uid) {
          return parsed;
        }
      } catch (e) {}
    }
    return null;
  })();
  const { dark } = useTheme();

  if (authLoading) {
    return <LoadingWorkspace />;
  }

  if (!userData) {
    return (
      <div className="flex h-screen items-center justify-center bg-red-50 text-red-500">
        Authentication Error.
      </div>
    );
  }

  return (
    <UserLayout userData={userData} activeTab="loans">
      <div className="max-w-6xl mx-auto space-y-8 animate-fadeIn">
        <DriverLoanSection userData={userData} dark={dark} />
      </div>
    </UserLayout>
  );
};

export default UserLoans;
