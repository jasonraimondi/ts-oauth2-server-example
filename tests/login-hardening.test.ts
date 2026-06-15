import { createHash, randomBytes } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { app } from "../src/app.js";
import { db } from "../src/container.js";
import { oauthClients, oauthClientScopes, users } from "../src/db/schema.js";
import { setPassword } from "../src/lib/password.js";
import { formHeaders, mintJid, pkce } from "./helpers.js";

const CLIENT_ID = "0e2ec2df-ee53-4327-a472-9d78c278bdbb";
const REDIRECT = "http://localhost:5173/callback";
const SCOPE_READ_ID = "c3d49dba-53c8-4d08-970f-9c567414732e"; // seeded contacts.read

function authorizeQuery(challenge: string, clientId = CLIENT_ID): string {
  return (
    `response_type=code&client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT)}&scope=contacts.read&state=st` +
    `&code_challenge=${challenge}&code_challenge_method=S256`
  );
}

describe("login handler hardening (ITEM E)", () => {
  // app.request uses http://localhost; mirror it so hono/csrf passes.
  function loginQuery(): string {
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    return authorizeQuery(challenge);
  }

  it("returns a generic 401 for an unknown email (no user-enumeration signal)", async () => {
    const res = await app.request(`/api/login?${loginQuery()}`, {
      method: "POST",
      headers: formHeaders,
      body: "email=nobody@example.com&password=whatever",
    });

    expect(res.status).toBe(401);
    expect(await res.text()).toBe("Unauthorized");
  });

  it("returns the same generic 401 for a user whose passwordHash is null", async () => {
    // Insert an ad-hoc SSO-style user with no password hash, then clean up (the
    // users table is not truncated between tests). Never edit src/db/seed.ts.
    const nullHashUser = {
      id: "22222222-2222-2222-2222-222222222222",
      email: "nullhash@example.com",
      name: "Null Hash",
      passwordHash: null,
      createdIP: "127.0.0.1",
    };
    await db.insert(users).values(nullHashUser).onConflictDoNothing();

    try {
      const res = await app.request(`/api/login?${loginQuery()}`, {
        method: "POST",
        headers: formHeaders,
        body: "email=nullhash@example.com&password=anything",
      });

      expect(res.status).toBe(401);
      expect(await res.text()).toBe("Unauthorized");
    } finally {
      await db.delete(users).where(eq(users.id, nullHashUser.id));
    }
  });
});

describe("confidential client positive flow (ITEM F)", () => {
  it("drives authorization_code with the correct client secret to tokens", async () => {
    // Insert a CONFIDENTIAL client (with a secret) plus a registered scope, then
    // clean up afterward — both tables are non-truncated, so this restores the
    // seeded-state invariant. (resilience.test.ts covers the wrong-secret 4xx.)
    const tempId = "33333333-3333-3333-3333-333333333333";
    const secret = "s3cr3t-value";
    await db.insert(oauthClients).values({
      id: tempId,
      name: "Confidential Client",
      // Stored as a bcrypt hash at rest; the plaintext is presented below. (ADR-0001.)
      secret: await setPassword(secret),
      redirectUris: [REDIRECT],
      allowedGrants: ["authorization_code", "refresh_token"],
    });
    await db
      .insert(oauthClientScopes)
      .values({ clientId: tempId, scopeId: SCOPE_READ_ID })
      .onConflictDoNothing();

    try {
      const { verifier, challenge } = pkce();
      const query = authorizeQuery(challenge, tempId);
      const jid = await mintJid();

      // Drive authorize -> consent -> callback with a code.
      await app.request(`/api/oauth2/authorize?${query}`, {
        headers: { Cookie: `jid=${jid}` },
        redirect: "manual",
      });
      const consentRes = await app.request(`/api/scopes?${query}`, {
        method: "POST",
        headers: { ...formHeaders, Cookie: `jid=${jid}` },
        body: "accept=yes",
        redirect: "manual",
      });
      const code = new URL(consentRes.headers.get("location")!).searchParams.get("code")!;

      // Exchange the code WITH the correct client secret -> tokens.
      const tokenRes = await app.request("/api/oauth2/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: tempId,
          client_secret: secret,
          redirect_uri: REDIRECT,
          code,
          code_verifier: verifier,
        }),
      });

      expect(tokenRes.status).toBe(200);
      const json = await tokenRes.json();
      expect(json.access_token).toEqual(expect.any(String));
      expect(json.token_type).toBe("Bearer");
      expect(json.scope).toContain("contacts.read");
    } finally {
      // Clear the dynamic tables this flow populated (CASCADE drops the scope
      // links) so the temp client has no FK referrers, then remove the client
      // and its client-scope link — restoring the seeded-state invariant.
      await db.execute(
        sql`TRUNCATE "oauth_token_scopes", "oauth_auth_code_scopes", "oauth_tokens", "oauth_auth_codes" RESTART IDENTITY CASCADE;`,
      );
      await db.delete(oauthClientScopes).where(eq(oauthClientScopes.clientId, tempId));
      await db.delete(oauthClients).where(eq(oauthClients.id, tempId));
    }
  });
});
