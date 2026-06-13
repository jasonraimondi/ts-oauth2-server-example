import { createHash, randomBytes } from "node:crypto";

import { app } from "../src/app.js";
import { signSession } from "../src/lib/session.js";

export const SEEDED_USER_ID = "dd74961a-c348-4471-98a5-19fc3c5b5079";

export type Pkce = { verifier: string; challenge: string };

export function pkce(): Pkce {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/**
 * Mint a "jid" session cookie the way app.tsx does: an HS256 hono/jwt signed
 * with SESSION_SECRET (the dev default in tests, since .env.test sets only
 * DATABASE_URL) carrying typ:"session". Minting the OIDC jwt no longer works —
 * current_user.ts asserts typ:"session" via verifySession.
 */
export function mintJid(userId: string = SEEDED_USER_ID, tokenVersion = 0): Promise<string> {
  return signSession(userId, 3600, tokenVersion);
}

// app.request uses http://localhost as the origin; mirror it so hono/csrf passes.
export const formHeaders = {
  "content-type": "application/x-www-form-urlencoded",
  origin: "http://localhost",
  host: "localhost",
};

// Pull the jid value out of a Set-Cookie header (`jid=<value>; HttpOnly; ...`).
export function jidFromSetCookie(setCookie: string): string {
  const match = /(?:^|,\s*)jid=([^;]+)/.exec(setCookie);
  return match![1];
}

/**
 * Drive the full consent flow for an authenticated session: GET authorize
 * redirects to /api/scopes, then POST /api/scopes with accept=yes completes the
 * request. Returns the client redirect Response (302 to redirect_uri w/ code).
 * This mirrors the real browser path now that consent is no longer cosmetic.
 */
export async function approveAuthorize(query: string, jid: string): Promise<Response> {
  // The GET only validates + routes; the POST is what completes the request.
  const authorizeRes = await app.request(`/api/oauth2/authorize?${query}`, {
    headers: { Cookie: `jid=${jid}` },
    redirect: "manual",
  });
  if (authorizeRes.status !== 302) return authorizeRes;

  return app.request(`/api/scopes?${query}`, {
    method: "POST",
    headers: { ...formHeaders, Cookie: `jid=${jid}` },
    body: "accept=yes",
    redirect: "manual",
  });
}

/** approveAuthorize + extract the authorization code from the callback redirect. */
export async function codeFromApprove(query: string, jid: string): Promise<string> {
  const res = await approveAuthorize(query, jid);
  return new URL(res.headers.get("location")!).searchParams.get("code")!;
}
