import type { MiddlewareHandler } from "hono";

type Bucket = { count: number; resetAt: number };

// Safe methods carry no brute-force/credential-stuffing risk, so they don't draw
// down the budget (and the GET form render shouldn't count against the POST).
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * A minimal in-memory, per-IP fixed-window rate limiter. Counts only unsafe
 * methods and returns 429 (with Retry-After) once a client exceeds `max` within
 * `windowMs`. Per-process only — fine for a single instance / this demo; a real
 * multi-instance deployment would back it with a shared store (e.g. Redis).
 */
export function rateLimit(opts: { windowMs: number; max: number }): MiddlewareHandler {
  const buckets = new Map<string, Bucket>();

  return async (c, next) => {
    if (SAFE_METHODS.has(c.req.method)) return next();

    // X-Forwarded-For is spoofable without a trusted proxy in front; acceptable
    // here since the limiter only slows abuse, it doesn't gate authorization.
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const now = Date.now();
    const bucket = buckets.get(ip);

    if (!bucket || now >= bucket.resetAt) {
      buckets.set(ip, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }

    if (bucket.count >= opts.max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      return c.json({ error: "rate_limited", error_description: "Too many requests." }, 429, {
        "retry-after": String(retryAfter),
      });
    }

    bucket.count += 1;
    return next();
  };
}
