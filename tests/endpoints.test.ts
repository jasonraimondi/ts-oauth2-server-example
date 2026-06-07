import { createHash, randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { requestFromVanilla, responseToVanilla } from "@jmondi/oauth2-server/vanilla";

import { app } from "../src/app.js";
import { authorizationServer, userRepository } from "../src/container.js";

const CLIENT_ID = "0e2ec2df-ee53-4327-a472-9d78c278bdbb";
const USER_ID = "dd74961a-c348-4471-98a5-19fc3c5b5079";
const REDIRECT = "http://localhost:5173/callback";

const base64url = (buf: Buffer): string => buf.toString("base64url");

/**
 * Mints a fresh authorization code for the seeded client/user via the
 * AuthorizationServer programmatically, returning the code + PKCE verifier.
 */
async function mintAuthCode(): Promise<{ code: string; verifier: string }> {
  const verifier = base64url(randomBytes(32));
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const scope = encodeURIComponent("contacts.read contacts.write");
  const authzUrl =
    `http://localhost/api/oauth2/authorize?response_type=code&client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT)}&scope=${scope}&state=st` +
    `&code_challenge=${challenge}&code_challenge_method=S256`;

  const authRequest = await authorizationServer.validateAuthorizationRequest(
    await requestFromVanilla(new Request(authzUrl)),
  );
  authRequest.user = await userRepository.getUserByCredentials(USER_ID);
  authRequest.isAuthorizationApproved = true;

  const completed = await authorizationServer.completeAuthorizationRequest(authRequest);
  const location = responseToVanilla(completed).headers.get("location")!;
  const code = new URL(location).searchParams.get("code")!;

  return { code, verifier };
}

describe("GET /api/ping", () => {
  it("returns 200 pong", async () => {
    const res = await app.request("/api/ping");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("pong");
  });
});

describe("POST /api/oauth2/token error mapping", () => {
  it("maps an OAuthException to its status/body shape (not 500)", async () => {
    const res = await app.request("/api/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: CLIENT_ID }), // missing grant_type
    });

    expect(res.status).not.toBe(500);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);

    const json = await res.json();
    expect(json).toMatchObject({
      status: res.status,
      error: expect.any(String),
      error_description: expect.any(String),
      message: expect.any(String),
    });
  });
});

describe("POST /api/oauth2/token happy path", () => {
  it("exchanges a valid auth code + PKCE for access + refresh tokens", async () => {
    const { code, verifier } = await mintAuthCode();

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT,
      code,
      code_verifier: verifier,
    });

    const res = await app.request("/api/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.access_token).toEqual(expect.any(String));
    expect(json.refresh_token).toEqual(expect.any(String));
    expect(json.token_type).toBe("Bearer");
    expect(json.scope).toContain("contacts.read");
    expect(json.scope).toContain("contacts.write");
  });

  it("rejects an exchange with a wrong code_verifier (4xx OAuth error, not 200/500)", async () => {
    const { code } = await mintAuthCode();

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT,
      code,
      code_verifier: base64url(randomBytes(32)), // wrong verifier
    });

    const res = await app.request("/api/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });

    expect(res.status).not.toBe(200);
    expect(res.status).not.toBe(500);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);

    const json = await res.json();
    expect(json.error).toEqual(expect.any(String));
    expect(json.error_description).toEqual(expect.any(String));
  });
});

describe("POST /api/oauth2/revoke", () => {
  // The refresh-token path (getByRefreshToken) exercises the route + vanilla
  // bridge for a valid 200 revoke. The access-token revoke path (which needs
  // getByAccessToken, now implemented) is covered in oauth-flow's revocation test.
  it("returns 200 for a valid revoke of an issued refresh token", async () => {
    const { code, verifier } = await mintAuthCode();

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
    const { refresh_token } = await tokenRes.json();

    const res = await app.request("/api/oauth2/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        token: refresh_token,
        token_type_hint: "refresh_token",
      }),
    });

    expect(res.status).toBe(200);
  });
});
