"use client";

import { DEFAULT_USER_ID, StorageManager } from "@/lib/storage/storage-provider-manager";
import { useSession } from "next-auth/react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

/**
 * Normalize email for use as storage user id (one user per email across providers).
 * Returns null for empty/whitespace input.
 */
function normalizeEmail(email: string | null | undefined): string | null {
  if (email == null) return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed === "" ? null : trimmed;
}

interface AppStorageContextValue {
  isStorageReady: boolean;
  storageUserId: string;
}

const AppStorageContext = createContext<AppStorageContextValue>({
  isStorageReady: false,
  storageUserId: DEFAULT_USER_ID,
});

/**
 * Sets the app local storage identity from the current session.
 * Must be rendered inside SessionProvider.
 * When OAuth is enabled: one user per email (normalized) across providers; fallback to sub when email is missing.
 * When OAuth is disabled or session is unknown: use DEFAULT_USER_ID.
 */
export function AppStorageProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [storageState, setStorageState] = useState<AppStorageContextValue>({
    isStorageReady: false,
    storageUserId: DEFAULT_USER_ID,
  });

  useEffect(() => {
    if (status !== "authenticated" && status !== "unauthenticated") return;
    const userId =
      normalizeEmail(session?.user?.email ?? null) ?? session?.user?.id ?? DEFAULT_USER_ID;
    StorageManager.getInstance().setStorageProvider(userId);
    setStorageState({
      isStorageReady: true,
      storageUserId: userId,
    });
  }, [status, session?.user?.email, session?.user?.id]);

  const contextValue = useMemo(() => storageState, [storageState]);

  return <AppStorageContext.Provider value={contextValue}>{children}</AppStorageContext.Provider>;
}

export function useAppStorage() {
  return useContext(AppStorageContext);
}
