import { type Adapter, BrowserStorage, LocalStorage, SessionStorage } from "@jmondi/browser-storage";
import Cookies from "js-cookie";

export class CookieAdapter implements Adapter {
  clear(): void {
    throw new Error("CookieStorage.clear is not implemented")
  }

  getItem(key: string): string | null {
    return Cookies.get(key) ?? null;
  }

  removeItem(key: string): void {
    Cookies.remove(key);
  }

  setItem(key: string, value: string): void {
    Cookies.set(key, value, { expires: 7 });
  }
}

const prefix = "app_"

export const sessionStorageService = new SessionStorage({ prefix });
export const localStorageService = new LocalStorage({ prefix });
export const cookieStorageService = new BrowserStorage({ prefix, adapter: new CookieAdapter() });
