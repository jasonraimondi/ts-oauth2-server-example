import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";

import type { User } from "./entities/user.js";
import { userRepository } from "../../container.js";
import { verifySession } from "../../lib/session.js";

export const currentUser = createMiddleware<{ Variables: { user?: User } }>(async (c, next) => {
  const jid = getCookie(c, "jid");
  if (!jid) return next();

  // verifySession checks the session-only HS256 secret AND asserts typ:"session",
  // so an OIDC id_token can never stand in for a browser session here. The demo's
  // session is non-revocable (no tokenVersion check) — it expires only by its exp.
  const userId = await verifySession(jid);
  if (!userId) return next();

  try {
    c.set("user", await userRepository.getUserByCredentials(userId));
  } catch {
    // not found → leave user unset
  }
  return next();
});
