const STORAGE_KEY = 'gdip-theme';

export function getTheme() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch (_) {
    // Private browsing can make storage unavailable; the system setting still works.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

export function saveTheme(theme) {
  applyTheme(theme);
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch (_) {
    // The choice still applies for this page when storage is unavailable.
  }
}
