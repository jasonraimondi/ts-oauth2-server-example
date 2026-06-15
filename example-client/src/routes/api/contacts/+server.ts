import { json, type RequestHandler } from "@sveltejs/kit";

import { config, contactsEndpoint, discover } from "$lib/server/config";
import { refreshTokens } from "$lib/server/oauth";
import {
  SESSION_COOKIE,
  coalesceRefresh,
  destroySession,
  getSession,
  updateSession,
  type Session,
} from "$lib/server/session";

// Proxy the protected contacts resource: attach the session's access token
// server-side (the browser never sees it), transparently refreshing it first if
// it's expired. The Bearer token is spent here, in the BFF.
export const GET: RequestHandler = async ({ fetch, cookies }) => {
  const sid = cookies.get(SESSION_COOKIE);
  const session = sid ? getSession(sid) : undefined;
  if (!sid || !session) return json({ error: "unauthenticated" }, { status: 401 });

  let accessToken = session.accessToken;
  if (Date.now() >= session.accessTokenExpiresAt - 5_000 && session.refreshToken) {
    const refreshToken = session.refreshToken; // narrowed here; captured for the closure
    try {
      // Single-flight per sid: concurrent requests share one refresh instead of
      // each replaying the same refresh token into the AS's reuse detection, which
      // would revoke the whole token family and log the user out.
      const refreshed = await coalesceRefresh(sid, async () => {
        const { doc } = await discover(fetch);
        const next = await refreshTokens({
          fetch,
          tokenEndpoint: doc.token_endpoint,
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          refreshToken,
        });
        const updated: Session = {
          ...session,
          accessToken: next.access_token,
          refreshToken: next.refresh_token ?? refreshToken,
          accessTokenExpiresAt: Date.now() + (next.expires_in ?? 3600) * 1000,
        };
        updateSession(sid, updated);
        return updated;
      });
      accessToken = refreshed.accessToken;
    } catch {
      // Refresh token spent/revoked (or the AS is unreachable): tear down the dead
      // session and 401 so the browser re-logs-in, rather than wedging every future
      // request behind a 500 with a stale session left in place.
      destroySession(sid);
      cookies.delete(SESSION_COOKIE, { path: "/" });
      return json({ error: "session_expired" }, { status: 401 });
    }
  }

  const res = await fetch(contactsEndpoint(), {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return json({ error: "upstream_error", status: res.status }, { status: res.status });
  return json(await res.json());
};
