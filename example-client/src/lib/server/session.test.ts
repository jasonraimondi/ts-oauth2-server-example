import { describe, expect, it } from "vitest";

import { coalesceRefresh, type Session } from "./session";

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
