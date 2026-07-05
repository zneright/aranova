import React, { ReactNode } from 'react';

interface UserLayoutProps {
  children: ReactNode;
  role: 'Commuter' | 'Driver' | 'Cooperative';
}

export default function UserLayout({ children, role }: UserLayoutProps) {
  // We format the role to match our CSS classes (e.g., "theme-commuter")
  const themeClass = `theme-${role.toLowerCase().replace('cooperative', 'coop')}`;

  return (
    <div className={`${themeClass} min-h-screen w-full bg-[var(--bg-base)] text-[var(--text-primary)] transition-colors duration-500`}>
      {/* If you have a global navbar, it goes here */}
      <main className="w-full mx-auto">
        {children}
      </main>
    </div>
  );
}