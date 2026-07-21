/**
 * Theme handling. Chrome-only: the parchment book pages use hardcoded values
 * (not theme tokens), so toggling `.dark` on <html> never touches them.
 */

export type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'dm-theme'
const media = window.matchMedia('(prefers-color-scheme: dark)')

export function getTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'system'
}

export function isDark(theme: Theme = getTheme()): boolean {
  return theme === 'dark' || (theme === 'system' && media.matches)
}

export function applyTheme(theme: Theme = getTheme()): void {
  document.documentElement.classList.toggle('dark', isDark(theme))
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(STORAGE_KEY, theme)
  applyTheme(theme)
}

/** Apply the stored theme and keep 'system' tracking the OS live. Call once before render. */
export function initTheme(): void {
  applyTheme()
  media.addEventListener('change', () => {
    if (getTheme() === 'system') applyTheme()
  })
}
