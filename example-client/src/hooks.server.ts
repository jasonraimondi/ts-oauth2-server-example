import type { Handle } from "@sveltejs/kit";

import { SESSION_COOKIE, getSession } from "$lib/server/session";

// Resolve the BFF session once per request so every load, action, and endpoint
// reads it from `locals` instead of re-reading the cookie and the store.
export const handle: Handle = ({ event, resolve }) => {
  const sid = event.cookies.get(SESSION_COOKIE);
  if (sid) {
    const session = getSession(sid);
    if (session) {
      event.locals.sid = sid;
      event.locals.session = session;
    } else {
      // The store no longer has it (expired, or the process restarted). Clearing
      // it here stops the browser from presenting a cookie that can never work.
      event.cookies.delete(SESSION_COOKIE, { path: "/" });
    }
  }
  return resolve(event);
};
