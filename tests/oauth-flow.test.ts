import { describe, expect, it } from "vitest";

import { app } from "../src/app.js";
import { approveAuthorize, formHeaders, jidFromSetCookie, mintJid, pkce } from "./helpers.js";

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

async function exchangeCode(code: string, verifier: string): Promise<Response> {
  return app.request("/api/oauth2/token", {
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
}

describe("full authorization_code + PKCE flow over HTTP", () => {
  it("round-trips both scopes from authorize through the token exchange", async () => {
    const { verifier, challenge } = pkce();
    const query = authorizeQuery(challenge, "abc123");
    const jid = await mintJid();

    // Drive authorize -> consent (accept=yes) -> callback with a code.
    const authorizeRes = await approveAuthorize(query, jid);

    expect(authorizeRes.status).toBe(302);
    const location = authorizeRes.headers.get("location")!;
    expect(location.startsWith(`${REDIRECT}?`)).toBe(true);
    const callbackParams = new URL(location).searchParams;
    expect(callbackParams.get("state")).toBe("abc123");
    const code = callbackParams.get("code")!;
    expect(code).toEqual(expect.any(String));

    const tokenRes = await exchangeCode(code, verifier);

    expect(tokenRes.status).toBe(200);
    const json = await tokenRes.json();
    expect(json.access_token).toEqual(expect.any(String));
    expect(json.refresh_token).toEqual(expect.any(String));
    expect(json.token_type).toBe("Bearer");
    // The scope-persistence fix: both scopes survive the auth-code -> token hop.
    expect(json.scope).toContain("contacts.read");
    expect(json.scope).toContain("contacts.write");

    // The access token is a JWT; its payload carries the same granted scopes.
    const payload = JSON.parse(
      Buffer.from(json.access_token.split(".")[1], "base64url").toString("utf8"),
    );
    expect(payload.scope).toContain("contacts.read");
    expect(payload.scope).toContain("contacts.write");
  });

  it("drives UC-2..UC-5 through the login POST with no pre-minted cookie", async () => {
    const { verifier, challenge } = pkce();
    const query = authorizeQuery(challenge, "loginflow");

    // Unauthenticated authorize -> redirect to login, query preserved.
    const noSession = await app.request(`/api/oauth2/authorize?${query}`, { redirect: "manual" });
    expect(noSession.status).toBe(302);
    expect(noSession.headers.get("location")).toBe(`/api/login?${query}`);

    // Login POST authenticates and redirects back to authorize with a jid.
    const loginRes = await app.request(`/api/login?${query}`, {
      method: "POST",
      headers: formHeaders,
      body: "email=jason@example.com&password=password123",
      redirect: "manual",
    });
    expect(loginRes.status).toBe(302);
    expect(loginRes.headers.get("location")).toBe(`/api/oauth2/authorize?${query}`);
    const jid = jidFromSetCookie(loginRes.headers.get("set-cookie")!);

    // Authorize with the captured cookie -> consent -> callback with a code.
    const authorizeRes = await approveAuthorize(query, jid);
    expect(authorizeRes.status).toBe(302);
    const location = authorizeRes.headers.get("location")!;
    expect(location.startsWith(`${REDIRECT}?`)).toBe(true);
    const callbackParams = new URL(location).searchParams;
    expect(callbackParams.get("state")).toBe("loginflow");
    const code = callbackParams.get("code")!;

    // Exchange the code -> tokens with both scopes intact.
    const tokenRes = await exchangeCode(code, verifier);
    expect(tokenRes.status).toBe(200);
    const json = await tokenRes.json();
    expect(json.access_token).toEqual(expect.any(String));
    expect(json.refresh_token).toEqual(expect.any(String));
    expect(json.scope).toContain("contacts.read");
    expect(json.scope).toContain("contacts.write");
  });
});

describe("refresh_token rotation + scope narrowing", () => {
  it("rotates the refresh token and narrows scope to the requested subset", async () => {
    const { verifier, challenge } = pkce();
    const query = authorizeQuery(challenge, "refresh");
    const jid = await mintJid();

    const authorizeRes = await approveAuthorize(query, jid);
    const code = new URL(authorizeRes.headers.get("location")!).searchParams.get("code")!;

    const firstExchange = await exchangeCode(code, verifier);
    const first = await firstExchange.json();
    const originalRefreshToken: string = first.refresh_token;
    expect(first.scope).toContain("contacts.read");
    expect(first.scope).toContain("contacts.write");

    const refreshRes = await app.request("/api/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: CLIENT_ID,
        refresh_token: originalRefreshToken,
        scope: "contacts.read", // narrow to a subset
      }),
    });

    expect(refreshRes.status).toBe(200);
    const refreshed = await refreshRes.json();
    // Rotation: a new refresh token is issued, different from the old one.
    expect(refreshed.refresh_token).toEqual(expect.any(String));
    expect(refreshed.refresh_token).not.toBe(originalRefreshToken);
    // Narrowing: only the requested subset remains, no contacts.write.
    expect(refreshed.scope).toBe("contacts.read");
    expect(refreshed.scope).not.toContain("contacts.write");
  });
});
