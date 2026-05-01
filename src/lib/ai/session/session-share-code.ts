import { jwtVerify, SignJWT } from "jose";
import {
  SESSION_SHARE_EXPIRES_AT_SECONDS,
  SESSION_SHARE_SCOPE_FULL,
} from "./session-share-constants";

export type SessionShareClaims = {
  issuer: string;
  sessionId: string;
  scope: typeof SESSION_SHARE_SCOPE_FULL;
  expiresAt: number;
};

const SHARE_CODE_ISSUER = "https://datastoria.app/session/share";

function getShareCodeSecret(): Uint8Array {
  const secret = process.env.SESSION_SHARE_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("SESSION_SHARE_SECRET or NEXTAUTH_SECRET is required to sign session shares");
  }
  return new TextEncoder().encode(secret);
}

export async function signSessionShareCode(input: {
  ownerId: string;
  sessionId: string;
  expiresAt?: number;
}): Promise<string> {
  const expiresAt = input.expiresAt ?? SESSION_SHARE_EXPIRES_AT_SECONDS;
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({ scope: SESSION_SHARE_SCOPE_FULL })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(input.ownerId)
    .setSubject(input.sessionId)
    .setAudience(SHARE_CODE_ISSUER)
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(expiresAt)
    .sign(getShareCodeSecret());
}

export async function verifySessionShareCode(code: string): Promise<SessionShareClaims> {
  const { payload } = await jwtVerify(code, getShareCodeSecret(), {
    algorithms: ["HS256"],
    audience: SHARE_CODE_ISSUER,
  });

  if (
    typeof payload.iss !== "string" ||
    payload.iss.length === 0 ||
    typeof payload.sub !== "string" ||
    payload.sub.length === 0 ||
    payload.scope !== SESSION_SHARE_SCOPE_FULL ||
    typeof payload.exp !== "number"
  ) {
    throw new Error("Invalid session share code");
  }

  return {
    issuer: payload.iss,
    sessionId: payload.sub,
    scope: SESSION_SHARE_SCOPE_FULL,
    expiresAt: payload.exp,
  };
}
