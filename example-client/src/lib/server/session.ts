import { MemoryStore } from "./memory_store";
import { randomToken } from "./oauth";

// One-time record stashed before redirecting to the AS, keyed by `state` (which
// the AS echoes back). Consumed once on callback — its presence IS the CSRF check.
export type PendingAuth = {
  nonce: string;
  codeVerifier: string;
  returnTo: string;
};

// The logged-in session: tokens live here, server-side. The browser only ever
// holds the opaque `sid` cookie that maps to this record.
export type Session = {
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt: number; // epoch ms
  user: { sub: string; email?: string };
};

/**
 * The seam a real deployment swaps. Sessions hold refresh tokens and must outlive
 * a single process and be visible to every replica, so anything beyond this demo
 * hands `setSessionStore` a Redis-backed (or similar) implementation.
 */
export interface SessionStore<T> {
  set(key: string, value: T, ttlMs?: number): void;
  get(key: string): T | undefined;
  take(key: string): T | undefined;
  delete(key: string): void;
}

export const SESSION_COOKIE = "sid";

// The single lifetime of a logged-in session: the store entry and the `sid`
// cookie's Max-Age both come from here, so the browser and the server can never
// disagree about when a session is over.
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const PENDING_TTL_MS = 10 * 60 * 1000;

const pending: SessionStore<PendingAuth> = new MemoryStore<PendingAuth>();
let sessions: SessionStore<Session> = new MemoryStore<Session>();

export function setSessionStore(store: SessionStore<Session>): void {
  sessions = store;
}

export function putPending(state: string, value: PendingAuth): void {
  pending.set(state, value, PENDING_TTL_MS);
}

export function takePending(state: string): PendingAuth | undefined {
  return pending.take(state);
}

export function createSession(value: Session): string {
  const sid = randomToken(32);
  sessions.set(sid, value, SESSION_TTL_MS);
  return sid;
}

export function getSession(sid: string): Session | undefined {
  return sessions.get(sid);
}

export function updateSession(sid: string, value: Session): void {
  sessions.set(sid, value, SESSION_TTL_MS);
}

export function destroySession(sid: string): void {
  sessions.delete(sid);
}

const refreshInFlight = new Map<string, Promise<Session>>();

/**
 * Single-flight the token refresh for one session: concurrent requests (a
 * double-clicked action, or /api/me + /api/contacts firing together) share one
 * in-flight refresh instead of each replaying the same refresh token. Without
 * this, the second request presents an already-rotated token, which the AS's
 * reuse detection (RFC 9700) treats as theft and revokes the whole family —
 * logging the user out for a benign double request. The entry clears once the
 * refresh settles, so a later refresh (or a retry after failure) runs again.
 */
export function coalesceRefresh(sid: string, run: () => Promise<Session>): Promise<Session> {
  const existing = refreshInFlight.get(sid);
  if (existing) return existing;
  const promise = run().finally(() => refreshInFlight.delete(sid));
  refreshInFlight.set(sid, promise);
  return promise;
}
