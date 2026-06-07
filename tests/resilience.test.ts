import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { app } from "../src/app.js";
import { db } from "../src/container.js";
import { oauthClients, oauthAuthCodes, oauthTokens } from "../src/db/schema.js";
import { codeFromApprove, mintJid, pkce } from "./helpers.js";

const CLIENT_ID = "0e2ec2df-ee53-4327-a472-9d78c278bdbb";
const REDIRECT = "http://localhost:5173/callback";

function authorizeQuery(challenge: string, state: string): string {
  const scope = encodeURIComponent("contacts.read contacts.write");
  return (
    `response_type=code&client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT)}&scope=${scope}&state=${state}` +
    `&code_challenge=${challenge}&code_challenge_method=S256`
  );
}

// Mint a real auth code by driving authorize -> consent (accept=yes).
async function mintCode(challenge: string, state: string): Promise<string> {
  return codeFromApprove(authorizeQuery(challenge, state), await mintJid());
}

async function postToken(body: Record<string, string>): Promise<Response> {
  return app.request("/api/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
}

describe("resilience: OAuth error mapping (negative paths)", () => {
  it("maps a bad client secret to a 4xx OAuth error (not 500)", async () => {
    // Seeded client is PUBLIC (secret=null); insert a temporary CONFIDENTIAL
    // client to exercise the secret check, and clean it up afterward since it
    // lives in the non-truncated oauthClients table.
    const tempId = "11111111-1111-1111-1111-111111111111";
    await db.insert(oauthClients).values({
      id: tempId,
      name: "Confidential",
      secret: "shhh",
      redirectUris: [REDIRECT],
      allowedGrants: ["authorization_code"],
    });

    try {
      const res = await postToken({
        grant_type: "authorization_code",
        client_id: tempId,
        client_secret: "wrong",
        code: "anything",
        redirect_uri: REDIRECT,
        code_verifier: "x",
      });

      // The grant validates the client first (isClientValid -> false on the bad
      // secret) and throws invalid_client BEFORE any code lookup.
      expect(res.status).not.toBe(200);
      expect(res.status).not.toBe(500);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);

      const json = await res.json();
      expect(json.error).toEqual(expect.any(String));
      expect(json.error_description).toEqual(expect.any(String));
    } finally {
      // No tokens/codes reference this client, so this is a clean delete that
      // restores the seeded-state invariant.
      await db.delete(oauthClients).where(eq(oauthClients.id, tempId));
    }
  });

  it("rejects an expired authorization code with a 4xx OAuth error", async () => {
    const { verifier, challenge } = pkce();
    const code = await mintCode(challenge, "expired-code");

    // Expire the auth-code row this test created (truncation clears it next test).
    const [authCodeRow] = await db.select({ code: oauthAuthCodes.code }).from(oauthAuthCodes);
    await db
      .update(oauthAuthCodes)
      .set({ expiresAt: new Date(0) })
      .where(eq(oauthAuthCodes.code, authCodeRow.code));

    const res = await postToken({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT,
      code,
      code_verifier: verifier,
    });

    expect(res.status).not.toBe(200);
    expect(res.status).not.toBe(500);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);

    const json = await res.json();
    expect(json.error).toEqual(expect.any(String));
    expect(json.error_description).toEqual(expect.any(String));
  });

  it("rejects an expired refresh token with a 4xx OAuth error", async () => {
    const { verifier, challenge } = pkce();
    const code = await mintCode(challenge, "expired-refresh");

    const tokenRes = await postToken({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT,
      code,
      code_verifier: verifier,
    });
    const { refresh_token } = await tokenRes.json();
    expect(refresh_token).toEqual(expect.any(String));

    // The response refresh_token is an encrypted JWT, not the stored column
    // value, so expire the token row this test created (keyed by its accessToken
    // PK; truncation clears it next test) rather than matching the opaque value.
    const [tokenRow] = await db.select({ accessToken: oauthTokens.accessToken }).from(oauthTokens);
    await db
      .update(oauthTokens)
      .set({ refreshTokenExpiresAt: new Date(0) })
      .where(eq(oauthTokens.accessToken, tokenRow.accessToken));

    const res = await postToken({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      refresh_token,
    });

    expect(res.status).not.toBe(200);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});

describe("resilience: CSRF origin scoping", () => {
  it("rejects a cross-origin form POST to /api/login but accepts a same-origin one", async () => {
    const { challenge } = pkce();
    const query = authorizeQuery(challenge, "csrf");

    // Cross-origin: origin does not match the request host -> hono/csrf 403.
    const crossOrigin = await app.request(`/api/login?${query}`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "http://evil.example",
      },
      body: "email=jason@example.com&password=password123",
      redirect: "manual",
    });
    expect(crossOrigin.status).toBe(403);

    // Same-origin (matches app.request's http://localhost host): csrf passes and
    // the handler proceeds to a 302 on valid creds.
    const sameOrigin = await app.request(`/api/login?${query}`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "http://localhost",
      },
      body: "email=jason@example.com&password=password123",
      redirect: "manual",
    });
    expect(sameOrigin.status).not.toBe(403);
    expect(sameOrigin.status).toBe(302);
  });

  it("does not apply CSRF to token/revoke (no Origin header is not blocked)", async () => {
    // token: a malformed body reaches the OAuth handler (mapped 4xx), proving
    // csrf is NOT in front of this machine-to-machine endpoint.
    const tokenRes = await postToken({ client_id: CLIENT_ID }); // missing grant_type
    expect(tokenRes.status).not.toBe(403);

    // revoke: a garbage refresh-token reaches the handler too (not csrf-blocked).
    const revokeRes = await app.request("/api/oauth2/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        token: "garbage-refresh-token",
        token_type_hint: "refresh_token",
      }),
    });
    expect(revokeRes.status).not.toBe(403);
  });
});

describe("resilience: OAuthException maps through the bridge for token AND revoke", () => {
  it("maps a malformed token request to a 4xx { error, error_description } (not 500)", async () => {
    const res = await postToken({ client_id: CLIENT_ID }); // missing grant_type

    expect(res.status).not.toBe(500);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);

    const json = await res.json();
    expect(json.error).toEqual(expect.any(String));
    expect(json.error_description).toEqual(expect.any(String));
  });

  it("does not 500 on a revoke with a garbage refresh token; maps cleanly if 4xx", async () => {
    const res = await app.request("/api/oauth2/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        token: "garbage-refresh-token",
        token_type_hint: "refresh_token",
      }),
    });

    // The spec's revoke semantics allow a 200 for an unknown token; either way it
    // must not surface as an unhandled 500. If it is a 4xx, it must be mapped.
    expect(res.status).not.toBe(500);
    if (res.status >= 400 && res.status < 500) {
      const json = await res.json();
      expect(json.error).toEqual(expect.any(String));
      expect(json.error_description).toEqual(expect.any(String));
    }
  });
});
