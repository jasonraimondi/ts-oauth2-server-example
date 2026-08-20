import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import type { MiddlewareHandler } from "hono";

import type { User } from "./entities/user.js";
import type { UserRepository } from "./repositories/user_repository.js";
import { NotFoundError } from "./repositories/user_repository.js";
import { verifySession } from "../../lib/session.js";

// Shared shape of the Hono context variables, referenced by both the app's
// `new Hono<AppEnv>()` and this middleware so `c.get/c.set("user")` can't drift.
export type AppEnv = { Variables: { user?: User; requestId: string } };

/**
 * Resolves the session cookie into `c.get("user")`, leaving the request
 * anonymous when there is no valid session.
 *
 * The repository is injected rather than imported from the container: importing
 * the container here would open a pg connection as a side effect of the import
 * graph, which makes this middleware untestable on its own.
 */
export function currentUser(userRepository: UserRepository): MiddlewareHandler<AppEnv> {
  return createMiddleware<AppEnv>(async (c, next) => {
    const jid = getCookie(c, "jid");
    if (!jid) return next();

    // verifySession checks the session-only HS256 secret AND asserts typ:"session",
    // so an OIDC id_token can never stand in for a browser session here.
    const session = await verifySession(jid);
    if (!session) return next();

    try {
      const user = await userRepository.getUserByCredentials(session.sub);
      // Revocable sessions: the cookie carries the tokenVersion it was minted with;
      // a bump (logout, password change) leaves every older cookie behind.
      if (user.tokenVersion === session.ver) c.set("user", user);
    } catch (e) {
      // A deleted/unknown user just means "not logged in"; any other error (e.g. the
      // DB being down) is real and must surface, not silently become anonymous.
      if (!(e instanceof NotFoundError)) throw e;
    }
    return next();
  });
}
