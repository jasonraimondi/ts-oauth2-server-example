import { json, type RequestHandler } from "@sveltejs/kit";

import { SESSION_COOKIE, getSession } from "$lib/server/session";

// Identity for the browser, taken from the validated id_token claims held in the
// session. Never returns tokens. Anonymous is a normal 200, not an error.
export const GET: RequestHandler = ({ cookies }) => {
  const sid = cookies.get(SESSION_COOKIE);
  const session = sid ? getSession(sid) : undefined;
  if (!session) return json({ authenticated: false });
  return json({ authenticated: true, user: session.user });
};
