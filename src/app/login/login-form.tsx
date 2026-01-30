"use client";

import { AgreementDialog, PRIVACY_POLICY, TERMS_OF_SERVICE } from "@/app/login/agreement-dialog";
import { AppLogo } from "@/components/app-logo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

const GITHUB_URL = "https://github.com/FrankChen021/datastoria";
const DOCS_URL = "https://docs.datastoria.app";

interface EnabledProviders {
  google: boolean;
  github: boolean;
  microsoft: boolean;
}

function LoginFormContent({ enabledProviders }: { enabledProviders: EnabledProviders }) {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const error = searchParams.get("error");
  const [agreementOpen, setAgreementOpen] = useState<{
    open: boolean;
    content: string;
  }>({
    open: false,
    content: "",
  });

  const handleSignIn = (provider: string) => {
    signIn(provider, { callbackUrl });
  };

  const showAgreement = (_title: string, content: string) => {
    setAgreementOpen({
      open: true,
      content,
    });
  };

  const hasAnyProvider =
    enabledProviders.google || enabledProviders.github || enabledProviders.microsoft;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-xl">
        <CardHeader className="text-center space-y-0 pb-8">
          <div className="flex justify-center items-center">
            <AppLogo width={64} height={64} />
            <CardTitle>DataStoria</CardTitle>
          </div>
          <CardDescription className="text-base">
            AI-powered ClickHouse management console
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>
                {error === "OAuthCallback"
                  ? "Authentication failed. Please try again."
                  : "An error occurred during authentication."}
              </AlertDescription>
            </Alert>
          )}

          {hasAnyProvider ? (
            <div className="space-y-3">
              <div className="grid gap-2">
                {enabledProviders.google && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleSignIn("google")}
                  >
                    <span className="inline-grid min-w-[11rem] grid-cols-[1.25rem_1fr] items-center gap-2">
                      <span
                        className="flex h-4 w-4 shrink-0 items-center justify-center"
                        aria-hidden
                      >
                        <svg
                          className="h-4 w-4"
                          aria-hidden="true"
                          focusable="false"
                          role="img"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 488 512"
                        >
                          <title>Google</title>
                          <path
                            fill="currentColor"
                            d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"
                          />
                        </svg>
                      </span>
                      <span className="text-left">Sign in with Google</span>
                    </span>
                  </Button>
                )}
                {enabledProviders.github && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleSignIn("github")}
                  >
                    <span className="inline-grid min-w-[11rem] grid-cols-[1.25rem_1fr] items-center gap-2">
                      <span
                        className="flex h-4 w-4 shrink-0 items-center justify-center"
                        aria-hidden
                      >
                        <svg
                          className="h-4 w-4"
                          aria-hidden="true"
                          focusable="false"
                          role="img"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 496 512"
                        >
                          <title>GitHub</title>
                          <path
                            fill="currentColor"
                            d="M165.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3.3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6zm-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9 2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5.3-6.2 2.3zm44.2-1.7c-2.9.7-4.9 2.6-4.6 4.9.3 2 2.9 3.3 5.9 2.6 2.9-.7 4.9-2.6 4.6-4.6-.3-1.9-3-3.2-5.9-2.9zM244.8 8C106.1 8 0 113.3 0 252c0 110.9 69.8 205.8 169.5 239.2 12.8 2.3 17.3-5.6 17.3-12.1 0-6.2-.3-40.4-.3-61.4 0 0-70 15-84.7-29.8 0 0-11.4-29.1-27.8-36.6 0 0-22.9-15.7 1.6-15.4 0 0 24.9 2 38.6 25.8 21.9 38.6 58.6 27.5 72.9 20.9 2.3-16 8.8-27.1 16-33.7-55.9-6.2-112.3-14.3-112.3-110.5 0-27.5 7.6-41.3 23.6-58.9-2.6-6.5-11.1-33.3 2.6-67.9 20.9-6.5 69 27 69 27 20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27 13.7 34.7 5.2 61.4 2.6 67.9 16 17.7 25.8 31.5 25.8 58.9 0 96.5-58.9 104.2-114.8 110.5 9.2 7.9 17 22.9 17 46.4 0 33.7-.3 75.4-.3 83.6 0 6.5 4.6 14.4 17.3 12.1C428.2 457.8 496 362.9 496 252 496 113.3 383.5 8 244.8 8zM97.2 352.9c-1.3 1-1 3.3.7 5.2 1.6 1.6 3.9 2.3 5.2 1 1.3-1 1-3.3-.7-5.2-1.6-1.6-3.9-2.3-5.2-1zm-10.8-8.1c-.7 1.3.3 2.9 2.3 3.9 1.6 1 3.6.7 4.3-.7.7-1.3-.3-2.9-2.3-3.9-2-.6-3.6-.3-4.3.7zm32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2 2.3 2.3 5.2 2.6 6.5 1 1.3-1.3.7-4.3-1.3-6.2-2.2-2.3-5.2-2.6-6.5-1zm-11.4-14.7c-1.6 1-1.6 3.6 0 5.9 1.6 2.3 4.3 3.3 5.6 2.3 1.6-1.3 1.6-3.9 0-6.2-1.4-2.3-4-3.3-5.6-2z"
                          />
                        </svg>
                      </span>
                      <span className="text-left">Sign in with GitHub</span>
                    </span>
                  </Button>
                )}
                {enabledProviders.microsoft && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleSignIn("microsoft-entra-id")}
                  >
                    <span className="inline-grid min-w-[11rem] grid-cols-[1.25rem_1fr] items-center gap-2">
                      <span
                        className="flex h-4 w-4 shrink-0 items-center justify-center"
                        aria-hidden
                      >
                        <svg
                          className="h-4 w-4"
                          aria-hidden="true"
                          focusable="false"
                          role="img"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 448 512"
                        >
                          <title>Microsoft</title>
                          <path
                            fill="currentColor"
                            d="M0 32h214.6v214.6H0V32zm233.4 0H448v214.6H233.4V32zM0 265.4h214.6V480H0V265.4zm233.4 0H448V480H233.4V265.4z"
                          />
                        </svg>
                      </span>
                      <span className="text-left">Sign in with Microsoft</span>
                    </span>
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <Alert variant="warning">
              <AlertDescription>
                Authentication is not configured. Set at least one provider (Google, GitHub, or
                Microsoft) in your environment variables.
              </AlertDescription>
            </Alert>
          )}

          <div className="border-t pt-4 text-center text-xs text-muted-foreground space-y-3 ">
            <p>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4 hover:text-primary transition-colors"
              >
                GitHub
              </a>
              {" · "}
              <a
                href={DOCS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4 hover:text-primary transition-colors"
              >
                Docs
              </a>
            </p>
            <p>
              By signing in, you agree to the{" "}
              <button
                type="button"
                className="underline underline-offset-4 hover:text-primary transition-colors"
                onClick={() => showAgreement("Terms of Service", TERMS_OF_SERVICE)}
              >
                Terms of Service
              </button>{" "}
              and{" "}
              <button
                type="button"
                className="underline underline-offset-4 hover:text-primary transition-colors"
                onClick={() => showAgreement("Privacy Policy", PRIVACY_POLICY)}
              >
                Privacy Policy
              </button>
              .
            </p>
          </div>
        </CardContent>
      </Card>

      <AgreementDialog
        isOpen={agreementOpen.open}
        onOpenChange={(open) => setAgreementOpen((prev) => ({ ...prev, open }))}
        content={agreementOpen.content}
      />
    </div>
  );
}

export function LoginForm({ enabledProviders }: { enabledProviders: EnabledProviders }) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginFormContent enabledProviders={enabledProviders} />
    </Suspense>
  );
}
