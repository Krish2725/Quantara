import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'quantara.appearance.v1';
const ThemeContext = createContext(null);
const validThemes = new Set(['light', 'dark', 'system']);

function readPreference() {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    return validThemes.has(stored) ? stored : 'light';
  } catch { return 'light'; }
}

export function resolveTheme(theme, systemPrefersDark = false) {
  return theme === 'system' ? (systemPrefersDark ? 'dark' : 'light') : (theme === 'dark' ? 'dark' : 'light');
}

function resolvedTheme(theme) {
  if (theme !== 'system') return resolveTheme(theme);
  try { return resolveTheme(theme, Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches)); }
  catch { return resolveTheme(theme); }
}

function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  const resolved = resolvedTheme(theme);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#111c27' : '#101b27');
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readPreference);
  const setTheme = useCallback((nextTheme) => {
    if (!validThemes.has(nextTheme)) return;
    setThemeState(nextTheme);
    try { globalThis.localStorage?.setItem(STORAGE_KEY, nextTheme); } catch { /* Continue with the in-memory preference. */ }
  }, []);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system' || typeof globalThis.matchMedia !== 'function') return undefined;
    const media = globalThis.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => applyTheme('system');
    if (media.addEventListener) media.addEventListener('change', handleChange);
    else media.addListener?.(handleChange);
    return () => {
      if (media.removeEventListener) media.removeEventListener('change', handleChange);
      else media.removeListener?.(handleChange);
    };
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider.');
  return value;
}

export const THEME_STORAGE_KEY = STORAGE_KEY;
