import React, { createContext, useContext, useState, useEffect } from "react";

interface ThemeContextType {
  dark: boolean;
  toggleDark: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  dark: false,
  toggleDark: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dark, setDark] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem("aranova-dark");
      if (stored !== null) return stored === "true";
    } catch {}
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
  });

  useEffect(() => {
    try {
      localStorage.setItem("aranova-dark", String(dark));
    } catch {}
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  }, [dark]);

  const toggleDark = () => setDark((prev) => !prev);

  return (
    <ThemeContext.Provider value={{ dark, toggleDark }}>
      {children}
    </ThemeContext.Provider>
  );
};
