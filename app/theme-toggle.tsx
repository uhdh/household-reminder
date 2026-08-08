"use client";

import { useEffect, useSyncExternalStore } from "react";

type Theme = "light" | "dark";

function getPreferredTheme(): Theme {
  const saved = window.localStorage.getItem("theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.dataset.seedUserColorScheme = theme;
  document.documentElement.style.colorScheme = theme;
}

function subscribeToTheme(onStoreChange: () => void) {
  window.addEventListener("themechange", onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener("themechange", onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function setThemePreference(theme: Theme) {
  window.localStorage.setItem("theme", theme);
  applyTheme(theme);
  window.dispatchEvent(new Event("themechange"));
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeToTheme, getPreferredTheme, (): Theme => "light");

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => setThemePreference(nextTheme)}
      aria-label={`${nextTheme === "dark" ? "다크" : "라이트"} 모드로 변경`}
      title={`${nextTheme === "dark" ? "다크" : "라이트"} 모드`}
      className="seed-icon-button text-lg"
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
