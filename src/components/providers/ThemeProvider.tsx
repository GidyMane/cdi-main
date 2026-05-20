import React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

interface ThemeProviderProps {
  children: React.ReactNode;
}

/**
 * ThemeProvider wrapper component
 * Wraps the app with next-themes for centralized dark/light mode management
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange={false}
      storageKey="app-theme-v2"
      themes={['light', 'dark']}
    >
      {children}
    </NextThemesProvider>
  );
}
