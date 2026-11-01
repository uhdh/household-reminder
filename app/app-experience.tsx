"use client";

import { createContext, useContext, useEffect, useSyncExternalStore } from "react";

const AppExperienceContext = createContext<boolean | null>(false);
const APP_SESSION_KEY = "gagyebutak-app";

function appSnapshot() {
  const appLaunch = new URLSearchParams(window.location.search).get("app") === "1";
  const installed = window.matchMedia?.("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone
    || document.referrer.startsWith("android-app://app.gagyebutak.twa/")
    || document.referrer === "android-app://app.gagyebutak.twa";
  try {
    return Boolean(appLaunch || installed || sessionStorage.getItem(APP_SESSION_KEY) === "1");
  } catch {
    return Boolean(appLaunch || installed);
  }
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia?.("(display-mode: standalone)");
  media?.addEventListener("change", onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    media?.removeEventListener("change", onChange);
    window.removeEventListener("popstate", onChange);
  };
}

export function AppExperience({ children }: { children: React.ReactNode }) {
  const isApp = useSyncExternalStore<boolean | null>(subscribe, appSnapshot, () => null);

  useEffect(() => {
    if (isApp === null) return;
    document.documentElement.dataset.experience = isApp ? "app" : "web";
    if (isApp) {
      try { sessionStorage.setItem(APP_SESSION_KEY, "1"); } catch { /* Storage may be disabled. */ }
    }
  }, [isApp]);

  return <AppExperienceContext.Provider value={isApp}>{children}</AppExperienceContext.Provider>;
}

export function useAppExperience() {
  return useContext(AppExperienceContext);
}
