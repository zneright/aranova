import { createContext, useContext } from "react";

// ─── Theme Context ────────────────────────────────────────────────────────────
export interface AdminThemeCtx {
  dark: boolean;
  toggleDark: () => void;
}
export const AdminThemeContext = createContext<AdminThemeCtx>({
  dark: false,
  toggleDark: () => {},
});
export const useAdminTheme = () => useContext(AdminThemeContext);

// ─── Active Page Context ──────────────────────────────────────────────────────
export interface AdminPageCtx {
  activePage: string;
  setActivePage: (p: string) => void;
}
export const AdminPageContext = createContext<AdminPageCtx>({
  activePage: "dashboard",
  setActivePage: () => {},
});
export const useAdminPage = () => useContext(AdminPageContext);
