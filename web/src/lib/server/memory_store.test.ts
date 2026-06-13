import { describe, expect, it, vi } from "vitest";

import { MemoryStore } from "./memory_store";

describe("MemoryStore", () => {
  it("set then get returns the value", () => {
    const store = new MemoryStore<number>();
    store.set("a", 1);
    expect(store.get("a")).toBe(1);
  });

  it("get returns undefined for an unknown key", () => {
    const store = new MemoryStore<number>();
    expect(store.get("missing")).toBeUndefined();
  });

  it("take returns the value once, then undefined (consume-once)", () => {
    const store = new MemoryStore<string>();
    store.set("k", "v");
    expect(store.take("k")).toBe("v");
    expect(store.take("k")).toBeUndefined();
    expect(store.get("k")).toBeUndefined();
  });

  it("delete removes the entry", () => {
    const store = new MemoryStore<number>();
    store.set("a", 1);
    store.delete("a");
    expect(store.get("a")).toBeUndefined();
  });

  it("expires an entry after its ttl elapses", () => {
    vi.useFakeTimers();
    try {
      const store = new MemoryStore<number>();
      store.set("a", 1, 1000);
      expect(store.get("a")).toBe(1);
      vi.advanceTimersByTime(1001);
      expect(store.get("a")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps entries with no ttl indefinitely", () => {
    vi.useFakeTimers();
    try {
      const store = new MemoryStore<number>();
      store.set("a", 1);
      vi.advanceTimersByTime(60 * 60 * 1000);
      expect(store.get("a")).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
