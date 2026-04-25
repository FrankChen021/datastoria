"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BasePath } from "@/lib/base-path";
import { ExternalLink, Loader2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";

const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const CODEX_AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
const CODEX_SCOPE = "openid profile email offline_access";
const CALLBACK_PATH = "/auth/callback";
const CODEX_CALLBACK_PORT = 1455;
const CODEX_REDIRECT_URI = `http://localhost:${CODEX_CALLBACK_PORT}${CALLBACK_PATH}`;

interface CodexLoginComponentProps {
  onSuccess: (tokens: {
    accessToken: string;
    refreshToken?: string;
    accessTokenExpiresAt?: number;
    refreshTokenExpiresAt?: number;
  }) => void;
}

function base64UrlEncode(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes.buffer);
}

async function createCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(digest);
}

async function canReachCallbackPort(port: number): Promise<boolean> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 350);

  try {
    await fetch(`http://localhost:${port}${CALLBACK_PATH}`, {
      mode: "no-cors",
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function getResponseErrorMessage(
  response: Response,
  fallbackMessage: string
): Promise<string> {
  const statusPrefix = `HTTP ${response.status}`;
  const contentType = response.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as {
        error?: string;
        error_description?: string;
        message?: string;
      };
      return `${statusPrefix}: ${
        payload.error_description || payload.error || payload.message || fallbackMessage
      }`;
    }

    const text = await response.text();
    return `${statusPrefix}: ${text || fallbackMessage}`;
  } catch {
    return `${statusPrefix}: ${fallbackMessage}`;
  }
}

function StepMarker({ step, hasLine = true }: { step: number; hasLine?: boolean }) {
  return (
    <div className="relative flex justify-center self-stretch pt-0.5">
      <div className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border border-primary/80 bg-background text-base font-semibold text-primary shadow-[0_0_0_1px_rgba(129,140,248,0.15)]">
        {step}
      </div>
      {hasLine ? (
        <div className="absolute top-11 bottom-[-2rem] left-1/2 border-l border-dashed border-muted-foreground/40" />
      ) : null}
    </div>
  );
}

export function CodexLoginComponent({ onSuccess }: CodexLoginComponentProps) {
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [callbackUri, setCallbackUri] = useState<string | null>(null);
  const [redirectInput, setRedirectInput] = useState("");
  const [isCompleting, setIsCompleting] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const codeVerifierRef = useRef<string | null>(null);
  const callbackUriRef = useRef<string | null>(null);
  const stateRef = useRef<string | null>(null);
  const popupRef = useRef<Window | null>(null);

  const exchangeCode = useCallback(
    async (code: string) => {
      const codeVerifier = codeVerifierRef.current;
      if (!codeVerifier) {
        throw new Error("Missing Codex OAuth verifier. Please try again.");
      }

      const response = await fetch(BasePath.getURL("/api/ai/codex/auth/token"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          code_verifier: codeVerifier,
          redirect_uri: callbackUriRef.current,
        }),
      });

      if (!response.ok) {
        throw new Error(
          await getResponseErrorMessage(response, "Failed to exchange Codex authorization code.")
        );
      }

      const tokenData = (await response.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        refresh_token_expires_in?: number;
      };

      if (!tokenData.access_token) {
        throw new Error("Codex token response did not include an access token.");
      }

      onSuccess({
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        accessTokenExpiresAt: tokenData.expires_in
          ? Date.now() + tokenData.expires_in * 1000
          : undefined,
        refreshTokenExpiresAt: tokenData.refresh_token_expires_in
          ? Date.now() + tokenData.refresh_token_expires_in * 1000
          : undefined,
      });
    },
    [onSuccess]
  );

  const completeLogin = useCallback(async () => {
    const value = redirectInput.trim();
    if (!value) {
      setAuthError("Paste the Codex redirect URL or authorization code to finish login.");
      return;
    }

    let code = value;
    let state: string | null = null;
    let oauthError: string | null = null;
    let oauthErrorDescription: string | null = null;

    try {
      const parsed = new URL(value);
      code = parsed.searchParams.get("code") ?? "";
      state = parsed.searchParams.get("state");
      oauthError = parsed.searchParams.get("error");
      oauthErrorDescription = parsed.searchParams.get("error_description");
    } catch {
      // Treat plain input as an authorization code.
    }

    if (oauthError) {
      setAuthError(oauthErrorDescription || oauthError);
      return;
    }

    if (!code) {
      setAuthError("The pasted Codex redirect did not include an authorization code.");
      return;
    }

    if (state && state !== stateRef.current) {
      setAuthError("Codex returned an invalid OAuth state. Please try again.");
      return;
    }

    setIsCompleting(true);
    setAuthError(null);
    try {
      await exchangeCode(code);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Codex authentication failed.");
    } finally {
      setIsCompleting(false);
    }
  }, [exchangeCode, redirectInput]);

  const startLogin = useCallback(async () => {
    setIsOpening(true);
    setAuthError(null);
    setAuthUrl(null);
    setCallbackUri(null);
    setRedirectInput("");
    setIsCompleting(false);

    try {
      if (await canReachCallbackPort(CODEX_CALLBACK_PORT)) {
        setAuthError(
          `Port ${CODEX_CALLBACK_PORT} is already reachable on localhost. Close the process using that port and try again.`
        );
        return;
      }

      const redirectUri = CODEX_REDIRECT_URI;
      const codeVerifier = randomBase64Url(32);
      const codeChallenge = await createCodeChallenge(codeVerifier);
      const state = randomBase64Url(24);
      codeVerifierRef.current = codeVerifier;
      callbackUriRef.current = redirectUri;
      stateRef.current = state;
      setCallbackUri(redirectUri);

      const url = new URL(CODEX_AUTHORIZE_URL);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", CODEX_CLIENT_ID);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("scope", CODEX_SCOPE);
      url.searchParams.set("code_challenge", codeChallenge);
      url.searchParams.set("code_challenge_method", "S256");
      url.searchParams.set("state", state);
      url.searchParams.set("id_token_add_organizations", "true");
      url.searchParams.set("codex_cli_simplified_flow", "true");
      url.searchParams.set("originator", "pi");

      const nextAuthUrl = url.toString();
      setAuthUrl(nextAuthUrl);

      popupRef.current = window.open(
        nextAuthUrl,
        "datastoria-codex-oauth",
        "popup=yes,width=520,height=760"
      );
    } catch {
      setAuthError("Failed to open Codex login. Please try again.");
    } finally {
      setIsOpening(false);
    }
  }, []);

  const displayCallbackUri = callbackUri ?? CODEX_REDIRECT_URI;

  return (
    <div className="w-full py-3">
      <div className="space-y-9">
        <div className="grid grid-cols-[3.5rem_1fr] gap-x-5">
          <StepMarker step={1} />
          <div className="space-y-3">
            <div>
              <h3 className="text-base font-semibold">Open OpenAI Codex Login</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Start the OpenAI authorization flow in a separate browser window.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-10 gap-2 px-4"
              onClick={startLogin}
              disabled={isOpening || isCompleting}
            >
              {isOpening ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Opening...
                </>
              ) : (
                <>
                  {authUrl ? "Reopen Codex Login" : "Open Codex Login"}
                  <ExternalLink className="h-4 w-4 opacity-60" />
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-[3.5rem_1fr] gap-x-5">
          <StepMarker step={2} />
          <div>
            <h3 className="text-base font-semibold">Login at the Opened Window</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Complete OpenAI / ChatGPT sign-in. The browser will redirect to{" "}
              <span className="border-b border-dotted border-muted-foreground/80 text-foreground">
                {displayCallbackUri}
              </span>{" "}
              after authorization.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-[3.5rem_1fr] gap-x-5">
          <StepMarker step={3} hasLine={false} />
          <div className="space-y-3">
            <div>
              <h3 className="text-base font-semibold">Copy the Callback URL</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Copy the full callback URL from the browser address bar and paste it below.
              </p>
            </div>

            <div className="flex gap-2">
              <Input
                value={redirectInput}
                onChange={(event) => setRedirectInput(event.target.value)}
                placeholder="Paste localhost callback URL or authorization code"
                className="h-10"
              />
              <Button
                type="button"
                variant="outline"
                className="h-10 shrink-0 px-4"
                onClick={completeLogin}
                disabled={!authUrl || isCompleting}
              >
                {isCompleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Confirming...
                  </>
                ) : (
                  "Confirm"
                )}
              </Button>
            </div>

            {authError ? (
              <p className="text-sm font-medium text-destructive" role="alert">
                {authError}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
