import { BrowserStorage, SessionStorage, type Adapter } from "@jmondi/browser-storage";
import Cookies, { type CookieAttributes } from "js-cookie";

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
const cookieStorage = new BrowserStorage<CookieAttributes>({
  prefix,
  adapter: new CookieAdapter(),
});
export const COOKIE_STORAGE = cookieStorage.defineGroup({
  accessToken: "at",
  refreshToken: "rt",
});

