import { isHttpError, isRedirect, type HttpError, type Redirect } from "@sveltejs/kit";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTVerifyGetKey } from "jose";
import { beforeAll, describe, expect, it } from "vitest";

import { handleCallback, handleContacts, handleLogout, type CookieJar } from "./handlers";
import { SESSION_COOKIE, createSession, getSession, putPending, type Session } from "./session";

const ISSUER = "http://localhost:3000";
const CLIENT_ID = "bff-client";
const NONCE = "nonce-123";
const TOKEN_ENDPOINT = `${ISSUER}/api/oauth2/token`;
const USERINFO_ENDPOINT = `${ISSUER}/api/oauth2/userinfo`;
const CONTACTS_ENDPOINT = `${ISSUER}/api/contacts`;
const REVOCATION_ENDPOINT = `${ISSUER}/api/oauth2/revoke`;

const config = {
  issuer: ISSUER,
  clientId: CLIENT_ID,
  clientSecret: "bff-secret",
  redirectUri: "http://localhost:5173/auth/callback",
};

let privateKey: CryptoKey;
let jwks: JWTVerifyGetKey;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const jwk = await exportJWK(pair.publicKey);
  jwk.alg = "RS256";
  jwks = createLocalJWKSet({ keys: [jwk] });
});

function idToken(claims: Record<string, unknown> = {}): Promise<string> {
  return new SignJWT({ nonce: NONCE, ...claims })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(ISSUER)
    .setAudience(CLIENT_ID)
    .setSubject("user-1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

const discover = () =>
  Promise.resolve({
    doc: { token_endpoint: TOKEN_ENDPOINT, userinfo_endpoint: USERINFO_ENDPOINT },
    jwks,
  });

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type Route = (init?: RequestInit) => Response | Promise<Response>;

function fakeFetch(routes: Record<string, Route>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = (async (url: string | URL, init?: RequestInit) => {
    const href = String(url);
    calls.push({ url: href, init });
    const route = routes[href];
    if (!route) return new Response("no route", { status: 404 });
    return route(init);
  }) as unknown as typeof fetch;
  return { fetch: impl, calls };
}

function cookieJar() {
  const written = new Map<string, { value: string; opts: unknown }>();
  const deleted: string[] = [];
  const jar: CookieJar = {
    get: name => written.get(name)?.value,
    set: (name, value, opts) => void written.set(name, { value, opts }),
    delete: name => void deleted.push(name),
  };
  return { jar, written, deleted };
}

function loggedInSession(over: Partial<Session> = {}): Session {
  return {
    accessToken: "AT",
    refreshToken: "RT",
    accessTokenExpiresAt: Date.now() + 3_600_000,
    user: { sub: "user-1", email: "ada@example.com" },
    ...over,
  };
}

async function runCallback(search: string, routes: Record<string, Route> = {}) {
  const jar = cookieJar();
  const { fetch: fetchImpl, calls } = fakeFetch(routes);
  const thrown = await handleCallback({
    url: new URL(`http://localhost:5173/auth/callback${search}`),
    fetch: fetchImpl,
    cookies: jar.jar,
    secureCookie: false,
    config,
    discover,
  }).then(
    () => {
      throw new Error("handleCallback returned instead of redirecting");
    },
    (reason: unknown) => reason,
  );
  return { thrown, calls, ...jar };
}

describe("handleCallback", () => {
  it("sends a denied consent home with an auth_error rather than to an error page", async () => {
    const { thrown } = await runCallback("?error=access_denied");
    expect(isRedirect(thrown)).toBe(true);
    expect((thrown as Redirect).location).toBe("/?auth_error=access_denied");
  });

  it("rejects a callback with no code or state", async () => {
    const { thrown } = await runCallback("?code=abc");
    expect(isHttpError(thrown)).toBe(true);
    expect((thrown as HttpError).status).toBe(400);
  });

  it("sends an unknown or replayed state home as an expired attempt", async () => {
    const { thrown, calls } = await runCallback("?code=abc&state=never-issued");
    expect(isRedirect(thrown)).toBe(true);
    expect((thrown as Redirect).location).toBe("/?auth_error=expired_state");
    expect(calls).toEqual([]);
  });

  it("mints an httpOnly, lax session cookie and returns to the stashed path", async () => {
    putPending("state-ok", { nonce: NONCE, codeVerifier: "verifier", returnTo: "/contacts" });
    const { thrown, written } = await runCallback("?code=abc&state=state-ok", {
      [TOKEN_ENDPOINT]: async () =>
        jsonResponse({
          access_token: "AT",
          token_type: "Bearer",
          refresh_token: "RT",
          expires_in: 3600,
          id_token: await idToken({ email: "ada@example.com" }),
        }),
    });

    expect(isRedirect(thrown)).toBe(true);
    expect((thrown as Redirect).location).toBe("/contacts");

    const cookie = written.get(SESSION_COOKIE);
    expect(cookie).toBeDefined();
    expect(cookie?.opts).toMatchObject({ path: "/", httpOnly: true, sameSite: "lax" });
    expect(getSession(cookie!.value)?.user).toEqual({ sub: "user-1", email: "ada@example.com" });
  });

  it("falls back to userinfo when the id_token carries no email", async () => {
    putPending("state-noemail", { nonce: NONCE, codeVerifier: "verifier", returnTo: "/" });
    const { written } = await runCallback("?code=abc&state=state-noemail", {
      [TOKEN_ENDPOINT]: async () =>
        jsonResponse({
          access_token: "AT",
          token_type: "Bearer",
          expires_in: 3600,
          id_token: await idToken(),
        }),
      [USERINFO_ENDPOINT]: () => jsonResponse({ sub: "user-1", email: "grace@example.com" }),
    });

    const cookie = written.get(SESSION_COOKIE);
    expect(getSession(cookie!.value)?.user.email).toBe("grace@example.com");
  });
});

describe("handleContacts", () => {
  function run(over: { sid?: string; session?: Session }, routes: Record<string, Route> = {}) {
    const jar = cookieJar();
    const { fetch: fetchImpl, calls } = fakeFetch(routes);
    return handleContacts({
      fetch: fetchImpl,
      cookies: jar.jar,
      config,
      contactsEndpoint: CONTACTS_ENDPOINT,
      discover,
      ...over,
    }).then(res => ({ res, calls, ...jar }));
  }

  it("401s when the request carries no session", async () => {
    const { res } = await run({});
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "unauthenticated" });
  });

  it("proxies the resource with the session's access token", async () => {
    const sid = createSession(loggedInSession());
    let authorization: string | undefined;
    const { res } = await run(
      { sid, session: getSession(sid) },
      {
        [CONTACTS_ENDPOINT]: init => {
          authorization = (init?.headers as Record<string, string>).authorization;
          return jsonResponse([{ name: "Ada", email: "ada@example.com" }]);
        },
      },
    );

    expect(authorization).toBe("Bearer AT");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([{ name: "Ada", email: "ada@example.com" }]);
  });

  it("destroys the session when the refresh fails", async () => {
    const sid = createSession(loggedInSession({ accessTokenExpiresAt: Date.now() - 1 }));
    const { res, deleted } = await run(
      { sid, session: getSession(sid) },
      { [TOKEN_ENDPOINT]: () => jsonResponse({ error: "invalid_grant" }, 400) },
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "session_expired" });
    expect(deleted).toEqual([SESSION_COOKIE]);
    expect(getSession(sid)).toBeUndefined();
  });

  it("treats an upstream 401 as an ended session, not as a resource error", async () => {
    const sid = createSession(loggedInSession());
    const { res, deleted } = await run(
      { sid, session: getSession(sid) },
      { [CONTACTS_ENDPOINT]: () => new Response("", { status: 401 }) },
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "session_expired" });
    expect(deleted).toEqual([SESSION_COOKIE]);
    expect(getSession(sid)).toBeUndefined();
  });

  it("maps any other upstream failure to 502 and keeps the session", async () => {
    const sid = createSession(loggedInSession());
    const { res, deleted } = await run(
      { sid, session: getSession(sid) },
      { [CONTACTS_ENDPOINT]: () => new Response("boom", { status: 500 }) },
    );

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "upstream_error" });
    expect(deleted).toEqual([]);
    expect(getSession(sid)).toBeDefined();
  });
});

describe("handleLogout", () => {
  function run(over: { sid?: string; session?: Session }, routes: Record<string, Route> = {}) {
    const jar = cookieJar();
    const { fetch: fetchImpl, calls } = fakeFetch(routes);
    return handleLogout({
      fetch: fetchImpl,
      cookies: jar.jar,
      config,
      revocationUrl: () => Promise.resolve(REVOCATION_ENDPOINT),
      ...over,
    }).then(() => ({ calls, ...jar }));
  }

  it("revokes the refresh token, destroys the session and clears the cookie", async () => {
    const sid = createSession(loggedInSession());
    const { calls, deleted } = await run(
      { sid, session: getSession(sid) },
      { [REVOCATION_ENDPOINT]: () => new Response("", { status: 200 }) },
    );

    const body = calls[0]?.init?.body as URLSearchParams;
    expect(calls[0]?.url).toBe(REVOCATION_ENDPOINT);
    expect(body.get("token")).toBe("RT");
    expect(body.get("token_type_hint")).toBe("refresh_token");
    expect(body.get("client_secret")).toBe("bff-secret");
    expect(deleted).toEqual([SESSION_COOKIE]);
    expect(getSession(sid)).toBeUndefined();
  });

  it("still logs the user out when the revocation call fails", async () => {
    const sid = createSession(loggedInSession());
    const { deleted } = await run(
      { sid, session: getSession(sid) },
      {
        [REVOCATION_ENDPOINT]: () => {
          throw new Error("authorization server unreachable");
        },
      },
    );

    expect(deleted).toEqual([SESSION_COOKIE]);
    expect(getSession(sid)).toBeUndefined();
  });

  it("does nothing when there is no session cookie", async () => {
    const { calls, deleted } = await run({});
    expect(calls).toEqual([]);
    expect(deleted).toEqual([]);
  });
});
