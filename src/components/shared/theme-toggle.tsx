import { Button } from "@/components/ui/button";
import { MoonIcon, SunIcon } from "@radix-ui/react-icons";
import { useEffect, useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { useTheme } from "./theme-provider";

export function ThemeToggle() {
  const { setTheme } = useTheme();
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.document.documentElement.classList.contains("dark");
  });

  useEffect(() => {
    const root = window.document.documentElement;
    const observer = new MutationObserver(() => {
      setIsDark(root.classList.contains("dark"));
    });

    observer.observe(root, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  const toggleTheme = () => {
    const root = window.document.documentElement;
    const currentlyDark = root.classList.contains("dark");
    setTheme(currentlyDark ? "light" : "dark");
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={toggleTheme}>
            {isDark ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{isDark ? "Switch to Light mode" : "Switch to Dark mode"}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
