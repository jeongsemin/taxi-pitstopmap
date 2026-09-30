"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type ThemePref = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme-pref";

// layout.tsx 의 <head> 인라인 스크립트가 첫 페인트 전에 같은 규칙으로 data-theme 을 정한다.
const listeners = new Set<() => void>();
const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribe(cb: () => void) {
  listeners.add(cb);
  const mq = window.matchMedia(DARK_QUERY);
  mq.addEventListener("change", cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    mq.removeEventListener("change", cb);
    window.removeEventListener("storage", cb);
  };
}

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function readSystem(): ResolvedTheme {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

type ThemeContextValue = {
  pref: ThemePref;
  resolved: ResolvedTheme;
  setPref: (p: ThemePref) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  pref: "system",
  resolved: "dark",
  setPref: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const pref = useSyncExternalStore<ThemePref>(
    subscribe,
    readPref,
    () => "system",
  );
  const system = useSyncExternalStore<ResolvedTheme>(
    subscribe,
    readSystem,
    () => "dark",
  );
  const resolved: ResolvedTheme = pref === "system" ? system : pref;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  const setPref = useCallback((p: ThemePref) => {
    try {
      if (p === "system") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, p);
    } catch {
      // 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서는 이번 방문에만 적용된다
    }
    listeners.forEach((l) => l());
  }, []);

  const value = useMemo(
    () => ({ pref, resolved, setPref }),
    [pref, resolved, setPref],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
