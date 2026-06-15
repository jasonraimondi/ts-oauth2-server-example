import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import { rateLimit } from "../src/lib/rate_limit.js";

function appWith(max: number): Hono {
  const a = new Hono();
  a.use("/x", rateLimit({ windowMs: 60_000, max }));
  a.all("/x", c => c.text("ok"));
  return a;
}

function hit(a: Hono, ip: string, method = "POST"): Promise<Response> {
  return a.request("/x", { method, headers: { "x-forwarded-for": ip } });
}

describe("rateLimit middleware", () => {
  it("allows up to `max` requests then returns 429", async () => {
    const a = appWith(2);
    expect((await hit(a, "1.1.1.1")).status).toBe(200);
    expect((await hit(a, "1.1.1.1")).status).toBe(200);
    expect((await hit(a, "1.1.1.1")).status).toBe(429);
  });

  it("tracks limits per client IP independently", async () => {
    const a = appWith(1);
    expect((await hit(a, "2.2.2.2")).status).toBe(200);
    expect((await hit(a, "2.2.2.2")).status).toBe(429);
    // A different IP has its own bucket.
    expect((await hit(a, "3.3.3.3")).status).toBe(200);
  });

  it("does not count safe methods (GET) against the budget", async () => {
    const a = appWith(1);
    expect((await hit(a, "4.4.4.4", "GET")).status).toBe(200);
    expect((await hit(a, "4.4.4.4", "GET")).status).toBe(200);
    expect((await hit(a, "4.4.4.4", "POST")).status).toBe(200);
    expect((await hit(a, "4.4.4.4", "POST")).status).toBe(429);
  });

  it("resets the window after windowMs elapses", async () => {
    vi.useFakeTimers();
    try {
      const a = appWith(1);
      expect((await hit(a, "5.5.5.5")).status).toBe(200);
      expect((await hit(a, "5.5.5.5")).status).toBe(429);
      vi.advanceTimersByTime(60_001);
      expect((await hit(a, "5.5.5.5")).status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });
});
