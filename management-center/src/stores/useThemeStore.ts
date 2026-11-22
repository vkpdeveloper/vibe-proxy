/**
 * The console is dark only, like VM Bridge. The store stays so components that read
 * `resolvedTheme` (for example to pick a brand icon variant) keep working.
 */

import { create } from 'zustand';

type ResolvedTheme = 'light' | 'dark';

interface ThemeState {
  resolvedTheme: ResolvedTheme;
  initializeTheme: () => () => void;
}

export const useThemeStore = create<ThemeState>()(() => ({
  resolvedTheme: 'dark',
  initializeTheme: () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.classList.add('dark');
    return () => {};
  },
}));
