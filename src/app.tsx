import { Hono, type Context } from "hono";
import { csrf } from "hono/csrf";
import { bodyLimit } from "hono/body-limit";
import { requestId } from "hono/request-id";
import { setCookie, deleteCookie } from "hono/cookie";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, ilike, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";

import { html } from "hono/html";
import { HTTPException } from "hono/http-exception";

import {
  requestFromVanilla,
  responseToVanilla,
  handleVanillaError,
} from "@jmondi/oauth2-server/vanilla";
import { OAuthException } from "@jmondi/oauth2-server";

import {
  authorizationServer,
  db,
  accessTokenVerifier,
  tokenRepository,
  userRepository,
} from "./container.js";
import { users } from "./db/schema.js";
import { verifyPasswordOrThrow, InvalidAuthorizationError } from "./lib/password.js";
import { currentUser, type AppEnv } from "./app/oauth/current_user.js";
import { rateLimit } from "./lib/rate_limit.js";
import { requireScope } from "./lib/require_scope.js";
import { accessLog, logJson } from "./lib/logger.js";
import { signSession } from "./lib/session.js";
import { env, isDev } from "./lib/config.js";
import { Login } from "./views/Login.js";
import { Scopes } from "./views/Scopes.js";

// The raw query string including the leading "?", reused for redirects and for
// re-validating the authorize params (which live entirely in the query).
const queryString = (c: Context): string => new URL(c.req.url).search;

// Session cookie lifetime: 30 days, matching the refresh-token window.
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

// A pre-computed bcrypt hash of a value no user will ever submit. The login
// handler compares against this when a user (or its passwordHash) is missing, so
// an unknown email costs the same bcrypt round as a known one — closing the
// user-enumeration timing oracle.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("a-password-that-is-never-valid", 12);

export const app = new Hono<AppEnv>();

app.use(requestId());
app.use(accessLog);
app.use(bodyLimit({ maxSize: 64 * 1024 }));
app.use(currentUser(userRepository));

// One error boundary for the whole app: the package's handleVanillaError maps
// OAuthExceptions to their RFC body shape and wraps anything else into a proper
// OAuth internalServerError, so the pure OAuth routes can just throw. Hono's own
// HTTPException (e.g. the csrf() 403) carries its own Response — honor it as-is.
app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  // Without this line the only record of a 500 is the deliberately generic body
  // the client receives. Protocol errors (invalid_grant and friends) are the
  // caller's mistake rather than an incident, so they stay at debug.
  const isProtocolError = err instanceof OAuthException;
  logJson(isProtocolError ? "debug" : "error", err.message, {
    requestId: c.get("requestId"),
    method: c.req.method,
    path: new URL(c.req.url).pathname,
    stack: isProtocolError ? undefined : err.stack,
  });
  return responseToVanilla(handleVanillaError(err));
});

// Liveness: answers as long as the process can serve, and deliberately touches
// nothing else — a dependency outage must not get the container restarted.
app.get("/healthz", c => c.text("ok"));

// Readiness: the process is up, but take it out of rotation while it cannot
// reach the database.
app.get("/readyz", async c => {
  try {
    await db.execute(sql`select 1`);
    return c.text("ready");
  } catch (e) {
    logJson("error", "readiness check failed", {
      requestId: c.get("requestId"),
      error: e instanceof Error ? e.message : String(e),
    });
    return c.text("not ready", 503);
  }
});

app.get("/api/ping", c => c.text("pong"));

// Rate limits on the brute-forceable endpoints (credential stuffing on login,
// code/secret grinding on token). Per-IP, in-memory; counts only POSTs. `max` is
// env-overridable so the test suite, which hammers these from one address, can
// lift the ceiling. Mounted before the routes so Hono wraps them.
app.use("/api/login", rateLimit({ windowMs: 15 * 60_000, max: env.LOGIN_RATE_MAX }));
app.use("/api/oauth2/token", rateLimit({ windowMs: 60_000, max: env.TOKEN_RATE_MAX }));

app.post("/api/oauth2/token", async c => {
  const oauthReq = await requestFromVanilla(c.req.raw);
  return responseToVanilla(await authorizationServer.respondToAccessTokenRequest(oauthReq));
});

app.post("/api/oauth2/revoke", async c => {
  const oauthReq = await requestFromVanilla(c.req.raw);
  return responseToVanilla(await authorizationServer.revoke(oauthReq));
});

// OIDC discovery + JWKS live at the issuer root so a relying party can find them
// at `${issuer}/.well-known/...`. Both are public and unauthenticated.
app.get("/.well-known/openid-configuration", () =>
  responseToVanilla(authorizationServer.openidConfiguration()),
);

app.get("/.well-known/jwks.json", () => responseToVanilla(authorizationServer.jwks()));

// OIDC userinfo: bearer-authenticated, returns scope-filtered claims (RFC 6750
// errors on a missing/invalid token). Accepts the token via header, form, or query.
app.on(["GET", "POST"], "/api/oauth2/userinfo", async c => {
  const oauthReq = await requestFromVanilla(c.req.raw);
  return responseToVanilla(await authorizationServer.userInfo(oauthReq));
});

// A tiny seeded "contacts" resource so the access token has something to spend.
// In a real deployment this lives behind a separate resource server.
const CONTACTS = [
  { name: "Ada Lovelace", email: "ada@example.com" },
  { name: "Grace Hopper", email: "grace@example.com" },
  { name: "Alan Turing", email: "alan@example.com" },
];

app.get(
  "/api/contacts",
  requireScope("contacts.read", { verifier: accessTokenVerifier, tokens: tokenRepository }),
  c => c.json(CONTACTS),
);

app.get("/api/oauth2/authorize", async c => {
  // Validate up front so a malformed authorize request fails before we send the
  // user through login/consent. With a session, route to the consent screen
  // (carrying the original query); without one, to login. We never auto-approve.
  await authorizationServer.validateAuthorizationRequest(await requestFromVanilla(c.req.raw));
  const target = c.get("user") ? "/api/scopes" : "/api/login";
  return c.redirect(`${target}${queryString(c)}`, 302);
});

// Origin-based CSRF, scoped ONLY to the browser form routes (never the
// machine-to-machine token/revoke endpoints). No-op for GET/HEAD; checks the
// Origin header against the request host for unsafe methods.
app.use("/api/login", csrf());
app.use("/api/scopes", csrf());

app.get("/api/login", async c => {
  await authorizationServer.validateAuthorizationRequest(await requestFromVanilla(c.req.raw));
  return c.html(html`<!DOCTYPE html>${(<Login action={"/api/login" + queryString(c)} />)}`);
});

app.post(
  "/api/login",
  zValidator("form", z.object({ email: z.email(), password: z.string() })),
  async c => {
    // Validate the authorize params from the QUERY only; building a body-less
    // request avoids consuming the form body that zValidator already parsed.
    await authorizationServer.validateAuthorizationRequest(
      await requestFromVanilla(new Request(c.req.url)),
    );

    const { email, password } = c.req.valid("form");

    const row = await db.query.users.findFirst({ where: ilike(users.email, email) });

    // Always run a bcrypt comparison — against the real hash, or a dummy hash
    // when the user is missing or has no password — so the response time can't
    // distinguish "no such user" from "wrong password" (user-enumeration oracle).
    // Both failures collapse to one generic 401, never a 500/stack trace.
    try {
      await verifyPasswordOrThrow(password, row?.passwordHash ?? DUMMY_PASSWORD_HASH);
    } catch (e) {
      if (e instanceof InvalidAuthorizationError) return c.text("Unauthorized", 401);
      throw e;
    }
    if (!row) return c.text("Unauthorized", 401);

    // X-Forwarded-For is client-spoofable unless a trusted reverse proxy sets it;
    // take the first hop (inet rejects a comma-separated list). Don't trust it for
    // anything security-sensitive without a TRUST_PROXY gate in front.
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    await db
      .update(users)
      .set({ lastLoginAt: new Date(), lastLoginIP: ip })
      .where(eq(users.id, row.id));

    const token = await signSession(row.id, SESSION_TTL_SECONDS, row.tokenVersion);
    setCookie(c, "jid", token, {
      httpOnly: true,
      // Dropped only for local development: browsers refuse Secure cookies over
      // http://localhost, which would silently break the demo login.
      secure: !isDev(),
      sameSite: "Strict",
      maxAge: SESSION_TTL_SECONDS,
    });

    return c.redirect("/api/oauth2/authorize" + queryString(c), 302);
  },
);

// Logout revokes every session for the user by bumping tokenVersion: any cookie
// minted with the old version (including one already captured) stops validating
// in currentUser. Then drop the cookie client-side too.
app.post("/api/logout", async c => {
  const user = c.get("user");
  if (user) {
    await db
      .update(users)
      .set({ tokenVersion: sql`token_version + 1` })
      .where(eq(users.id, user.id));
  }
  // Mirror the path/secure attributes used at set time so the clearing cookie
  // matches the original scope and the browser actually drops it.
  deleteCookie(c, "jid", { path: "/", secure: !isDev() });
  return c.text("Logged out");
});

app.get("/api/scopes", async c => {
  const authRequest = await authorizationServer.validateAuthorizationRequest(
    await requestFromVanilla(c.req.raw),
  );
  return c.html(
    html`<!DOCTYPE html>${(
        <Scopes
          action={"/api/scopes" + queryString(c)}
          client={authRequest.client}
          scopes={authRequest.scopes}
        />
      )}`,
  );
});

app.post(
  "/api/scopes",
  zValidator("form", z.object({ accept: z.enum(["yes", "no"]) })),
  async c => {
    // Re-validate from the QUERY (the consent decision arrives in the form body).
    const authRequest = await authorizationServer.validateAuthorizationRequest(
      await requestFromVanilla(new Request(c.req.url)),
    );

    const user = c.get("user");
    if (!user) {
      return c.redirect("/api/login" + queryString(c), 302);
    }
    authRequest.user = user;
    // OIDC auth_time: when the end-user last authenticated. Falls back to now for
    // pre-existing sessions that predate a recorded login.
    authRequest.authTime = user.lastLoginAt
      ? Math.floor(user.lastLoginAt.getTime() / 1000)
      : Math.floor(Date.now() / 1000);

    if (c.req.valid("form").accept === "yes") {
      authRequest.isAuthorizationApproved = true;
      return responseToVanilla(await authorizationServer.completeAuthorizationRequest(authRequest));
    }

    // Deny: the authorization_code grant's completeAuthorizationRequest would
    // surface a generic 400 here, so emit the RFC 6749 error redirect ourselves —
    // bounce back to the (already validated) client redirect_uri with
    // error=access_denied, echoing state so the client can correlate the response.
    // redirectUri is guaranteed resolved by validateAuthorizationRequest above; fall
    // back to the client's first registered redirect_uri to avoid a non-null assertion.
    const denied = new URL(authRequest.redirectUri ?? authRequest.client.redirectUris[0]);
    denied.searchParams.set("error", "access_denied");
    if (authRequest.state) denied.searchParams.set("state", authRequest.state);
    return c.redirect(denied.toString(), 302);
  },
);
