import type { Context, MiddlewareHandler } from "hono";
import {
  OAuthException,
  type AccessTokenPayload,
  type AccessTokenVerifier,
  type OAuthToken,
} from "@jmondi/oauth2-server";

/** The slice of the token repository the guard needs to honor revocation. */
export type AccessTokenRevocations = {
  getByAccessToken(accessToken: string): Promise<OAuthToken>;
  isAccessTokenRevoked(accessToken: OAuthToken): Promise<boolean>;
};

// RFC 6750 invalid_token (401) without echoing the token value.
const invalidToken = (c: Context, description: string) =>
  c.json({ error: "invalid_token", error_description: description }, 401, {
    "www-authenticate": `Bearer error="invalid_token", error_description="${description}"`,
  });

/**
 * Guards a resource route with a Bearer access token carrying `scope`, answering
 * 401 (RFC 6750 invalid_token) or 403 (insufficient_scope) otherwise.
 *
 * The verifier pins typ:at+jwt, alg:RS256 and the issuer exactly as the library's
 * /userinfo does; the stored row is re-checked on top because revocation is
 * force-expiry, so a revoked token's JWT is still inside its own exp window.
 *
 * Dependencies are injected rather than imported so a resource server can mount
 * this against its own verifier without pulling in this app's container.
 */
export function requireScope(
  scope: string,
  deps: { verifier: AccessTokenVerifier; tokens: AccessTokenRevocations },
): MiddlewareHandler {
  return async (c, next) => {
    const authHeader = c.req.header("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return invalidToken(c, "A bearer access token is required.");
    }

    let payload: AccessTokenPayload;
    try {
      payload = await deps.verifier.verify(authHeader);
      // The jti names the stored token row. It is optional on the claim type, and
      // handing `undefined` to the lookup would surface a driver error as a 500.
      if (typeof payload.jti !== "string") {
        return invalidToken(c, "The access token is invalid or expired.");
      }
      const stored = await deps.tokens.getByAccessToken(payload.jti);
      if (await deps.tokens.isAccessTokenRevoked(stored)) {
        return invalidToken(c, "The access token has been revoked.");
      }
    } catch (e) {
      if (e instanceof OAuthException) {
        return invalidToken(c, "The access token is invalid or expired.");
      }
      throw e;
    }

    const scopes = (typeof payload.scope === "string" ? payload.scope : "").split(" ");
    if (!scopes.includes(scope)) {
      return c.json(
        { error: "insufficient_scope", error_description: `The ${scope} scope is required.` },
        403,
        { "www-authenticate": `Bearer error="insufficient_scope", scope="${scope}"` },
      );
    }

    return next();
  };
}
