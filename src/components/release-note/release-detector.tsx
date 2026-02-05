"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

interface ReleaseDetectorContextType {
  hasNewRelease: boolean;
  latestReleaseId: string | null;
  dismissNotification: () => void;
}

const ReleaseDetectorContext = createContext<ReleaseDetectorContextType>({
  hasNewRelease: false,
  latestReleaseId: null,
  dismissNotification: () => {},
});

export const useReleaseDetector = () => useContext(ReleaseDetectorContext);

export function ReleaseDetectorProvider({ children }: { children: React.ReactNode }) {
  const [initialId, setInitialId] = useState<string | null>(null);
  const [latestId, setLatestId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const checkRelease = async (isInitial = false) => {
      try {
        const res = await fetch("/release-notes.json", { cache: "no-store" });
        if (res.status !== 200) {
          console.warn("Failed to check for new release: unexpected status", res.status);
          return;
        }
        const data = await res.json();
        const id = Array.isArray(data) ? data[0]?.id : data?.id;

        if (id) {
          if (isInitial) {
            setInitialId(id);
          }
          setLatestId(id);
        }
      } catch (err) {
        console.warn("Failed to check for new release:", err);
      }
    };

    // Initial check
    checkRelease(true);

    // Poll every 5 minutes
    const interval = setInterval(() => checkRelease(), 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  const hasNewRelease = !!initialId && !!latestId && initialId !== latestId && !dismissed;

  const dismissNotification = React.useCallback(() => setDismissed(true), []);

  const value = React.useMemo(
    () => ({
      hasNewRelease,
      latestReleaseId: latestId,
      dismissNotification,
    }),
    [hasNewRelease, latestId, dismissNotification]
  );

  return (
    <ReleaseDetectorContext.Provider value={value}>{children}</ReleaseDetectorContext.Provider>
  );
}
