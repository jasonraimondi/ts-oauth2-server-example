import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { app } from "../src/app.js";
import { db } from "../src/db/index.js";
import { oauthTokens } from "../src/db/schema.js";
import { approveAuthorize, mintJid, pkce, readJson } from "./helpers.js";

const CLIENT_ID = "0e2ec2df-ee53-4327-a472-9d78c278bdbb";
const REDIRECT = "http://localhost:5173/callback";
const DAY_MS = 24 * 60 * 60 * 1000;

function authorizeQuery(challenge: string, state: string): string {
  const scope = encodeURIComponent("contacts.read contacts.write");
  return (
    `response_type=code&client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT)}&scope=${scope}&state=${state}` +
    `&code_challenge=${challenge}&code_challenge_method=S256`
  );
}

async function initialTokens(
  state: string,
): Promise<{ access_token: string; refresh_token: string }> {
  const { verifier, challenge } = pkce();
  const res = await approveAuthorize(authorizeQuery(challenge, state), await mintJid());
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
  expect(tokenRes.status).toBe(200);
  return readJson(tokenRes);
}

async function refresh(refreshToken: string): Promise<Response> {
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

/** The `jti` of an issued access token is the row key in oauth_tokens. */
function jti(accessToken: string): string {
  const payload = JSON.parse(Buffer.from(accessToken.split(".")[1]!, "base64url").toString("utf8"));
  return payload.jti;
}

async function familyOf(accessToken: string): Promise<string> {
  const row = await db.query.oauthTokens.findFirst({
    where: eq(oauthTokens.accessToken, jti(accessToken)),
  });
  return row!.originatingAuthCodeId!;
}

async function backdateFamily(authCodeId: string, days: number): Promise<void> {
  await db
    .update(oauthTokens)
    .set({ createdAt: new Date(Date.now() - days * DAY_MS) })
    .where(eq(oauthTokens.originatingAuthCodeId, authCodeId));
}

async function refreshExpiryOf(accessToken: string): Promise<Date> {
  const row = await db.query.oauthTokens.findFirst({
    where: eq(oauthTokens.accessToken, jti(accessToken)),
  });
  return row!.refreshTokenExpiresAt!;
}

describe("absolute refresh-token family lifetime", () => {
  it("keeps the full rolling window for a family that just started", async () => {
    const first = await initialTokens("fresh-family");

    const rotated = await readJson(await refresh(first.refresh_token));

    const expiresAt = await refreshExpiryOf(rotated.access_token);
    const daysOut = (expiresAt.getTime() - Date.now()) / DAY_MS;
    expect(daysOut).toBeGreaterThan(29);
  });

  it("caps the rotated refresh token at 30 days from the family's first token", async () => {
    const first = await initialTokens("old-family");
    await backdateFamily(await familyOf(first.access_token), 29);

    const rotated = await readJson(await refresh(first.refresh_token));

    // The family started 29 days ago, so ~1 day of its 30-day budget remains —
    // not the full 30 the rolling window would otherwise re-stamp.
    const expiresAt = await refreshExpiryOf(rotated.access_token);
    const daysOut = (expiresAt.getTime() - Date.now()) / DAY_MS;
    expect(daysOut).toBeGreaterThan(0);
    expect(daysOut).toBeLessThan(2);
  });

  it("ends the chain once the family's absolute lifetime has run out", async () => {
    const first = await initialTokens("expired-family");
    await backdateFamily(await familyOf(first.access_token), 31);

    const rotated = await readJson(await refresh(first.refresh_token));

    // The ceiling is already behind us, so the rotated token is born expired and
    // the next refresh has nothing live to rotate.
    expect((await refreshExpiryOf(rotated.access_token)).getTime()).toBeLessThan(Date.now());
    const again = await refresh(rotated.refresh_token);
    expect(again.status).toBeGreaterThanOrEqual(400);
    expect(again.status).toBeLessThan(500);
  });
});
