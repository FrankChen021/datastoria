"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface GitHubLoginComponentProps {
  onSuccess: (tokens: {
    accessToken: string;
    refreshToken?: string;
    accessTokenExpiresAt?: number;
    refreshTokenExpiresAt?: number;
  }) => void;
  onCancel: () => void;
}

export function GitHubLoginComponent({ onSuccess, onCancel }: GitHubLoginComponentProps) {
  const [authData, setAuthData] = useState<{
    device_code: string;
    user_code: string;
    verification_uri: string;
    interval: number;
    expires_in: number;
  } | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const isLoggingInRef = useRef(false);
  const [hasCopied, setHasCopied] = useState(false);

  const handleCopy = () => {
    if (authData?.user_code) {
      navigator.clipboard.writeText(authData.user_code);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2000);
    }
  };

  const startLogin = useCallback(async () => {
    isLoggingInRef.current = true;
    setAuthError(null);
    setAuthData(null); // Reset auth data on retry
    try {
      const res = await fetch("/api/auth/github/device/code", { method: "POST" });
      if (!res.ok) {
        throw new Error("Failed to initiate login. Please try again.");
      }
      const data = await res.json();
      setAuthData(data);

      let currentInterval = (data.interval || 5) * 1000;

      const poll = async () => {
        if (!isLoggingInRef.current) return;

        try {
          const tokenRes = await fetch("/api/auth/github/device/token", {
            method: "POST",
            body: JSON.stringify({ device_code: data.device_code }),
          });

          if (!tokenRes.ok) {
            throw new Error("Polling failed");
          }

          const tokenData = await tokenRes.json();

          if (tokenData.access_token) {
            isLoggingInRef.current = false;
            const accessTokenExpiresAt = tokenData.expires_in
              ? Date.now() + tokenData.expires_in * 1000
              : undefined;
            const refreshTokenExpiresAt = tokenData.refresh_token_expires_in
              ? Date.now() + tokenData.refresh_token_expires_in * 1000
              : undefined;
            onSuccess({
              accessToken: tokenData.access_token,
              refreshToken: tokenData.refresh_token,
              accessTokenExpiresAt,
              refreshTokenExpiresAt,
            });
          } else if (tokenData.error === "authorization_pending") {
            setTimeout(poll, currentInterval);
          } else if (tokenData.error === "slow_down") {
            currentInterval = (tokenData.interval || currentInterval / 1000 + 5) * 1000;
            setTimeout(poll, currentInterval);
          } else if (tokenData.error === "expired_token") {
            setAuthError("The device code has expired. Please try again.");
            isLoggingInRef.current = false;
          } else if (tokenData.error === "access_denied") {
            setAuthError("Login was canceled or access was denied.");
            isLoggingInRef.current = false;
          } else {
            setAuthError(tokenData.error_description || "Authentication failed.");
            isLoggingInRef.current = false;
          }
        } catch {
          setAuthError("Failed to verify login status. Please check your connection.");
          isLoggingInRef.current = false;
        }
      };

      setTimeout(poll, currentInterval);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Failed to initiate login.");
      isLoggingInRef.current = false;
    }
  }, [onSuccess]);

  useEffect(() => {
    startLogin();
    return () => {
      isLoggingInRef.current = false;
    };
  }, [startLogin]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[200px] py-2">
      {authError ? (
        <div className="flex flex-col items-center gap-4 text-center animate-in fade-in slide-in-from-bottom-2">
          <div className="text-destructive text-sm font-medium max-w-[280px]">{authError}</div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="default" size="sm" onClick={startLogin}>
              Try Again
            </Button>
          </div>
        </div>
      ) : authData ? (
        <div className="flex flex-col items-center gap-6 w-full animate-in fade-in slide-in-from-bottom-2 pt-3">
          <div
            className={cn(
              "relative flex items-center justify-center gap-3 w-full p-5 rounded-xl border-2 border-dashed transition-all cursor-pointer group",
              hasCopied
                ? "border-green-500/50 bg-green-500/5"
                : "border-muted-foreground/20 bg-muted/30 hover:border-muted-foreground/40 hover:bg-muted/50"
            )}
            onClick={handleCopy}
            title="Click to copy code"
          >
            <code className="text-3xl font-mono font-bold tracking-widest text-foreground">
              {authData.user_code}
            </code>
            <div className="absolute right-4 text-muted-foreground/50 group-hover:text-foreground transition-colors">
              {hasCopied ? (
                <Check className="h-5 w-5 text-green-600" />
              ) : (
                <Copy className="h-5 w-5" />
              )}
            </div>
            {hasCopied && (
              <div className="absolute -bottom-6 text-[10px] font-medium text-green-600 animate-in fade-in slide-in-from-top-1">
                Copied to clipboard
              </div>
            )}
          </div>

          <div className="text-center space-y-1">
            <p className="text-sm text-muted-foreground">
              Copy the authorization code above, then paste it on GitHub to authorize.
            </p>
          </div>

          <div className="flex flex-col w-full gap-2">
            <Button className="w-full gap-2" size="lg" asChild>
              <a href={authData.verification_uri} target="_blank" rel="noreferrer">
                Open GitHub Login
                <ExternalLink className="h-4 w-4 opacity-50" />
              </a>
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancel} className="text-muted-foreground">
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in-95">
          <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
          <div className="text-sm text-muted-foreground">Connecting to GitHub...</div>
        </div>
      )}
    </div>
  );
}
