"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { PureComponent, type ErrorInfo, type ReactNode } from "react";
import { GitHubIcon } from "../app-sidebar";

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends PureComponent<Props, State> {
  override state: State = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log to console in development; could send to error reporting in production
    if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.error("ErrorBoundary caught an error:", error, errorInfo);
    }
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  override render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 p-6">
          <Card className="w-full max-w-[800px]">
            <CardHeader className="flex flex-col items-center gap-2 text-center">
              <AlertTriangle className="size-10 text-destructive" aria-hidden />
              <h2 className="text-lg font-semibold">Something went wrong</h2>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              <pre className="w-full max-h-40 overflow-auto rounded-md border border-border bg-muted p-3 font-mono text-left text-xs text-muted-foreground">
                {!this.state.error.stack && `${this.state.error.message}`}
                {this.state.error.stack}
              </pre>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button type="button" variant="default" onClick={this.reset} className="gap-2">
                  <RotateCcw className="size-4" aria-hidden />
                  Try again
                </Button>
                <Button type="button" variant="outline" asChild className="gap-2">
                  <a
                    href="https://github.com/FrankChen021/datastoria/issues/new"
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open GitHub issues"
                  >
                    <GitHubIcon className="h-5 w-5" />
                    Report on GitHub
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}
