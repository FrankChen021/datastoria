"use client";

import { useTheme } from "@/components/shared/theme-provider";
import { useEffect, useState } from "react";

const getDocumentIsDark = () => {
  if (typeof window === "undefined") {
    return false;
  }
  return window.document.documentElement.classList.contains("dark");
};

/**
 * Module-level singleton subscriber registry.
 * A single MutationObserver fires for ALL mounted consumers so that N
 * components (e.g. 20 code blocks in a chat message) never create N
 * independent observers on document.documentElement.
 */
type Listener = () => void;
const listeners = new Set<Listener>();
let singletonObserver: MutationObserver | null = null;

function ensureSingletonObserver() {
  if (singletonObserver !== null || typeof window === "undefined") return;
  singletonObserver = new MutationObserver(() => {
    for (const fn of listeners) fn();
  });
  singletonObserver.observe(window.document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
}

function subscribe(fn: Listener): () => void {
  ensureSingletonObserver();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const useIsDarkTheme = (): boolean => {
  const { theme } = useTheme();
  const [isDark, setIsDark] = useState<boolean>(() => getDocumentIsDark());

  useEffect(() => {
    // Re-check immediately when the theme context changes (light / dark / system).
    setIsDark(getDocumentIsDark());

    // Subscribe to the singleton observer for system-theme and programmatic toggles.
    const unsubscribe = subscribe(() => setIsDark(getDocumentIsDark()));
    return unsubscribe;
  }, [theme]);

  return isDark;
};

export default useIsDarkTheme;
