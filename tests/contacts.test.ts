import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { app } from "../src/app.js";
import { db, jwt } from "../src/container.js";
import { oauthTokens } from "../src/db/schema.js";
import { codeFromApprove, mintJid, pkce } from "./helpers.js";

const CLIENT_ID = "0e2ec2df-ee53-4327-a472-9d78c278bdbb";
const REDIRECT = "http://localhost:5173/callback";

// Drive authorize -> consent -> token for the seeded public client and return the
// access token carrying exactly the requested scope.
async function mintAccessToken(scope: string): Promise<string> {
  const { verifier, challenge } = pkce();
  const query =
    `response_type=code&client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT)}&scope=${encodeURIComponent(scope)}&state=s` +
    `&code_challenge=${challenge}&code_challenge_method=S256`;
  const code = await codeFromApprove(query, await mintJid());
  const res = await app.request("/api/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT,
      code,
      code_verifier: verifier,
    }),
  });
  const json = await res.json();
  return json.access_token as string;
}

describe("GET /api/contacts (Bearer + contacts.read scope)", () => {
  it("returns the contacts for a valid token holding contacts.read", async () => {
    const token = await mintAccessToken("contacts.read");

    const res = await app.request("/api/contacts", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json)).toBe(true);
    expect(json.length).toBeGreaterThan(0);
    expect(json[0]).toHaveProperty("email");
  });

  it("returns 403 insufficient_scope for a valid token lacking contacts.read", async () => {
    const token = await mintAccessToken("contacts.write");

    const res = await app.request("/api/contacts", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("insufficient_scope");
  });

  it("returns 401 when no bearer token is supplied", async () => {
    const res = await app.request("/api/contacts");
    expect(res.status).toBe(401);
  });

  it("returns 401 for a malformed bearer token", async () => {
    const res = await app.request("/api/contacts", {
      headers: { Authorization: "Bearer not-a-jwt" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 for a revoked-but-unexpired access token", async () => {
    const token = await mintAccessToken("contacts.read");

    // Force-expire the stored row (the JWT's jti is the stored accessToken), the
    // same revocation model /userinfo enforces. The JWT itself is still in-window.
    const jti = (jwt.decode(token) as { jti: string }).jti;
    await db
      .update(oauthTokens)
      .set({ accessTokenExpiresAt: new Date(0) })
      .where(eq(oauthTokens.accessToken, jti));

    const res = await app.request("/api/contacts", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });
});
