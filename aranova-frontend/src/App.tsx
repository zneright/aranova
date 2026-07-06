import { Routes, Route } from "react-router-dom";

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

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />

      {/* Auth & Admin */}
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/admin" element={<AdminDashboard />} />

      {/* User Routes */}
      <Route path="/user" element={<UserDashboard />} />
      <Route path="/user/vault" element={<UserVault />} />
      <Route path="/user/send" element={<UserSend />} />
      <Route path="/user/receive" element={<UserReceive />} />
      <Route path="/user/loans" element={<UserLoans />} />
      <Route path="/user/fuel-credit" element={<UserFuelCredit />} />
      <Route path="/user/activity" element={<UserActivity />} />
      <Route path="/user/coop-pool" element={<CoopPool />} />

      {/* Both Profile and Settings point to the same merged component */}
      <Route path="/user/profile" element={<UserSettings />} />
      <Route path="/user/settings" element={<UserSettings />} />
    </Routes>
  );
}

export default App;