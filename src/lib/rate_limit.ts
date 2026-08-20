import type { Context, MiddlewareHandler } from "hono";

import { clientIp } from "./client_ip.js";

type Bucket = { count: number; resetAt: number };

// Safe methods carry no brute-force/credential-stuffing risk, so they don't draw
// down the budget (and the GET form render shouldn't count against the POST).
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export type RateLimitOptions = {
  windowMs: number;
  max: number;
  /** Bucket identity; defaults to the trusted client IP. */
  key?: (c: Context) => string;
  /**
   * Charge the bucket only for responses with a status >= 400. A confidential
   * client funnels its whole user base through one egress IP, so counting the
   * successful grants too would lock all of those users out at once.
   */
  chargeFailuresOnly?: boolean;
};

/**
 * A minimal in-memory fixed-window rate limiter. Counts only unsafe methods and
 * returns 429 (with Retry-After) once a key exceeds `max` within `windowMs`.
 * Per-process only — fine for a single instance / this demo; a real
 * multi-instance deployment would back it with a shared store (e.g. Redis).
 */
export function rateLimit(opts: RateLimitOptions): MiddlewareHandler {
  const buckets = new Map<string, Bucket>();
  const keyOf = opts.key ?? clientIp;

  // Expired buckets are swept on every write rather than by a timer, so the map
  // stays bounded by the number of keys seen inside one window.
  const charge = (key: string, now: number): void => {
    for (const [seen, bucket] of buckets) {
      if (now >= bucket.resetAt) buckets.delete(seen);
    }
    const bucket = buckets.get(key);
    if (bucket) bucket.count += 1;
    else buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
  };

  return async (c, next) => {
    if (SAFE_METHODS.has(c.req.method)) return next();

    const key = keyOf(c);
    const now = Date.now();
    const bucket = buckets.get(key);
    const openBucket = bucket && now < bucket.resetAt ? bucket : undefined;

    if (openBucket && openBucket.count >= opts.max) {
      const retryAfter = Math.ceil((openBucket.resetAt - now) / 1000);
      return c.json({ error: "rate_limited", error_description: "Too many requests." }, 429, {
        "retry-after": String(retryAfter),
      });
    }

    if (!opts.chargeFailuresOnly) {
      charge(key, now);
      return next();
    }

    await next();
    if (c.res.status >= 400) charge(key, Date.now());
  };
}
