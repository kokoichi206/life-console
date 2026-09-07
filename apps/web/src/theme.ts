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
  document.querySelector<HTMLMetaElement>("meta[name=\"theme-color\"]")!.content = resolvedTheme === "dark" ? "#090807" : "#f5f7fa";
  localStorage.setItem(THEME_STORAGE_KEY, theme);
};
