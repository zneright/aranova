import { Routes, Route } from "react-router-dom"; // Import routing components

// Page Imports
import LandingPage from "./pages/Landingpage";
import AuthPage from "./pages/Auth";
import AdminDashboard from "./pages/admin/AdminDashboard";
import UserDashboard from "./pages/user/UserDashboard";
import UserVault from "./pages/user/UserVault";
import UserActivity from "./pages/user/UserActivity";
import UserProfile from "./pages/user/UserProfile";
import UserSettings from "./pages/user/UserSettings";

function App() {
  return (
    <Routes>
      {/* Default Route */}
      <Route path="/" element={<LandingPage />} />

      {/* Auth & Admin */}
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/admin" element={<AdminDashboard />} />

      {/* User Routes */}
      <Route path="/user" element={<UserDashboard />} />
      <Route path="/user/vault" element={<UserVault />} />
      <Route path="/user/activity" element={<UserActivity />} />
      <Route path="/user/profile" element={<UserProfile />} />
      <Route path="/user/settings" element={<UserSettings />} />

      {/* Optional: Add a 404 catch-all route here if you want */}
      {/* <Route path="*" element={<div>Page Not Found</div>} /> */}
    </Routes>
  );
}

export default App;