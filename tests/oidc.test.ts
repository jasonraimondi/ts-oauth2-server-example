import { createHash, randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { app } from "../src/app.js";
import { jwt } from "../src/container.js";

const CLIENT_ID = "9b8c7d6e-5f40-4a3b-8c2d-1e0f9a8b7c6d"; // OIDC Demo Client
const USER_ID = "dd74961a-c348-4471-98a5-19fc3c5b5079";
const REDIRECT = "http://localhost:5173/callback";
const ISSUER = "http://localhost:3000";

type Pkce = { verifier: string; challenge: string };

function pkce(): Pkce {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

function decodeJwt(token: string): { header: Record<string, unknown>; payload: Record<string, unknown> } {
  const [header, payload] = token.split(".");
  return {
    header: JSON.parse(Buffer.from(header, "base64url").toString("utf8")),
    payload: JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
  };
}

async function mintJid(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({ userId: USER_ID, email: "jason@example.com", iat: now, exp: now + 3600 });
}

function openidAuthorizeQuery(challenge: string, state: string, nonce: string): string {
  const scope = encodeURIComponent("openid email profile");
  return (
    `response_type=code&client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT)}&scope=${scope}&state=${state}&nonce=${nonce}` +
    `&code_challenge=${challenge}&code_challenge_method=S256`
  );
}

// Drive authorize -> token with the openid scope set; returns the parsed token body.
async function runOpenIdFlow(nonce: string): Promise<Record<string, any>> {
  const { verifier, challenge } = pkce();
  const query = openidAuthorizeQuery(challenge, "oidc", nonce);
  const jid = await mintJid();

  const authorizeRes = await app.request(`/api/oauth2/authorize?${query}`, {
    headers: { Cookie: `jid=${jid}` },
    redirect: "manual",
  });
  expect(authorizeRes.status).toBe(302);
  const code = new URL(authorizeRes.headers.get("location")!).searchParams.get("code")!;

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
  return tokenRes.json();
}

describe("OIDC discovery document", () => {
  it("serves provider metadata at the well-known path", async () => {
    const res = await app.request("/.well-known/openid-configuration");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const doc = await res.json();
    expect(doc.issuer).toBe(ISSUER);
    expect(doc.authorization_endpoint).toBe(`${ISSUER}/api/oauth2/authorize`);
    expect(doc.token_endpoint).toBe(`${ISSUER}/api/oauth2/token`);
    expect(doc.userinfo_endpoint).toBe(`${ISSUER}/api/oauth2/userinfo`);
    expect(doc.jwks_uri).toBe(`${ISSUER}/.well-known/jwks.json`);
    expect(doc.id_token_signing_alg_values_supported).toContain("RS256");
    expect(doc.scopes_supported).toEqual(expect.arrayContaining(["openid", "email", "profile"]));
  });
});

describe("OIDC JWKS", () => {
  it("publishes the RSA public signing key", async () => {
    const res = await app.request("/.well-known/jwks.json");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const { keys } = await res.json();
    expect(Array.isArray(keys)).toBe(true);
    expect(keys.length).toBeGreaterThanOrEqual(1);
    const [key] = keys;
    expect(key.kty).toBe("RSA");
    expect(key.use).toBe("sig");
    expect(key.alg).toBe("RS256");
    expect(key.kid).toEqual(expect.any(String));
    expect(key.n).toEqual(expect.any(String));
    expect(key.e).toEqual(expect.any(String));
  });
});

describe("id_token issuance on the authorization_code flow", () => {
  it("returns an RS256 id_token bound to the request nonce", async () => {
    const nonce = "n-0S6_WzA2Mj";
    const body = await runOpenIdFlow(nonce);

    expect(body.id_token).toEqual(expect.any(String));
    const { header, payload } = decodeJwt(body.id_token);
    expect(header.alg).toBe("RS256");
    expect(payload.iss).toBe(ISSUER);
    expect(payload.aud).toBe(CLIENT_ID);
    expect(payload.sub).toBe(USER_ID);
    expect(payload.nonce).toBe(nonce);
    expect(payload.at_hash).toEqual(expect.any(String));
    expect(payload.auth_time).toEqual(expect.any(Number));
  });

  it("issues an at+jwt access token carrying the issuer", async () => {
    const body = await runOpenIdFlow("nonce-at-jwt");
    const { header, payload } = decodeJwt(body.access_token);
    expect(header.typ).toBe("at+jwt");
    expect(header.alg).toBe("RS256");
    expect(payload.iss).toBe(ISSUER);
  });
});

describe("OIDC userinfo endpoint", () => {
  it("returns scope-filtered claims for a valid bearer token", async () => {
    const body = await runOpenIdFlow("nonce-userinfo");

    const res = await app.request("/api/oauth2/userinfo", {
      headers: { Authorization: `Bearer ${body.access_token}` },
    });

    expect(res.status).toBe(200);
    const claims = await res.json();
    expect(claims.sub).toBe(USER_ID);
    expect(claims.email).toBe("jason@example.com");
    expect(claims.name).toEqual(expect.any(String));
  });

  it("rejects a request with no bearer token", async () => {
    const res = await app.request("/api/oauth2/userinfo");
    expect(res.status).toBe(401);
  });
});
