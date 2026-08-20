// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
import type { Session } from "$lib/server/session";

declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      // Resolved from the `sid` cookie by hooks.server.ts. Both are absent for
      // an anonymous visitor; the tokens inside never reach the browser.
      sid?: string;
      session?: Session;
    }
    // interface PageData {}
    // interface Platform {}
  }
}

export {};
