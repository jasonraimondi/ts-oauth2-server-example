import { error, json, redirect } from "@sveltejs/kit";
import type { JWTVerifyGetKey } from "jose";

import { exchangeCode, fetchUserInfo, refreshTokens, validateIdToken } from "./oauth";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  coalesceRefresh,
  createSession,
  destroySession,
  takePending,
  updateSession,
  type Session,
} from "./session";

/*
 * The route files under src/routes are thin adapters: they unpack the SvelteKit
 * request event and call one of the handlers here. Everything security-relevant
 * therefore lives beside the pure modules in this directory and is exercised by
 * plain objects in the tests, with no SvelteKit runtime to stand up.
 */

/** Only the discovery fields these handlers spend; the config module owns the document. */
type Endpoints = {
  token_endpoint: string;
  userinfo_endpoint?: string;
};

type ClientCredentials = {
  clientId: string;
  clientSecret: string;
};

type SessionCookieOptions = {
  path: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  maxAge: number;
};

/** The slice of SvelteKit's `cookies` these handlers touch. */
export type CookieJar = {
  get(name: string): string | undefined;
  set(name: string, value: string, opts: SessionCookieOptions): void;
  delete(name: string, opts: { path: string }): void;
};

const REFRESH_SKEW_MS = 5_000;

/**
 * Handle the AS redirect: consume the state, exchange the code (confidential
 * client, server-to-server), validate the id_token (iss/aud/exp/nonce, RS256),
 * then mint a server-side session and hand the browser only an opaque cookie.
 * Always ends in a redirect or an error — never returns.
 */
export async function handleCallback(deps: {
  url: URL;
  fetch: typeof fetch;
  cookies: CookieJar;
  secureCookie: boolean;
  config: ClientCredentials & { issuer: string; redirectUri: string };
  discover: () => Promise<{ doc: Endpoints; jwks: JWTVerifyGetKey }>;
}): Promise<never> {
  const { url, cookies, config } = deps;

  // A denied consent is a first-class outcome, not an exception: send the user
  // home with a code the page can render, rather than to the stock error page.
  const errParam = url.searchParams.get("error");
  if (errParam) redirect(302, `/?auth_error=${encodeURIComponent(errParam)}`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) error(400, "Missing code or state in callback.");

  // Consume-once: a present record proves the state matches one we issued (CSRF).
  const pending = takePending(state);
  if (!pending) redirect(302, "/?auth_error=expired_state");

  const { doc, jwks } = await deps.discover();

  const tokens = await exchangeCode({
    fetch: deps.fetch,
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
      fetch: deps.fetch,
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
    secure: deps.secureCookie, // browsers drop Secure cookies over http://localhost
    // Lax rather than Strict: the request that lands here comes at the end of the
    // authorization server's cross-site redirect chain, and Strict withholds the
    // cookie on such a landing — the user would arrive back looking logged out.
    // Lax still withholds it from cross-site POSTs, the CSRF-relevant case.
    sameSite: "lax",
    maxAge: SESSION_TTL_MS / 1000,
  });

  redirect(302, pending.returnTo);
}

/**
 * Spend the session's access token against the protected resource, refreshing it
 * first when it is about to expire. The token never leaves the server.
 */
export async function handleContacts(deps: {
  fetch: typeof fetch;
  cookies: CookieJar;
  sid?: string;
  session?: Session;
  config: ClientCredentials;
  contactsEndpoint: string;
  discover: () => Promise<{ doc: Endpoints }>;
}): Promise<Response> {
  const { fetch: fetchImpl, cookies, sid, session, config } = deps;
  if (!sid || !session) return json({ error: "unauthenticated" }, { status: 401 });

  let accessToken = session.accessToken;
  if (Date.now() >= session.accessTokenExpiresAt - REFRESH_SKEW_MS && session.refreshToken) {
    const refreshToken = session.refreshToken; // narrowed here; captured for the closure
    try {
      // Single-flight per sid: concurrent requests share one refresh instead of
      // each replaying the same refresh token into the AS's reuse detection, which
      // would revoke the whole token family and log the user out.
      const refreshed = await coalesceRefresh(sid, async () => {
        const { doc } = await deps.discover();
        const next = await refreshTokens({
          fetch: fetchImpl,
          tokenEndpoint: doc.token_endpoint,
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          refreshToken,
        });
        const updated: Session = {
          ...session,
          accessToken: next.access_token,
          refreshToken: next.refresh_token ?? refreshToken,
          accessTokenExpiresAt: Date.now() + (next.expires_in ?? 3600) * 1000,
        };
        updateSession(sid, updated);
        return updated;
      });
      accessToken = refreshed.accessToken;
    } catch {
      // Refresh token spent/revoked (or the AS is unreachable): tear down the dead
      // session rather than wedging every future request behind a stale one.
      return endSession(sid, cookies);
    }
  }

  const res = await fetchImpl(deps.contactsEndpoint, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  // An upstream 401 means our token is dead even though the BFF session still
  // looks alive. Forwarding it verbatim made "session gone" and "resource says
  // no" indistinguishable to the browser, so end the session here instead.
  if (res.status === 401) return endSession(sid, cookies);
  if (!res.ok) return json({ error: "upstream_error" }, { status: 502 });

  const body = await res.json().catch(() => undefined);
  if (body === undefined) return json({ error: "upstream_error" }, { status: 502 });
  return json(body);
}

/** Best-effort revoke at the AS, then destroy the session and clear the cookie. */
export async function handleLogout(deps: {
  fetch: typeof fetch;
  cookies: CookieJar;
  sid?: string;
  session?: Session;
  config: ClientCredentials;
  revocationUrl: () => Promise<string>;
}): Promise<void> {
  const { sid, session, config } = deps;
  if (!sid) return;

  const refreshToken = session?.refreshToken;
  if (refreshToken) {
    // Best-effort: an unreachable AS (or an already-dead token) must not leave
    // the user logged in here.
    await deps
      .revocationUrl()
      .then(endpoint =>
        deps.fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            token: refreshToken,
            token_type_hint: "refresh_token",
            client_id: config.clientId,
            client_secret: config.clientSecret,
          }),
        }),
      )
      .catch(() => undefined);
  }

  destroySession(sid);
  deps.cookies.delete(SESSION_COOKIE, { path: "/" });
}

function endSession(sid: string, cookies: CookieJar): Response {
  destroySession(sid);
  cookies.delete(SESSION_COOKIE, { path: "/" });
  return json({ error: "session_expired" }, { status: 401 });
}
