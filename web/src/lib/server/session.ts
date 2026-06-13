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

export const SESSION_COOKIE = "sid";
const PENDING_TTL_MS = 10 * 60 * 1000;

const pending = new MemoryStore<PendingAuth>();
const sessions = new MemoryStore<Session>();

export function putPending(state: string, value: PendingAuth): void {
  pending.set(state, value, PENDING_TTL_MS);
}

export function takePending(state: string): PendingAuth | undefined {
  return pending.take(state);
}

export function createSession(value: Session): string {
  const sid = randomToken(32);
  sessions.set(sid, value);
  return sid;
}

export function getSession(sid: string): Session | undefined {
  return sessions.get(sid);
}

export function updateSession(sid: string, value: Session): void {
  sessions.set(sid, value);
}

export function destroySession(sid: string): void {
  sessions.delete(sid);
}
