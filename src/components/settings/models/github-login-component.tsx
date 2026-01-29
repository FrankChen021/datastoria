"use client";

import { Button } from "@/components/ui/button";
import React, { useEffect, useRef, useState } from "react";

interface GitHubLoginComponentProps {
    onSuccess: (token: string) => void;
    onCancel: () => void;
}

export function GitHubLoginComponent({ onSuccess, onCancel }: GitHubLoginComponentProps) {
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [authData, setAuthData] = useState<{
        device_code: string;
        user_code: string;
        verification_uri: string;
        interval: number;
        expires_in: number;
    } | null>(null);
    const [authError, setAuthError] = useState<string | null>(null);
    const isLoggingInRef = useRef(false);

    const startLogin = async () => {
        setIsLoggingIn(true);
        isLoggingInRef.current = true;
        setAuthError(null);
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
                        setIsLoggingIn(false);
                        onSuccess(tokenData.access_token);
                    } else if (tokenData.error === "authorization_pending") {
                        setTimeout(poll, currentInterval);
                    } else if (tokenData.error === "slow_down") {
                        currentInterval = (tokenData.interval || currentInterval / 1000 + 5) * 1000;
                        setTimeout(poll, currentInterval);
                    } else if (tokenData.error === "expired_token") {
                        setAuthError("The device code has expired. Please try again.");
                        setIsLoggingIn(false);
                        isLoggingInRef.current = false;
                    } else if (tokenData.error === "access_denied") {
                        setAuthError("Login was canceled or access was denied.");
                        setIsLoggingIn(false);
                        isLoggingInRef.current = false;
                    } else {
                        setAuthError(tokenData.error_description || "Authentication failed.");
                        setIsLoggingIn(false);
                        isLoggingInRef.current = false;
                    }
                } catch (err) {
                    setAuthError("Failed to verify login status. Please check your connection.");
                    setIsLoggingIn(false);
                    isLoggingInRef.current = false;
                }
            };

            setTimeout(poll, currentInterval);
        } catch (error) {
            setAuthError(error instanceof Error ? error.message : "Failed to initiate login.");
            setIsLoggingIn(false);
            isLoggingInRef.current = false;
        }
    };

    useEffect(() => {
        startLogin();
        return () => {
            isLoggingInRef.current = false;
        };
    }, []);

    return (
        <div className="flex flex-col items-center justify-center space-y-4 py-4 min-h-[200px]">
            {authError ? (
                <div className="text-destructive text-sm font-medium text-center">
                    {authError}
                    <div className="flex gap-2 justify-center mt-4">
                        <Button variant="outline" size="sm" onClick={onCancel}>
                            Cancel
                        </Button>
                        <Button variant="default" size="sm" onClick={startLogin}>
                            Try Again
                        </Button>
                    </div>
                </div>
            ) : authData ? (
                <div className="space-y-4 w-full text-center">
                    <div className="text-sm font-medium">Please enter this code on GitHub:</div>
                    <div className="bg-muted p-4 rounded-lg font-mono text-2xl tracking-widest text-primary border">
                        {authData.user_code}
                    </div>
                    <div className="text-xs text-muted-foreground animate-pulse">
                        Waiting for authorization...
                    </div>
                    <div className="flex flex-col gap-2">
                        <Button className="w-full" asChild>
                            <a href={authData.verification_uri} target="_blank" rel="noreferrer">
                                Continue on GitHub
                            </a>
                        </Button>
                        <Button variant="ghost" size="sm" onClick={onCancel}>
                            Cancel
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center space-y-2">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <div className="text-sm text-muted-foreground">Initializing login flow...</div>
                    <Button variant="ghost" size="sm" onClick={onCancel} className="mt-4">
                        Cancel
                    </Button>
                </div>
            )}
        </div>
    );
}
