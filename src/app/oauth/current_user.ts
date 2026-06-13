import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";

import type { User } from "./entities/user.js";
import { userRepository } from "../../container.js";
import { NotFoundError } from "./repositories/user_repository.js";
import { verifySession } from "../../lib/session.js";

// Shared shape of the Hono context variables, referenced by both the app's
// `new Hono<AppEnv>()` and this middleware so `c.get/c.set("user")` can't drift.
export type AppEnv = { Variables: { user?: User } };

export const currentUser = createMiddleware<AppEnv>(async (c, next) => {
  const jid = getCookie(c, "jid");
  if (!jid) return next();

  // verifySession checks the session-only HS256 secret AND asserts typ:"session",
  // so an OIDC id_token can never stand in for a browser session here.
  const session = await verifySession(jid);
  if (!session) return next();

  try {
    const user = await userRepository.getUserByCredentials(session.sub);
    // Revocable sessions: the cookie carries the tokenVersion it was minted with;
    // a bump (logout, password change) leaves every older cookie behind. (Finding #2.)
    if (user.tokenVersion === session.ver) c.set("user", user);
  } catch (e) {
    // A deleted/unknown user just means "not logged in"; any other error (e.g. the
    // DB being down) is real and must surface, not silently become anonymous.
    if (!(e instanceof NotFoundError)) throw e;
  }
  return next();
});
