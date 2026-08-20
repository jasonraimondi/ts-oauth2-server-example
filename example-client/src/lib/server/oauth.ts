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
 * redirect once handed to a 302 Location. Control characters are stripped first
 * because browsers do the same before parsing, so "/\t//evil" would otherwise
 * slip past the prefix checks and resolve to a protocol-relative redirect.
 * Sanitized on the way in so a tainted value never reaches the pending store.
 */
export function safeReturnTo(raw: string | null): string {
  if (!raw) return "/";
  const v = raw.replace(/[\u0000-\u001f\u007f]/g, "");
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return "/";
  return v;
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
  return parseTokenResponse(await res.json());
}

/**
 * The token response crosses a trust boundary: whatever the AS sends lands in an
 * `Authorization: Bearer` header and in the session store. A cast would let a
 * missing or non-string `access_token` travel as the literal "undefined" instead
 * of failing here, so each field is checked and anything unrecognized dropped.
 */
function parseTokenResponse(body: unknown): TokenResponse {
  const claims = body as Record<string, unknown> | null;
  if (typeof claims?.access_token !== "string" || claims.access_token === "") {
    throw new Error("token endpoint returned no access_token");
  }
  if (typeof claims.token_type !== "string") {
    throw new Error("token endpoint returned no token_type");
  }
  const optionalString = (value: unknown) => (typeof value === "string" ? value : undefined);
  return {
    access_token: claims.access_token,
    token_type: claims.token_type,
    refresh_token: optionalString(claims.refresh_token),
    id_token: optionalString(claims.id_token),
    expires_in: typeof claims.expires_in === "number" ? claims.expires_in : undefined,
    scope: optionalString(claims.scope),
  };
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
  const claims: unknown = await res.json();
  if (typeof claims !== "object" || claims === null || Array.isArray(claims)) {
    throw new Error("userinfo endpoint returned a non-object body");
  }
  return claims as Record<string, unknown>;
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
