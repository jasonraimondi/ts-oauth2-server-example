import type { SessionStore } from "./session";

type Entry<T> = { value: T; expiresAt: number | null };

const SWEEP_INTERVAL_MS = 60 * 1000;

/**
 * A tiny in-memory, per-process key/value store with optional TTL and consume-once
 * semantics. Backs both the BFF's pre-auth records (state/nonce/verifier, short
 * TTL, taken once on callback) and its sessions. Per-process only — fine for a
 * single-instance demo; a real deployment injects a shared store.
 */
export class MemoryStore<T> implements SessionStore<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private lastSweptAt = 0;

  get size(): number {
    return this.entries.size;
  }

  set(key: string, value: T, ttlMs?: number): void {
    this.sweep();
    this.entries.set(key, { value, expiresAt: ttlMs != null ? Date.now() + ttlMs : null });
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== null && Date.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /** Read and remove in one step — for one-time values that must not be replayed. */
  take(key: string): T | undefined {
    const value = this.get(key);
    if (value !== undefined) this.entries.delete(key);
    return value;
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  /**
   * Expiry is otherwise only noticed by a read, so a record nobody ever reads
   * again — an abandoned pre-auth record, a session whose cookie was discarded —
   * would pin its memory forever. Writes amortize the cleanup instead, rate-limited
   * so a busy process does not walk the whole map on every set, and with no timer
   * to keep the process alive.
   */
  private sweep(): void {
    const now = Date.now();
    if (now - this.lastSweptAt < SWEEP_INTERVAL_MS) return;
    this.lastSweptAt = now;
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt !== null && now >= entry.expiresAt) this.entries.delete(key);
    }
  }
}
