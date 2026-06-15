import { dev } from "$app/environment";
import { error, redirect, type RequestHandler } from "@sveltejs/kit";

import { config, discover } from "$lib/server/config";
import { exchangeCode, fetchUserInfo, validateIdToken } from "$lib/server/oauth";
import { SESSION_COOKIE, createSession, takePending } from "$lib/server/session";

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

// Handle the AS redirect: validate state, exchange the code (confidential client,
// server-to-server), validate the id_token (iss/aud/exp/nonce, RS256), then mint a
// server-side session and hand the browser only an opaque HttpOnly cookie.
export const GET: RequestHandler = async ({ fetch, url, cookies }) => {
  const errParam = url.searchParams.get("error");
  if (errParam) error(400, url.searchParams.get("error_description") ?? errParam);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) error(400, "Missing code or state in callback.");

  // Consume-once: a present record proves the state matches one we issued (CSRF).
  const pending = takePending(state);
  if (!pending) error(400, "Unknown or expired login state — please try again.");

  const { doc, jwks } = await discover(fetch);

  const tokens = await exchangeCode({
    fetch,
    tokenEndpoint: doc.token_endpoint,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
    code,
    codeVerifier: pending.codeVerifier,
  });

  if (!tokens.id_token) error(502, "Authorization server returned no id_token.");
  const claims = await validateIdToken(tokens.id_token, {
    jwks,
    issuer: config.issuer,
    clientId: config.clientId,
    nonce: pending.nonce,
  });

  // The id_token's `sub` is the identity; pull supplementary claims (email) from
  // UserInfo, authenticated with the access token. Best-effort — sub still stands.
  let email = typeof claims.email === "string" ? claims.email : undefined;
  if (!email && doc.userinfo_endpoint) {
    const profile = await fetchUserInfo({
      fetch,
      userinfoEndpoint: doc.userinfo_endpoint,
      accessToken: tokens.access_token,
    }).catch(() => ({}) as Record<string, unknown>);
    if (typeof profile.email === "string") email = profile.email;
  }

  const sid = createSession({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    accessTokenExpiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    user: { sub: String(claims.sub), email },
  });

  cookies.set(SESSION_COOKIE, sid, {
    path: "/",
    httpOnly: true,
    secure: !dev, // browsers drop Secure cookies over http://localhost
    sameSite: "strict",
    maxAge: SESSION_TTL_SECONDS,
  });

  redirect(302, pending.returnTo);
};
