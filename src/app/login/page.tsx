import { LoginForm } from "@/app/login/login-form";
import { getEnabledProviders } from "@/auth";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login",
  description:
    "Sign in to DataStoria to access your ClickHouse databases with AI-powered management tools. Secure authentication with Google, GitHub, or Microsoft.",
  openGraph: {
    title: "Login to DataStoria",
    description:
      "Sign in to access AI-powered ClickHouse management console with natural language queries and intelligent optimization.",
    url: "/login",
  },
  twitter: {
    title: "Login to DataStoria",
    description: "Sign in to access AI-powered ClickHouse management console.",
  },
  robots: {
    index: false, // Don't index login page
    follow: true,
  },
  alternates: {
    canonical: "/login",
  },
};

export default function LoginPage() {
  const enabledProviders = getEnabledProviders();

  return <LoginForm enabledProviders={enabledProviders} />;
}
