type Entry<T> = { value: T; expiresAt: number | null };

/**
 * A tiny in-memory, per-process key/value store with optional TTL and consume-once
 * semantics. Backs both the BFF's pre-auth records (state/nonce/verifier, short
 * TTL, taken once on callback) and its sessions (token sets, no TTL). Per-process
 * only — fine for a single-instance demo; a real deployment uses a shared store.
 */
export class MemoryStore<T> {
  private readonly entries = new Map<string, Entry<T>>();

  set(key: string, value: T, ttlMs?: number): void {
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
}
