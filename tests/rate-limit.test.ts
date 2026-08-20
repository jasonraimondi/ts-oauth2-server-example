import { Hono, type Context } from "hono";
import { describe, expect, it, vi } from "vitest";

import { rateLimit } from "../src/lib/rate_limit.js";

// The default key is the trusted client IP, which under app.request() is the same
// "unknown" for every caller; cases that need separate buckets address them here.
const testKey = (c: Context): string => c.req.header("x-test-key") ?? "anon";

type Extra = { key?: (c: Context) => string; chargeFailuresOnly?: boolean };

function appWith(max: number, extra: Extra = { key: testKey }): Hono {
  const a = new Hono();
  a.use("/x", rateLimit({ windowMs: 60_000, max, ...extra }));
  a.all("/x", c => (c.req.header("x-fail") ? c.text("nope", 400) : c.text("ok")));
  return a;
}

async function hit(
  a: Hono,
  headers: Record<string, string> = {},
  method = "POST",
): Promise<Response> {
  return a.request("/x", { method, headers });
}

describe("rateLimit middleware", () => {
  it("allows up to `max` requests then returns 429", async () => {
    const a = appWith(2);
    expect((await hit(a, { "x-test-key": "a" })).status).toBe(200);
    expect((await hit(a, { "x-test-key": "a" })).status).toBe(200);
    expect((await hit(a, { "x-test-key": "a" })).status).toBe(429);
  });

  it("tracks limits per key independently", async () => {
    const a = appWith(1);
    expect((await hit(a, { "x-test-key": "b" })).status).toBe(200);
    expect((await hit(a, { "x-test-key": "b" })).status).toBe(429);
    expect((await hit(a, { "x-test-key": "c" })).status).toBe(200);
  });

  it("does not count safe methods (GET) against the budget", async () => {
    const a = appWith(1);
    expect((await hit(a, { "x-test-key": "d" }, "GET")).status).toBe(200);
    expect((await hit(a, { "x-test-key": "d" }, "GET")).status).toBe(200);
    expect((await hit(a, { "x-test-key": "d" })).status).toBe(200);
    expect((await hit(a, { "x-test-key": "d" })).status).toBe(429);
  });

  it("resets the window after windowMs elapses", async () => {
    vi.useFakeTimers();
    try {
      const a = appWith(1);
      expect((await hit(a, { "x-test-key": "e" })).status).toBe(200);
      expect((await hit(a, { "x-test-key": "e" })).status).toBe(429);
      vi.advanceTimersByTime(60_001);
      expect((await hit(a, { "x-test-key": "e" })).status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a rotating X-Forwarded-For in one bucket while TRUST_PROXY is off", async () => {
    // Rotating the header used to mint a fresh bucket per request, which both
    // bypassed the limit entirely and leaked a Map entry on every rotation.
    const a = appWith(1, {});
    expect((await hit(a, { "x-forwarded-for": "1.1.1.1" })).status).toBe(200);
    expect((await hit(a, { "x-forwarded-for": "2.2.2.2" })).status).toBe(429);
    expect((await hit(a, { "x-forwarded-for": "3.3.3.3, 4.4.4.4" })).status).toBe(429);
  });

  it("sweeps expired buckets rather than holding them forever", async () => {
    vi.useFakeTimers();
    const deletions = vi.spyOn(Map.prototype, "delete");
    try {
      const a = appWith(1);
      await hit(a, { "x-test-key": "stale" });
      vi.advanceTimersByTime(60_001);
      deletions.mockClear();
      await hit(a, { "x-test-key": "fresh" });
      expect(deletions.mock.calls.some(([key]) => key === "stale")).toBe(true);
    } finally {
      deletions.mockRestore();
      vi.useRealTimers();
    }
  });

  it("charges only failed responses when chargeFailuresOnly is set", async () => {
    const a = appWith(1, { key: testKey, chargeFailuresOnly: true });
    expect((await hit(a, { "x-test-key": "f" })).status).toBe(200);
    expect((await hit(a, { "x-test-key": "f" })).status).toBe(200);

    expect((await hit(a, { "x-test-key": "f", "x-fail": "1" })).status).toBe(400);
    expect((await hit(a, { "x-test-key": "f" })).status).toBe(429);
  });
});
