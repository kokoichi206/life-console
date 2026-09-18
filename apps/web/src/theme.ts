import { useSyncExternalStore } from "react";

export type Theme = "dark" | "light" | "system";

const THEME_STORAGE_KEY = "life-console-theme";
const listeners = new Set<() => void>();

export const storedTheme = (): Theme => {
  const theme = localStorage.getItem(THEME_STORAGE_KEY);
  return theme === "dark" || theme === "light" ? theme : "system";
};

export const applyTheme = (theme: Theme) => {
  const resolvedTheme = theme === "system"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
    : theme;
  document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  listeners.forEach((listener) => listener());
};

const subscribeTheme = (listener: () => void) => {
  listeners.add(listener);
  const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
  const followSystemTheme = () => {
    if (storedTheme() === "system") applyTheme("system");
  };
  colorScheme.addEventListener("change", followSystemTheme);
  return () => {
    listeners.delete(listener);
    colorScheme.removeEventListener("change", followSystemTheme);
  };
};

const serverTheme = (): Theme => "system";

export const useTheme = () => useSyncExternalStore(subscribeTheme, storedTheme, serverTheme);
