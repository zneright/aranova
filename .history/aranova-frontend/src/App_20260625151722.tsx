import LandingPage from "./pages/Landingpage";
import AuthPage from "./pages/Auth";
import AdminDashboard from "./pages/admin/AdminDashboard";
import UserDashboard from "./pages/user/UserDashboard";
import UserVault from "./pages/user/UserVault";
import UserActivity from "./pages/user/UserActivity";
import UserProfile from "./pages/user/UserProfile";
import UserSettings from "./pages/user/UserSettings";

function App() {
  const currentPath = window.location.pathname;

  if (currentPath === "/auth") {
    return <AuthPage />;
  }
  if (currentPath === "/admin") {
    return <AdminDashboard />;
  }
  if (currentPath === "/user") {
    return <UserDashboard />;
  }
  return <LandingPage />;

  if (currentPath === "/user/vault") return <UserVault />;

  if (currentPath === "/auth") return <AuthPage />;
  if (currentPath === "/admin") return <AdminDashboard />;
  
  if (currentPath === "/user") return <UserDashboard />;
  if (currentPath === "/user/vault") return <UserVault />;
  if (currentPath === "/user/activity") return <UserActivity />;
  if (currentPath === "/user/profile") return <UserProfile />;
  if (currentPath === "/user/settings") return <UserSettings />;
}

export default App;
