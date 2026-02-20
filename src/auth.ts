import type { AuthConfig } from "@auth/core";
import { jwtVerify, SignJWT } from "jose";
import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import GitHubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

/** Header name for authenticated user email, set by proxy. APIs read via getAuthenticatedUserEmail(request). */
export const AUTH_HEADER_USER_EMAIL = "x-datastoria-user-email";

/** Reads authenticated user email from request headers (set by proxy). Returns undefined for anonymous users. */
export function getAuthenticatedUserEmail(request: Request): string | undefined {
  const email = request.headers.get(AUTH_HEADER_USER_EMAIL);
  return email && email.length > 0 ? email : undefined;
}

/** Provider enabled when credentials are configured AND NEXTAUTH_*_ENABLED is "true". Single source of truth for auth and login UI. */
export function getEnabledProviders() {
  return {
    google:
      Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) &&
      process.env.NEXTAUTH_GOOGLE_ENABLED === "true",
    github:
      Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) &&
      process.env.NEXTAUTH_GITHUB_ENABLED === "true",
    microsoft:
      Boolean(
        process.env.MICROSOFT_CLIENT_ID &&
        process.env.MICROSOFT_CLIENT_SECRET &&
        process.env.MICROSOFT_TENANT_ID
      ) && process.env.NEXTAUTH_MICROSOFT_ENABLED === "true",
  };
}

function getAuthProviders(): Provider[] {
  const providers: Provider[] = [];
  const enabled = getEnabledProviders();

  // Add Google Auth Provider
  if (enabled.google) {
    providers.push(
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      })
    );
  }

  // Add GitHub Auth Provider
  if (enabled.github) {
    providers.push(
      GitHubProvider({
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
      })
    );
  }

  // Add Microsoft Entra ID (formerly Azure AD) Auth Provider
  if (enabled.microsoft) {
    providers.push(
      MicrosoftEntraID({
        clientId: process.env.MICROSOFT_CLIENT_ID,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
        tenantId: process.env.MICROSOFT_TENANT_ID,
      } as Parameters<typeof MicrosoftEntraID>[0])
    );
  }

  return providers;
}

/** NextAuth config type: AuthConfig without internal "raw" (same as next-auth's NextAuthConfig). */
type NextAuthConfig = Omit<AuthConfig, "raw">;

const authConfig: NextAuthConfig = {
  debug: false,
  basePath: "/api/auth",
  providers: getAuthProviders(),
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
  },
  jwt: {
    maxAge: 7 * 24 * 60 * 60, // 7 days
    encode: async ({ secret, token }) => {
      if (!token) {
        throw new Error("Token is required for encoding");
      }
      // Issue time and expiration time are all based on seconds
      const iat = token.iat ? token.iat : Math.floor(Date.now() / 1000);
      const exp = token.exp ? token.exp : iat + 7 * 24 * 60 * 60; // 7 days

      return await new SignJWT({
        name: token.name,
        email: token.email,
        picture: token.picture,
      })
        // Use provider's stable sub when present; fallback to email
        .setSubject((token.sub as string) || (token.email as string) || "")
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setExpirationTime(exp)
        .setIssuedAt(iat)
        .setNotBefore(iat)
        .setIssuer("https://clickhouse-console.local/token/issuer")
        .sign(new TextEncoder().encode(secret as string));
    },
    decode: async ({ secret, token }) => {
      if (!token) {
        throw new Error("Token is required for decoding");
      }
      const { payload } = await jwtVerify(token, new TextEncoder().encode(secret as string), {
        algorithms: ["HS256"],
      });
      // Keep the raw token in the payload to pass it to the session callback
      payload.accessToken = token;
      return payload;
    },
  },
  cookies: {
    sessionToken: {
      name: "clickhouse-console.session-token",
    },
  },
  callbacks: {
    async redirect({ url, baseUrl }) {
      // Redirect to the home page after successful authentication
      if (url.startsWith("/")) {
        return `${baseUrl}${url}`;
      }
      if (new URL(url).origin === baseUrl) {
        return url;
      }
      return baseUrl;
    },

    // This callback is called after the decode callback.
    // The input token is the return value of the decode callback.
    async jwt({ token }) {
      return token;
    },

    // This callback is called after the 'jwt' callback.
    // The input token is the return value of the 'jwt' callback.
    // The session object is the value that will be returned back to the client
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.sub as string) ?? (token.email as string) ?? "";
      }
      (session as { accessToken?: string }).accessToken = token.accessToken as string;
      return session;
    },
  },
};

/**
 * NOTE: this function should ONLY be called from the server side.
 */
export function isAuthEnabled() {
  return authConfig.providers && authConfig.providers.length > 0;
}

/**
 * When true, anonymous users are allowed (optional auth).
 * When false (ALLOW_ANONYMOUS_USER=false), authentication is required.
 * Default: true when not set.
 */
export function allowAnonymousUser(): boolean {
  return process.env.ALLOW_ANONYMOUS_USER !== "false";
}

// Validate config at module load: ALLOW_ANONYMOUS_USER=false requires at least one OAuth provider
if (process.env.ALLOW_ANONYMOUS_USER === "false" && !isAuthEnabled()) {
  throw new Error(
    "ALLOW_ANONYMOUS_USER=false requires at least one OAuth provider. " +
      "Configure Google, GitHub, or Microsoft OAuth credentials and set the corresponding NEXTAUTH_*_ENABLED=true."
  );
}

/** Result shape when auth is enabled; used for typing the conditional export. */
type AuthResult = {
  handlers: { GET: (req: Request) => Promise<Response>; POST: (req: Request) => Promise<Response> };
  auth: () => Promise<unknown>;
  signIn: (provider?: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const nextAuthFn = NextAuth as (config: NextAuthConfig) => AuthResult;

/**
 * Fallback implementation when auth is disabled.
 *
 * We still need concrete function bodies for GET/POST/auth/signIn/signOut so that:
 * - Route handlers and middleware can safely import and call them even if no providers are configured.
 * - We avoid runtime errors like \"is not a function\" when destructuring from an empty object.
 * These stubs return explicit 404 responses for auth routes and `null` for `auth()`, so caller
 * code can gate behavior using `isAuthEnabled()`.
 */
const disabledAuth: AuthResult = {
  handlers: {
    GET: async () =>
      new Response(JSON.stringify({ message: "Authentication is not enabled" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    POST: async () =>
      new Response(JSON.stringify({ message: "Authentication is not enabled" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
  },
  auth: async () => null,
  signIn: async () => {},
  signOut: async () => {},
};

export const { handlers, auth, signIn, signOut } = isAuthEnabled()
  ? nextAuthFn(authConfig)
  : disabledAuth;
