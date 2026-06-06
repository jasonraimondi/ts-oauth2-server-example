import { Hono } from "hono";
import { logger } from "hono/logger";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import { OAuthException } from "@jmondi/oauth2-server";
import { requestFromVanilla, responseToVanilla } from "@jmondi/oauth2-server/vanilla";

import { authorizationServer } from "./container.js";
import type { User } from "./app/oauth/entities/user.js";

export type Variables = { user?: User };

export const app = new Hono<{ Variables: Variables }>();

app.use(logger());

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
