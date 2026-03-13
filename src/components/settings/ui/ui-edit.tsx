"use client";

import { useTheme } from "@/components/shared/theme-provider";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useEffect, useState } from "react";

export function UiEdit() {
  const { theme, setTheme } = useTheme();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = window.document.documentElement;

    const syncTheme = () => {
      setIsDark(root.classList.contains("dark"));
    };

    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, [theme]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 grid gap-2">
        <div className="grid grid-cols-[200px_300px_1fr] gap-8 items-start">
          <div className="space-y-1 pt-2">
            <Label>Dark Mode</Label>
          </div>
          <div className="flex items-center h-10">
            <Switch
              checked={isDark}
              onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
              aria-label="Toggle dark mode"
            />
          </div>
          <div className="text-sm text-muted-foreground pt-2">
            Switch between dark and light themes. If your current theme is set to system, toggling
            here will switch it to an explicit mode.
          </div>
        </div>

        <Separator />
      </div>
    </div>
  );
}
