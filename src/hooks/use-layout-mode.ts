import { useEffect, useState } from "react";

export type LayoutMode = "topbar" | "sidebar" | "workspace";
const KEY = "layout-mode";

function getInitial(): LayoutMode {
  if (typeof window === "undefined") return "workspace";
  try {
    const v = localStorage.getItem(KEY);
    if (v === "sidebar" || v === "topbar" || v === "workspace") return v;
  } catch {
    // A preferência é opcional quando o navegador bloqueia o armazenamento local.
  }
  return "workspace";
}

export function useLayoutMode(): [LayoutMode, (mode: LayoutMode) => void] {
  const [mode, setMode] = useState<LayoutMode>(getInitial);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (
        e.key === KEY &&
        (e.newValue === "sidebar" || e.newValue === "topbar" || e.newValue === "workspace")
      ) {
        setMode(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const chooseMode = (next: LayoutMode) => {
    setMode(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // A interface continua funcionando mesmo sem persistência local.
    }
  };
  return [mode, chooseMode];
}
