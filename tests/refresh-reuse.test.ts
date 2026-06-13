import { describe, expect, it } from "vitest";

import { app } from "../src/app.js";
import { approveAuthorize, mintJid, pkce } from "./helpers.js";

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

// Drive authorize -> consent -> token to get an initial access/refresh pair.
async function initialTokens(): Promise<{ refresh_token: string }> {
  const { verifier, challenge } = pkce();
  const res = await approveAuthorize(authorizeQuery(challenge, "fam"), await mintJid());
  const code = new URL(res.headers.get("location")!).searchParams.get("code")!;
  const tokenRes = await app.request("/api/oauth2/token", {
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
  return tokenRes.json();
}

function refresh(refreshToken: string): Promise<Response> {
  return app.request("/api/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
    }),
  });
}

describe("refresh-token reuse detection revokes the family (finding #3)", () => {
  it("kills the active refresh token when a rotated one is reused", async () => {
    const first = await initialTokens(); // RT1

    const rotated = await (await refresh(first.refresh_token)).json(); // RT1 -> RT2, RT1 revoked
    expect(rotated.refresh_token).toEqual(expect.any(String));
    expect(rotated.refresh_token).not.toBe(first.refresh_token);

    // Reuse the already-rotated RT1: rejected, and a theft signal that must revoke
    // the whole family (all tokens from this authorization code).
    const reuse = await refresh(first.refresh_token);
    expect(reuse.status).toBeGreaterThanOrEqual(400);
    expect(reuse.status).toBeLessThan(500);

    // The consequence: the still-"current" RT2 is now dead too (family revoked).
    const afterReuse = await refresh(rotated.refresh_token);
    expect(afterReuse.status).toBeGreaterThanOrEqual(400);
    expect(afterReuse.status).toBeLessThan(500);
  });

  it("allows normal rotation (no reuse) to keep chaining", async () => {
    const first = await initialTokens();
    const rotated = await (await refresh(first.refresh_token)).json();

    // No reuse occurred, so RT2 rotates to RT3 normally.
    const again = await refresh(rotated.refresh_token);
    expect(again.status).toBe(200);
    const json = await again.json();
    expect(json.refresh_token).toEqual(expect.any(String));
    expect(json.refresh_token).not.toBe(rotated.refresh_token);
  });
});

// Same revokeDescendantsOf mechanism, reached via the library's built-in
// auth-code-replay guard rather than the refresh path.
describe("auth-code replay revokes the issued token family (RFC 9700)", () => {
  it("revokes the already-issued access token when its code is replayed", async () => {
    const { verifier, challenge } = pkce();
    const res = await approveAuthorize(authorizeQuery(challenge, "replay-fam"), await mintJid());
    const code = new URL(res.headers.get("location")!).searchParams.get("code")!;

    const exchange = (): Promise<Response> =>
      app.request("/api/oauth2/token", {
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

    const first = await exchange();
    expect(first.status).toBe(200);
    const { access_token } = await first.json();

    // The token works before any replay.
    const before = await app.request("/api/contacts", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    expect(before.status).toBe(200);

    // Replaying the (now revoked) code is rejected AND revokes its descendant tokens.
    expect((await exchange()).status).toBeGreaterThanOrEqual(400);

    // The originally-issued access token is now revoked.
    const after = await app.request("/api/contacts", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    expect(after.status).toBe(401);
  });
});
