import { json, type RequestHandler } from "@sveltejs/kit";

import { config, contactsEndpoint, discover } from "$lib/server/config";
import { refreshTokens } from "$lib/server/oauth";
import { SESSION_COOKIE, getSession, updateSession } from "$lib/server/session";

// Proxy the protected contacts resource: attach the session's access token
// server-side (the browser never sees it), transparently refreshing it first if
// it's expired. The Bearer token is spent here, in the BFF.
export const GET: RequestHandler = async ({ fetch, cookies }) => {
  const sid = cookies.get(SESSION_COOKIE);
  const session = sid ? getSession(sid) : undefined;
  if (!sid || !session) return json({ error: "unauthenticated" }, { status: 401 });

  let accessToken = session.accessToken;
  if (Date.now() >= session.accessTokenExpiresAt - 5_000 && session.refreshToken) {
    const { doc } = await discover(fetch);
    const refreshed = await refreshTokens({
      fetch,
      tokenEndpoint: doc.token_endpoint,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      refreshToken: session.refreshToken,
    });
    accessToken = refreshed.access_token;
    updateSession(sid, {
      ...session,
      accessToken,
      refreshToken: refreshed.refresh_token ?? session.refreshToken,
      accessTokenExpiresAt: Date.now() + (refreshed.expires_in ?? 3600) * 1000,
    });
  }

  const res = await fetch(contactsEndpoint(), {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return json({ error: "upstream_error", status: res.status }, { status: res.status });
  return json(await res.json());
};
