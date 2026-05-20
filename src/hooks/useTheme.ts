import { useTheme as useNextTheme } from 'next-themes';
import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';

/**
 * Custom hook that bridges next-themes with Zustand store
 * Ensures theme is synced across the app
 */
export function useTheme() {
  const nextTheme = useNextTheme();
  const { isDarkMode, setIsDarkMode } = useAppStore();

  // Sync next-themes with Zustand when theme changes
  useEffect(() => {
    if (nextTheme.resolvedTheme) {
      setIsDarkMode(nextTheme.resolvedTheme === 'dark');
    }
  }, [nextTheme.resolvedTheme, setIsDarkMode]);

  // Return combined interface
  return {
    // From next-themes
    theme: nextTheme.theme,
    resolvedTheme: nextTheme.resolvedTheme,
    setTheme: nextTheme.setTheme,
    themes: nextTheme.themes,
    systemTheme: nextTheme.systemTheme,
    
    // From Zustand (for convenience)
    isDarkMode,
    setIsDarkMode: (mode: boolean) => {
      setIsDarkMode(mode);
      nextTheme.setTheme(mode ? 'dark' : 'light');
    },
    
    // Toggle helper
    toggleTheme: () => {
      nextTheme.setTheme(nextTheme.theme === 'dark' ? 'light' : 'dark');
    },
  };
}
