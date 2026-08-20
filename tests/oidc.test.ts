import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { app } from "../src/app.js";
import { db } from "../src/container.js";
import { users } from "../src/db/schema.js";
import {
  codeFromApprove,
  formHeaders,
  mintJid,
  pkce,
  readJson,
  SEEDED_USER_ID,
} from "./helpers.js";

const CLIENT_ID = "9b8c7d6e-5f40-4a3b-8c2d-1e0f9a8b7c6d"; // OIDC Demo Client
const USER_ID = SEEDED_USER_ID;
const REDIRECT = "http://localhost:5173/callback";
const ISSUER = "http://localhost:3000";

function decodeJwt(token: string): {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
} {
  const [header, payload] = token.split(".");
  return {
    header: JSON.parse(Buffer.from(header!, "base64url").toString("utf8")),
    payload: JSON.parse(Buffer.from(payload!, "base64url").toString("utf8")),
  };
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

  // authorize -> consent (accept=yes) -> callback with a code.
  const code = await codeFromApprove(query, jid);

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

describe("OIDC discovery document", () => {
  it("serves provider metadata at the well-known path", async () => {
    const res = await app.request("/.well-known/openid-configuration");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const doc = await readJson(res);
    expect(doc.issuer).toBe(ISSUER);
    expect(doc.authorization_endpoint).toBe(`${ISSUER}/api/oauth2/authorize`);
    expect(doc.token_endpoint).toBe(`${ISSUER}/api/oauth2/token`);
    expect(doc.userinfo_endpoint).toBe(`${ISSUER}/api/oauth2/userinfo`);
    expect(doc.jwks_uri).toBe(`${ISSUER}/.well-known/jwks.json`);
    expect(doc.revocation_endpoint).toBe(`${ISSUER}/api/oauth2/revoke`);
    expect(doc.id_token_signing_alg_values_supported).toContain("RS256");
    expect(doc.scopes_supported).toEqual(expect.arrayContaining(["openid", "email", "profile"]));
  });
});

describe("OIDC JWKS", () => {
  it("publishes the RSA public signing key", async () => {
    const res = await app.request("/.well-known/jwks.json");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const { keys } = await readJson(res);
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
    const claims = await readJson(res);
    expect(claims.sub).toBe(USER_ID);
    expect(claims.email).toBe("jason@example.com");
    expect(claims.name).toEqual(expect.any(String));
  });

  it("rejects a request with no bearer token", async () => {
    const res = await app.request("/api/oauth2/userinfo");
    expect(res.status).toBe(401);
  });
});

describe("OIDC prompt and max_age enforcement", () => {
  // The library parses both parameters onto the AuthorizationRequest and leaves
  // acting on them to the application (OIDC Core §3.1.2.1).
  const setLastLogin = (at: Date | null) =>
    db.update(users).set({ lastLoginAt: at }).where(eq(users.id, USER_ID));

  afterAll(() => setLastLogin(null));

  function query(extra: string, state = "prompt"): string {
    return `${openidAuthorizeQuery(pkce().challenge, state, "n0nce")}&${extra}`;
  }

  async function authorize(q: string, jid?: string): Promise<Response> {
    return app.request(`/api/oauth2/authorize?${q}`, {
      headers: jid ? { Cookie: `jid=${jid}` } : {},
      redirect: "manual",
    });
  }

  it("answers prompt=none without a session as login_required on the redirect_uri", async () => {
    const res = await authorize(query("prompt=none", "nosession"));

    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!);
    expect(location.origin + location.pathname).toBe(REDIRECT);
    expect(location.searchParams.get("error")).toBe("login_required");
    expect(location.searchParams.get("state")).toBe("nosession");
  });

  it("lets prompt=none through when the session already answers the request", async () => {
    await setLastLogin(new Date());
    const res = await authorize(query("prompt=none"), await mintJid());

    expect(res.headers.get("location")!.startsWith("/api/scopes?")).toBe(true);
  });

  it("treats prompt=login as logged out even with a valid session", async () => {
    await setLastLogin(new Date());
    const res = await authorize(query("prompt=login"), await mintJid());

    expect(res.headers.get("location")!.startsWith("/api/login?")).toBe(true);
  });

  it("sends a session older than max_age back through login", async () => {
    await setLastLogin(new Date(Date.now() - 60 * 60_000));
    const res = await authorize(query("max_age=300"), await mintJid());

    expect(res.headers.get("location")!.startsWith("/api/login?")).toBe(true);
  });

  it("accepts a session younger than max_age", async () => {
    await setLastLogin(new Date());
    const res = await authorize(query("max_age=300"), await mintJid());

    expect(res.headers.get("location")!.startsWith("/api/scopes?")).toBe(true);
  });

  it("applies the same check when consent is submitted", async () => {
    await setLastLogin(new Date(Date.now() - 60 * 60_000));
    const q = query("max_age=300&prompt=none", "onpost");

    const res = await app.request(`/api/scopes?${q}`, {
      method: "POST",
      headers: { ...formHeaders, Cookie: `jid=${await mintJid()}` },
      body: "accept=yes",
      redirect: "manual",
    });

    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("error")).toBe("login_required");
    expect(location.searchParams.get("code")).toBeNull();
  });
});
