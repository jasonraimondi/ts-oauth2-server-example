import { sign, verify } from "hono/jwt";

/**
 * The browser session cookie ("jid") lives in a DIFFERENT trust domain than the
 * OAuth/OIDC tokens: it authenticates the end-user to OUR login UI, while the
 * RS256 OIDC key signs tokens that relying parties verify against the published
 * JWKS. Signing the session with the OIDC key would conflate the two — anyone
 * with the public JWKS could reason about our session format, and an id_token
 * and a session cookie would become interchangeable. So the session gets its own
 * symmetric (HS256) secret, never published anywhere.
 *
 * Provide a stable secret via `SESSION_SECRET`. If it is unset we fall back to a
 * hardcoded dev default (with a warning), mirroring the OIDC ephemeral-key
 * pattern in oidc_key.ts — convenient for local dev, unsafe for production.
 */
const DEV_SECRET = "dev-insecure-session-secret-change-me";

export function resolveSessionSecret(): string {
  const fromEnv = process.env.SESSION_SECRET?.trim();
  if (fromEnv && fromEnv !== DEV_SECRET) return fromEnv;
  // Fail closed in production: a missing or default secret means forgeable session
  // cookies (HS256 with a publicly-known key), so refuse to boot rather than warn
  // and carry on.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET must be set to a non-default value in production (refusing the insecure dev default).",
    );
  }
  console.warn(
    "[session] SESSION_SECRET not set — using an insecure hardcoded dev default; set SESSION_SECRET in production.",
  );
  return DEV_SECRET;
}

const SECRET = resolveSessionSecret();
const ISSUER = "ts-oauth2-server-example";
const AUDIENCE = "session";

export type SessionClaims = {
  sub: string; // the authenticated user's id
  typ: "session"; // distinguishes a session cookie from an OIDC id_token/access token
  ver: number; // the user's tokenVersion at sign time; bumping it revokes the cookie
  iss: string;
  aud: string;
  iat: number;
  exp: number;
};

/**
 * Mint an HS256 session JWT for `userId`, valid for `ttlSeconds`, bound to the
 * user's current `tokenVersion`. A later bump of that version invalidates this
 * cookie (see verifySession + currentUser).
 */
export async function signSession(
  userId: string,
  ttlSeconds: number,
  tokenVersion: number,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims: SessionClaims = {
    sub: userId,
    typ: "session",
    ver: tokenVersion,
    iss: ISSUER,
    aud: AUDIENCE,
    iat: now,
    exp: now + ttlSeconds,
  };
  return sign(claims, SECRET, "HS256");
}

/**
 * Verify a session cookie and return its `sub` + `ver`, or undefined when the
 * token is invalid/expired or is NOT a session token (e.g. someone tried to pass
 * an id_token). hono/jwt's verify enforces exp/iss/aud; we additionally assert
 * `typ === "session"` so the two token kinds can never be swapped. The caller
 * compares `ver` against the user's live tokenVersion to honor revocation.
 */
export async function verifySession(
  token: string,
): Promise<{ sub: string; ver: number } | undefined> {
  try {
    const claims = await verify(token, SECRET, { alg: "HS256", iss: ISSUER, aud: AUDIENCE });
    if (
      claims.typ !== "session" ||
      typeof claims.sub !== "string" ||
      typeof claims.ver !== "number"
    )
      return undefined;
    return { sub: claims.sub, ver: claims.ver };
  } catch {
    return undefined;
  }
}
