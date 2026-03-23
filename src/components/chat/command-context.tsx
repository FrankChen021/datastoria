"use client";

import type { CommandDetail } from "@/lib/ai/commands/command-manager";
import { BasePath } from "@/lib/base-path";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

interface CommandContextValue {
  commands: CommandDetail[];
  commandsByName: Map<string, CommandDetail>;
  loading: boolean;
}

const CommandContext = createContext<CommandContextValue>({
  commands: [],
  commandsByName: new Map<string, CommandDetail>(),
  loading: false,
});

export function ChatCommandProvider({ children }: { children: React.ReactNode }) {
  const [commands, setCommands] = useState<CommandDetail[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);

    fetch(BasePath.getURL("/api/ai/commands"), { signal: controller.signal })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json() as Promise<CommandDetail[]>;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setCommands(data);
        setLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setCommands([]);
        setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, []);

  const value = useMemo<CommandContextValue>(() => {
    return {
      commands,
      commandsByName: new Map(commands.map((command) => [command.name, command])),
      loading,
    };
  }, [commands, loading]);

  return <CommandContext.Provider value={value}>{children}</CommandContext.Provider>;
}

export function useChatCommands() {
  return useContext(CommandContext);
}
