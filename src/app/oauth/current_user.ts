import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";

import type { User } from "./entities/user.js";
import { jwt, userRepository } from "../../container.js";

export const currentUser = createMiddleware<{ Variables: { user?: User } }>(async (c, next) => {
  const jid = getCookie(c, "jid");
  if (!jid) return next();

  let userId: string | undefined;
  try {
    userId = ((await jwt.verify(jid)) as { userId?: string })?.userId;
  } catch {
    return next();
  }
  if (!userId) return next();

  try {
    c.set("user", await userRepository.getUserByCredentials(userId));
  } catch {
    // not found → leave user unset
  }
  return next();
});
