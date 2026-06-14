import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { app } from "../src/app.js";
import { db } from "../src/container.js";
import { users } from "../src/db/schema.js";
import { SEEDED_USER_ID, formHeaders, mintJid, pkce } from "./helpers.js";

const CLIENT_ID = "0e2ec2df-ee53-4327-a472-9d78c278bdbb";
const REDIRECT = "http://localhost:5173/callback";

// authorize routes an authenticated session to /api/scopes and an anonymous one
// to /api/login, so the redirect target reveals whether the cookie is "logged in".
async function authorizeTarget(jid: string): Promise<string> {
  const { challenge } = pkce();
  const query =
    `response_type=code&client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT)}&scope=contacts.read&state=s` +
    `&code_challenge=${challenge}&code_challenge_method=S256`;
  const res = await app.request(`/api/oauth2/authorize?${query}`, {
    headers: { Cookie: `jid=${jid}` },
    redirect: "manual",
  });
  return res.headers.get("location") ?? "";
}

async function resetTokenVersion(): Promise<void> {
  await db.update(users).set({ tokenVersion: 0 }).where(eq(users.id, SEEDED_USER_ID));
}

describe("revocable AS session via tokenVersion", () => {
  it("rejects a session cookie after the user's tokenVersion is bumped", async () => {
    const jid = await mintJid(); // signed with the seeded user's tokenVersion (0)
    expect((await authorizeTarget(jid)).startsWith("/api/scopes")).toBe(true);

    await db
      .update(users)
      .set({ tokenVersion: sql`token_version + 1` })
      .where(eq(users.id, SEEDED_USER_ID));

    try {
      // Same cookie, but its ver no longer matches the user -> treated as anonymous.
      expect((await authorizeTarget(jid)).startsWith("/api/login")).toBe(true);
    } finally {
      await resetTokenVersion(); // users table is not truncated between tests
    }
  });

  it("logout bumps tokenVersion, killing the held cookie afterward", async () => {
    const jid = await mintJid();
    expect((await authorizeTarget(jid)).startsWith("/api/scopes")).toBe(true);

    try {
      const res = await app.request("/api/logout", {
        method: "POST",
        headers: { ...formHeaders, Cookie: `jid=${jid}` },
      });
      expect(res.status).toBe(200);

      // The cookie we still hold is now stale (ver mismatch) -> anonymous.
      expect((await authorizeTarget(jid)).startsWith("/api/login")).toBe(true);
    } finally {
      await resetTokenVersion();
    }
  });
});
