import { BrowserStorage, SessionStorage, type Adapter } from "@jmondi/browser-storage";
import Cookies, { type CookieAttributes } from "js-cookie";

/*
 * ============================================================================
 *  SECURITY CAVEAT — DEMO ONLY. DO NOT COPY THIS TOKEN STORAGE TO PRODUCTION.
 * ============================================================================
 *
 *  This example keeps the OAuth2 refresh token in a NON-HttpOnly cookie so the
 *  whole flow is visible from the browser and easy to inspect while learning.
 *  That is a deliberate teaching shortcut, NOT a recommendation.
 *
 *  Any cookie that JavaScript can read (and any value in localStorage /
 *  sessionStorage) is readable by injected script. A single XSS bug therefore
 *  lets an attacker exfiltrate the long-lived refresh token and silently mint
 *  fresh access tokens — i.e. full account takeover.
 *
 *  In production, a browser SPA should NOT hold the refresh token at all.
 *  Use a Backend-for-Frontend (BFF): the server completes the OAuth2 exchange,
 *  stores the refresh token server-side, and sets a Secure, HttpOnly,
 *  SameSite session cookie that script cannot read. The browser then talks to
 *  your own backend, which attaches the access token to upstream calls.
 *
 *  As a partial mitigation even here, the short-lived ACCESS token is kept in
 *  an in-memory store (below) rather than a cookie, so it is not sitting in a
 *  script-readable cookie jar. It is intentionally lost on page reload; the
 *  refresh flow re-issues it.
 * ============================================================================
 */

export class CookieAdapter implements Adapter {
  getItem(key: string): string | null {
    return Cookies.get(key) ?? null;
  }

  removeItem(key: string): void {
    Cookies.remove(key);
  }

  setItem(key: string, value: string, config: CookieAttributes = {}): void {
    Cookies.set(key, value, config);
  }
}

const prefix = "app_";

const sessionStorage = new SessionStorage({ prefix });
export const SESSION_STORAGE = sessionStorage.defineGroup({
  state: "state",
  verifier: "verifier",
});

// DEMO-ONLY: the refresh token lives in a script-readable cookie. See the
// caveat above — production must keep it server-side behind a BFF.
const cookieStorage = new BrowserStorage<CookieAttributes>({
  prefix,
  adapter: new CookieAdapter(),
});
export const COOKIE_STORAGE = cookieStorage.defineGroup({
  refreshToken: "rt",
});

// The access token is kept ONLY in memory (a module-level variable). It is not
// readable from the cookie jar / storage, and is gone on reload — which is the
// safer place for a bearer token in a browser app.
let accessTokenValue: string | null = null;
export const ACCESS_TOKEN = {
  get(): string | null {
    return accessTokenValue;
  },
  set(value: string): void {
    accessTokenValue = value;
  },
  remove(): void {
    accessTokenValue = null;
  },
};
