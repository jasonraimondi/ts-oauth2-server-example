import { redirect, type RequestHandler } from "@sveltejs/kit";

import { config, discover, revocationEndpoint } from "$lib/server/config";
import { SESSION_COOKIE, destroySession, getSession } from "$lib/server/session";

// Log out: best-effort revoke the refresh token at the AS (so it can't be reused),
// destroy the server-side session, and clear the cookie.
export const POST: RequestHandler = async ({ fetch, cookies }) => {
  const sid = cookies.get(SESSION_COOKIE);
  if (sid) {
    const session = getSession(sid);
    if (session?.refreshToken) {
      const { doc } = await discover(fetch);
      await fetch(revocationEndpoint(doc), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: session.refreshToken,
          token_type_hint: "refresh_token",
          client_id: config.clientId,
          client_secret: config.clientSecret,
        }),
      }).catch(() => undefined);
    }
    destroySession(sid);
    cookies.delete(SESSION_COOKIE, { path: "/" });
  }
  redirect(303, "/");
};
