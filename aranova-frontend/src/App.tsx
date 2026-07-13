import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import LoadingWorkspace from "./components/ui/LoadingWorkspace";

// Page Imports
import LandingPage from "./pages/Landingpage";
import AuthPage from "./pages/Auth";
import AdminDashboard from "./pages/admin/AdminDashboard";
import UserDashboard from "./pages/user/UserDashboard";
import UserVault from "./pages/user/UserVault";
import UserActivity from "./pages/user/UserActivity";
import UserSettings from "./pages/user/UserSettings"; // Profile & Settings merged
import CoopPool from "./pages/user/CoopPool";
import UserLoans from "./pages/user/UserLoans";
import UserFuelCredit from "./pages/user/UserFuelCredit";
import UserSend from "./pages/user/UserSend";
import UserReceive from "./pages/user/UserReceive";

interface PrivateRouteProps {
  children: React.ReactNode;
  roles?: string[];
}

const PrivateRoute = ({ children, roles }: PrivateRouteProps) => {
  const { currentUser, userData, loading } = useAuth();

  if (loading) {
    return <LoadingWorkspace message="Authenticating session..." />;
  }

  if (!currentUser) {
    return <Navigate to="/auth" replace />;
  }

  if (roles && (!userData || !roles.includes(userData.role))) {
    return <Navigate to="/user" replace />;
  }

  return <>{children}</>;
};

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />

      {/* Auth & Admin */}
      <Route path="/auth" element={<AuthPage />} />
      <Route
        path="/admin"
        element={
          <PrivateRoute roles={["admin"]}>
            <AdminDashboard />
          </PrivateRoute>
        }
      />

      {/* User Routes */}
      <Route
        path="/user"
        element={
          <PrivateRoute>
            <UserDashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/user/vault"
        element={
          <PrivateRoute>
            <UserVault />
          </PrivateRoute>
        }
      />
      <Route
        path="/user/send"
        element={
          <PrivateRoute>
            <UserSend />
          </PrivateRoute>
        }
      />
      <Route
        path="/user/receive"
        element={
          <PrivateRoute>
            <UserReceive />
          </PrivateRoute>
        }
      />
      <Route
        path="/user/loans"
        element={
          <PrivateRoute>
            <UserLoans />
          </PrivateRoute>
        }
      />
      <Route
        path="/user/fuel-credit"
        element={
          <PrivateRoute>
            <UserFuelCredit />
          </PrivateRoute>
        }
      />
      <Route
        path="/user/activity"
        element={
          <PrivateRoute>
            <UserActivity />
          </PrivateRoute>
        }
      />
      <Route
        path="/user/coop-pool"
        element={
          <PrivateRoute>
            <CoopPool />
          </PrivateRoute>
        }
      />

      {/* Both Profile and Settings point to the same merged component */}
      <Route
        path="/user/profile"
        element={
          <PrivateRoute>
            <UserSettings />
          </PrivateRoute>
        }
      />
      <Route
        path="/user/settings"
        element={
          <PrivateRoute>
            <UserSettings />
          </PrivateRoute>
        }
      />
    </Routes>
  );
}

export default App;