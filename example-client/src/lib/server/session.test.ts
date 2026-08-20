import { describe, expect, it, vi } from "vitest";

import { MemoryStore } from "./memory_store";
import {
  SESSION_TTL_MS,
  coalesceRefresh,
  createSession,
  getSession,
  setSessionStore,
  type Session,
  type SessionStore,
} from "./session";

function session(accessToken: string): Session {
  return { accessToken, accessTokenExpiresAt: 0, user: { sub: "u1" } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("coalesceRefresh", () => {
  it("runs the refresh once for concurrent calls with the same sid", async () => {
    let calls = 0;
    const d = deferred<Session>();
    const run = () => {
      calls++;
      return d.promise;
    };

    const a = coalesceRefresh("s1", run);
    const b = coalesceRefresh("s1", run);
    d.resolve(session("AT1"));

    expect(await a).toEqual(session("AT1"));
    expect(await b).toEqual(session("AT1"));
    expect(calls).toBe(1);
  });

  it("does not coalesce across different sids", async () => {
    let calls = 0;
    const run = () => {
      calls++;
      return Promise.resolve(session("AT"));
    };

    await Promise.all([coalesceRefresh("a", run), coalesceRefresh("b", run)]);

    expect(calls).toBe(2);
  });

  it("runs again once the previous refresh has settled", async () => {
    let calls = 0;
    const run = () => {
      calls++;
      return Promise.resolve(session("AT"));
    };

    await coalesceRefresh("s3", run);
    await coalesceRefresh("s3", run);

    expect(calls).toBe(2);
  });

  it("propagates a failure to all waiters and clears so a retry can run", async () => {
    let calls = 0;
    const failing = () => {
      calls++;
      return Promise.reject(new Error("boom"));
    };

    const a = coalesceRefresh("s4", failing);
    const b = coalesceRefresh("s4", failing);
    await expect(a).rejects.toThrow("boom");
    await expect(b).rejects.toThrow("boom");
    expect(calls).toBe(1);

    await expect(coalesceRefresh("s4", failing)).rejects.toThrow("boom");
    expect(calls).toBe(2);
  });
});

describe("session lifetime", () => {
  it("expires a session once SESSION_TTL_MS has elapsed", () => {
    vi.useFakeTimers();
    try {
      const sid = createSession(session("AT"));
      expect(getSession(sid)).toEqual(session("AT"));
      vi.advanceTimersByTime(SESSION_TTL_MS + 1);
      expect(getSession(sid)).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("setSessionStore", () => {
  it("routes reads and writes through the injected store", () => {
    const writes: Array<{ key: string; ttlMs?: number }> = [];
    const entries = new Map<string, Session>();
    const store: SessionStore<Session> = {
      set: (key, value, ttlMs) => {
        writes.push({ key, ttlMs });
        entries.set(key, value);
      },
      get: key => entries.get(key),
      take: key => entries.get(key),
      delete: key => void entries.delete(key),
    };

    setSessionStore(store);
    try {
      const sid = createSession(session("AT"));
      expect(getSession(sid)).toEqual(session("AT"));
      expect(writes).toEqual([{ key: sid, ttlMs: SESSION_TTL_MS }]);
    } finally {
      setSessionStore(new MemoryStore<Session>());
    }
  });
});
