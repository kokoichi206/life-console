export type Theme = "dark" | "light" | "system";

const THEME_STORAGE_KEY = "life-console-theme";

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
};
