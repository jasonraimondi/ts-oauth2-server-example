import { Hono, type Context } from "hono";
import { logger } from "hono/logger";
import { csrf } from "hono/csrf";
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
import { OAuthException, type AccessTokenPayload } from "@jmondi/oauth2-server";

import { authorizationServer, db, accessTokenVerifier, tokenRepository } from "./container.js";
import { users } from "./db/schema.js";
import { verifyPasswordOrThrow, InvalidAuthorizationError } from "./lib/password.js";
import { currentUser, type AppEnv } from "./app/oauth/current_user.js";
import { rateLimit } from "./lib/rate_limit.js";
import { signSession } from "./lib/session.js";
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

app.use(logger());
app.use(currentUser);

// One error boundary for the whole app: the package's handleVanillaError maps
// OAuthExceptions to their RFC body shape and wraps anything else into a proper
// OAuth internalServerError, so the pure OAuth routes can just throw. Hono's own
// HTTPException (e.g. the csrf() 403) carries its own Response — honor it as-is.
app.onError(err => {
  if (err instanceof HTTPException) return err.getResponse();
  return responseToVanilla(handleVanillaError(err));
});

app.get("/api/ping", c => c.text("pong"));

// Rate limits on the brute-forceable endpoints (credential stuffing on login,
// code/secret grinding on token). Per-IP, in-memory; counts only POSTs. `max` is
// env-overridable so the test suite, which hammers these from one address, can
// lift the ceiling. Mounted before the routes so Hono wraps them.
app.use(
  "/api/login",
  rateLimit({ windowMs: 15 * 60_000, max: Number(process.env.LOGIN_RATE_MAX ?? 10) }),
);
app.use(
  "/api/oauth2/token",
  rateLimit({ windowMs: 60_000, max: Number(process.env.TOKEN_RATE_MAX ?? 60) }),
);

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

// RFC 6750 invalid_token (401) without echoing the token value.
const bearerUnauthorized = (c: Context, description: string) =>
  c.json({ error: "invalid_token", error_description: description }, 401, {
    "www-authenticate": `Bearer error="invalid_token", error_description="${description}"`,
  });

// Scoped resource: requires a valid, non-revoked Bearer access token carrying the
// contacts.read scope. Mirrors the /userinfo validation (AccessTokenVerifier pins
// typ:at+jwt, alg:RS256, iss; revocation guard via the token row) and adds the
// scope check the BFF will exercise.
app.get("/api/contacts", async c => {
  const authHeader = c.req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return bearerUnauthorized(c, "A bearer access token is required.");
  }

  let payload: AccessTokenPayload;
  try {
    payload = await accessTokenVerifier.verify(authHeader);
    // The JWT jti is the stored access-token row; a revoked (force-expired) row
    // must be rejected even while the JWT itself is still within its exp window.
    const stored = await tokenRepository.getByAccessToken(payload.jti as string);
    if (await tokenRepository.isAccessTokenRevoked(stored)) {
      return bearerUnauthorized(c, "The access token has been revoked.");
    }
  } catch (e) {
    if (e instanceof OAuthException) {
      return bearerUnauthorized(c, "The access token is invalid or expired.");
    }
    throw e;
  }

  const scopes = (typeof payload.scope === "string" ? payload.scope : "").split(" ");
  if (!scopes.includes("contacts.read")) {
    return c.json(
      { error: "insufficient_scope", error_description: "The contacts.read scope is required." },
      403,
      { "www-authenticate": `Bearer error="insufficient_scope", scope="contacts.read"` },
    );
  }

  return c.json(CONTACTS);
});

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
      // Secure only in production: browsers drop Secure cookies over
      // http://localhost, which would silently break the demo login.
      secure: process.env.NODE_ENV === "production",
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
  deleteCookie(c, "jid", { path: "/", secure: process.env.NODE_ENV === "production" });
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
