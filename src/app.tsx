import { Hono } from "hono";
import { logger } from "hono/logger";
import { csrf } from "hono/csrf";
import { setCookie } from "hono/cookie";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, ilike } from "drizzle-orm";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import { OAuthException } from "@jmondi/oauth2-server";
import { requestFromVanilla, responseToVanilla } from "@jmondi/oauth2-server/vanilla";
import { DateDuration } from "@jmondi/date-duration";

import { authorizationServer, jwt, db } from "./container.js";
import { users } from "./db/schema.js";
import { verifyPasswordOrThrow } from "./lib/password.js";
import { currentUser } from "./app/oauth/current_user.js";
import { Login } from "./views/Login.js";
import { Scopes } from "./views/Scopes.js";
import type { User } from "./app/oauth/entities/user.js";

export type Variables = { user?: User };

export const app = new Hono<{ Variables: Variables }>();

app.use(logger());
app.use(currentUser);

app.get("/api/ping", (c) => c.text("pong"));

/**
 * The vanilla adapter ships no `handleVanillaError`, so mirror the old Express
 * `handleExpressError` body shape for OAuthExceptions; re-throw everything else
 * so it surfaces as a 500.
 */
function oauthErrorResponse(c: Context, e: unknown): Response {
  if (e instanceof OAuthException) {
    return c.json(
      {
        status: e.status,
        message: e.message,
        error: e.errorType,
        error_description: e.errorDescription ?? e.error,
      },
      e.status as ContentfulStatusCode,
    );
  }
  throw e;
}

app.post("/api/oauth2/token", async (c) => {
  try {
    const oauthReq = await requestFromVanilla(c.req.raw);
    return responseToVanilla(await authorizationServer.respondToAccessTokenRequest(oauthReq));
  } catch (e) {
    return oauthErrorResponse(c, e);
  }
});

app.post("/api/oauth2/revoke", async (c) => {
  try {
    const oauthReq = await requestFromVanilla(c.req.raw);
    return responseToVanilla(await authorizationServer.revoke(oauthReq));
  } catch (e) {
    return oauthErrorResponse(c, e);
  }
});

app.get("/api/oauth2/authorize", async (c) => {
  try {
    const authRequest = await authorizationServer.validateAuthorizationRequest(
      await requestFromVanilla(c.req.raw),
    );
    const user = c.get("user");
    if (!user) {
      const params = new URL(c.req.url).search; // includes leading "?"
      return c.redirect(`/api/login${params}`, 302);
    }
    authRequest.user = user;
    authRequest.isAuthorizationApproved = true; // @todo don't hardcode this value
    return responseToVanilla(await authorizationServer.completeAuthorizationRequest(authRequest));
  } catch (e) {
    return oauthErrorResponse(c, e);
  }
});

// Origin-based CSRF, scoped ONLY to the browser form routes (never the
// machine-to-machine token/revoke endpoints). No-op for GET/HEAD; checks the
// Origin header against the request host for unsafe methods.
app.use("/api/login", csrf());
app.use("/api/scopes", csrf());

app.get("/api/login", async (c) => {
  try {
    await authorizationServer.validateAuthorizationRequest(await requestFromVanilla(c.req.raw));
    return c.html(<Login action={"/api/login" + new URL(c.req.url).search} />);
  } catch (e) {
    return oauthErrorResponse(c, e);
  }
});

app.post(
  "/api/login",
  zValidator("form", z.object({ email: z.email(), password: z.string() })),
  async (c) => {
    try {
      // Validate the authorize params from the QUERY only; building a body-less
      // request avoids consuming the form body that zValidator already parsed.
      await authorizationServer.validateAuthorizationRequest(
        await requestFromVanilla(new Request(c.req.url)),
      );
    } catch (e) {
      return oauthErrorResponse(c, e);
    }

    const { email, password } = c.req.valid("form");

    let row: typeof users.$inferSelect | undefined;
    try {
      row = await db.query.users.findFirst({ where: ilike(users.email, email) });
      if (!row) return c.text("Unauthorized", 401);
      await verifyPasswordOrThrow(password, row.passwordHash!);
    } catch {
      return c.text("Unauthorized", 401);
    }

    const ip = c.req.header("x-forwarded-for") ?? "127.0.0.1";
    await db
      .update(users)
      .set({ lastLoginAt: new Date(), lastLoginIP: ip })
      .where(eq(users.id, row.id));

    const expires = new DateDuration("30d");
    const token = await jwt.sign({
      userId: row.id,
      email: row.email,
      iat: Math.floor(Date.now() / 1000),
      exp: expires.endTimeSeconds,
    });
    setCookie(c, "jid", token, {
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
      expires: expires.endDate,
    });

    return c.redirect("/api/oauth2/authorize" + new URL(c.req.url).search, 302);
  },
);

app.get("/api/scopes", async (c) => {
  try {
    const authRequest = await authorizationServer.validateAuthorizationRequest(
      await requestFromVanilla(c.req.raw),
    );
    return c.html(
      <Scopes
        action={"/api/scopes" + new URL(c.req.url).search}
        client={authRequest.client}
        scopes={authRequest.scopes}
      />,
    );
  } catch (e) {
    return oauthErrorResponse(c, e);
  }
});

app.post("/api/scopes", (c) => {
  return c.redirect("/api/oauth2/authorize" + new URL(c.req.url).search, 302);
});
