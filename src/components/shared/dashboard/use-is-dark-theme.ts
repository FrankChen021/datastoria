"use client";

import { useTheme } from "@/components/theme-provider";
import { useEffect, useState } from "react";

const getDocumentIsDark = () => {
  if (typeof window === "undefined") {
    return false;
  }
  return window.document.documentElement.classList.contains("dark");
};

const useIsDarkTheme = (): boolean => {
  const { theme } = useTheme();
  const [isDark, setIsDark] = useState<boolean>(() => getDocumentIsDark());

  useEffect(() => {
    const updateTheme = () => {
      setIsDark(getDocumentIsDark());
    };

    // Initial update to ensure state matches DOM
    updateTheme();

    // Watch for DOM class changes (including system theme toggles)
    let observer: MutationObserver | null = null;
    if (typeof window !== "undefined") {
      observer = new MutationObserver(updateTheme);
      observer.observe(window.document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }

    return () => {
      observer?.disconnect();
    };
  }, [theme]);

  return isDark;
};

export default useIsDarkTheme;

