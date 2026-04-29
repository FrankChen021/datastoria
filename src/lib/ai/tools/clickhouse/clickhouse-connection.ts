export interface ClickHouseConnection {
  url: string;
  user: string;
  password: string;
  cluster?: string;
}

export function hasClickHouseConnection(connection: unknown): connection is ClickHouseConnection {
  const candidate = connection as Partial<ClickHouseConnection> | null;
  return Boolean(
    candidate &&
    typeof candidate === "object" &&
    typeof candidate.url === "string" &&
    typeof candidate.user === "string" &&
    typeof candidate.password === "string" &&
    (candidate.cluster === undefined || typeof candidate.cluster === "string")
  );
}

function isPrivateIPv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4) return false;
  const octets = parts.map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  const [a, b] = octets;
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    a === 0
  );
}

function isUnsafeIPv6(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!normalized.includes(":")) return false;

  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

function isUnsafeHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    isUnsafeIPv6(normalized) ||
    isPrivateIPv4(normalized)
  );
}

export function getClickHouseConnectionValidationError(connection: unknown): string | null {
  if (!hasClickHouseConnection(connection)) {
    return "ClickHouse connection must include url, user, and password string fields.";
  }

  let parsed: URL;
  try {
    parsed = new URL(connection.url);
  } catch {
    return "ClickHouse connection URL is invalid.";
  }

  if (parsed.protocol !== "https:") {
    return "Server-side ClickHouse tools require an https URL.";
  }

  if (parsed.username || parsed.password) {
    return "ClickHouse connection URL must not include embedded credentials.";
  }

  if (isUnsafeHostname(parsed.hostname)) {
    return "Server-side ClickHouse tools do not allow localhost or private-network URLs.";
  }

  return null;
}
