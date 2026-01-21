import { LoginForm } from "@/app/login/login-form";

function getEnabledProviders() {
  return {
    google: process.env.NEXTAUTH_GOOGLE_ENABLED === "true",
    github: process.env.NEXTAUTH_GITHUB_ENABLED === "true",
    microsoft: process.env.NEXTAUTH_MICROSOFT_ENABLED === "true",
  };
}

export default function LoginPage() {
  const enabledProviders = getEnabledProviders();

  return <LoginForm enabledProviders={enabledProviders} />;
}
