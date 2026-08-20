import type { Context } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";

import { env } from "./config.js";

/**
 * The address to attribute a request to, for rate limiting and login auditing.
 *
 * `X-Forwarded-For` is written by whoever speaks to us, so it is read only when
 * TRUST_PROXY says a reverse proxy we control rewrites it — and then the
 * RIGHTMOST hop is taken, because a proxy appends the peer it actually saw while
 * everything to its left is whatever the client chose to send. With no proxy the
 * socket address is the only answer nobody can forge.
 */
export function clientIp(c: Context): string {
  if (env.TRUST_PROXY) {
    const nearestHop = c.req.header("x-forwarded-for")?.split(",").pop()?.trim();
    if (nearestHop) return nearestHop;
  }
  return socketAddress(c) ?? "unknown";
}

// getConnInfo reads the Node request off c.env, which only the @hono/node-server
// adapter puts there; under app.request() (tests, other runtimes) there is no
// socket at all and every caller shares the one "unknown" bucket.
function socketAddress(c: Context): string | undefined {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined;
  }
}
