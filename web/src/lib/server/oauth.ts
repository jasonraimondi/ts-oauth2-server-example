import { createHash, randomBytes } from "node:crypto";

import { jwtVerify, type JWTVerifyGetKey } from "jose";

/** A URL-safe, CSPRNG token — used for `state`, `nonce`, and opaque session ids. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** PKCE: a high-entropy verifier (43 chars, within RFC 7636) and its S256 challenge. */
export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/**
 * Sanitize a post-login `returnTo` into a same-origin path, defaulting to "/".
 * Only a value beginning with a single "/" is allowed: an absolute URL
 * ("https://evil"), a protocol-relative one ("//evil"), or the backslash trick
 * ("/\\evil", which browsers normalize to "//evil") would each be an open
 * redirect once handed to a 302 Location. Sanitized on the way in so a tainted
 * value never reaches the pending store.
 */
export function safeReturnTo(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}

export function buildAuthorizeUrl(opts: {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}): string {
  const url = new URL(opts.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("scope", opts.scope);
  url.searchParams.set("state", opts.state);
  url.searchParams.set("nonce", opts.nonce);
  url.searchParams.set("code_challenge", opts.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.href;
}

export type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
};

async function postToken(
  fetchImpl: typeof fetch,
  tokenEndpoint: string,
  clientId: string,
  clientSecret: string,
  params: Record<string, string>,
): Promise<TokenResponse> {
  // client_secret_post + the confidential client's secret. Form-encoded per
  // RFC 6749 §4.1.3 (not JSON), with the secret kept server-side in the BFF.
  const body = new URLSearchParams({ ...params, client_id: clientId, client_secret: clientSecret });
  const res = await fetchImpl(tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`token endpoint responded ${res.status}: ${detail}`);
  }
  return (await res.json()) as TokenResponse;
}

export function exchangeCode(opts: {
  fetch: typeof fetch;
  tokenEndpoint: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}): Promise<TokenResponse> {
  return postToken(opts.fetch, opts.tokenEndpoint, opts.clientId, opts.clientSecret, {
    grant_type: "authorization_code",
    redirect_uri: opts.redirectUri,
    code: opts.code,
    code_verifier: opts.codeVerifier,
  });
}

export function refreshTokens(opts: {
  fetch: typeof fetch;
  tokenEndpoint: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<TokenResponse> {
  return postToken(opts.fetch, opts.tokenEndpoint, opts.clientId, opts.clientSecret, {
    grant_type: "refresh_token",
    refresh_token: opts.refreshToken,
  });
}

/**
 * Fetch supplementary identity claims from the UserInfo endpoint, authenticated
 * with the access token (NOT the id_token). The id_token's `sub` is the identity;
 * this fills in claims like `email` that aren't in the id_token by default.
 */
export async function fetchUserInfo(opts: {
  fetch: typeof fetch;
  userinfoEndpoint: string;
  accessToken: string;
}): Promise<Record<string, unknown>> {
  const res = await opts.fetch(opts.userinfoEndpoint, {
    headers: { authorization: `Bearer ${opts.accessToken}`, accept: "application/json" },
  });
  if (!res.ok) throw new Error(`userinfo endpoint responded ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

/**
 * Validate an OIDC id_token. `jose.jwtVerify` does the dangerous parts — signature
 * via the (injected) JWKS, the RS256 algorithm pin (which rejects alg:none and any
 * HS* algorithm-confusion attempt), and the `iss`/`aud`/`exp` checks. We add the
 * one OIDC-specific check it can't: `nonce` must equal the value stashed pre-auth.
 */
export async function validateIdToken(
  idToken: string,
  opts: {
    jwks: JWTVerifyGetKey;
    issuer: string;
    clientId: string;
    nonce: string;
    clockToleranceSec?: number;
  },
): Promise<Record<string, unknown>> {
  const { payload } = await jwtVerify(idToken, opts.jwks, {
    issuer: opts.issuer,
    audience: opts.clientId,
    algorithms: ["RS256"],
    clockTolerance: opts.clockToleranceSec ?? 30,
  });
  if (payload.nonce !== opts.nonce) {
    throw new Error("id_token nonce mismatch");
  }
  return payload;
}
