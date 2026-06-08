import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { app } from "../src/app.js";
import { jwt, db } from "../src/container.js";
import { oauthTokens } from "../src/db/schema.js";
import { approveAuthorize, codeFromApprove, formHeaders, mintJid, pkce } from "./helpers.js";

const CLIENT_ID = "0e2ec2df-ee53-4327-a472-9d78c278bdbb"; // Sample Client (public)
const OIDC_CLIENT_ID = "9b8c7d6e-5f40-4a3b-8c2d-1e0f9a8b7c6d"; // OIDC Demo Client (public)
const REDIRECT = "http://localhost:5173/callback";

function authorizeQuery(
  challenge: string,
  opts: {
    clientId?: string;
    scope?: string;
    state?: string;
    method?: string;
    redirect?: string;
  } = {},
): string {
  const clientId = opts.clientId ?? CLIENT_ID;
  const scope = encodeURIComponent(opts.scope ?? "contacts.read contacts.write");
  const redirect = encodeURIComponent(opts.redirect ?? REDIRECT);
  const method = opts.method ?? "S256";
  return (
    `response_type=code&client_id=${clientId}` +
    `&redirect_uri=${redirect}&scope=${scope}&state=${opts.state ?? "st"}` +
    `&code_challenge=${challenge}&code_challenge_method=${method}`
  );
}

async function exchangeCode(
  code: string,
  verifier: string,
  clientId = CLIENT_ID,
): Promise<Response> {
  return app.request("/api/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      redirect_uri: REDIRECT,
      code,
      code_verifier: verifier,
    }),
  });
}

describe("consent screen (GET /api/scopes)", () => {
  it("renders the client name and the requested scopes for an authenticated session", async () => {
    const { challenge } = pkce();
    const query = authorizeQuery(challenge);
    const jid = await mintJid();

    const res = await app.request(`/api/scopes?${query}`, { headers: { Cookie: `jid=${jid}` } });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Sample Client"); // client name
    expect(body).toContain("contacts.read"); // requested scopes
    expect(body).toContain("contacts.write");
    expect(body).toContain('value="yes"'); // approve button
    expect(body).toContain('value="no"'); // deny button
  });
});

describe("consent decision (POST /api/scopes)", () => {
  it("accept=yes completes with a code that exchanges for tokens", async () => {
    const { verifier, challenge } = pkce();
    const query = authorizeQuery(challenge, { state: "approve" });
    const jid = await mintJid();

    const res = await approveAuthorize(query, jid);
    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location.startsWith(`${REDIRECT}?`)).toBe(true);
    const code = new URL(location).searchParams.get("code")!;
    expect(code).toEqual(expect.any(String));

    const tokenRes = await exchangeCode(code, verifier);
    expect(tokenRes.status).toBe(200);
    const json = await tokenRes.json();
    expect(json.access_token).toEqual(expect.any(String));
    expect(json.token_type).toBe("Bearer");
  });

  it("accept=no redirects to redirect_uri with an access_denied error (no code)", async () => {
    const { challenge } = pkce();
    const query = authorizeQuery(challenge, { state: "deny" });
    const jid = await mintJid();

    const res = await app.request(`/api/scopes?${query}`, {
      method: "POST",
      headers: { ...formHeaders, Cookie: `jid=${jid}` },
      body: "accept=no",
      redirect: "manual",
    });

    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location.startsWith(`${REDIRECT}?`)).toBe(true);
    const params = new URL(location).searchParams;
    // RFC 6749: a denied request redirects back with error=access_denied, no code.
    expect(params.get("error")).toBe("access_denied");
    expect(params.get("code")).toBeNull();
    expect(params.get("state")).toBe("deny");
  });

  it("redirects to /api/login when there is no session", async () => {
    const { challenge } = pkce();
    const query = authorizeQuery(challenge);

    const res = await app.request(`/api/scopes?${query}`, {
      method: "POST",
      headers: formHeaders,
      body: "accept=yes",
      redirect: "manual",
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")!.startsWith("/api/login?")).toBe(true);
  });
});

describe("access-token revocation guards /userinfo (proves getByAccessToken + isAccessTokenRevoked)", () => {
  it("rejects a revoked-but-unexpired access token at /userinfo", async () => {
    const { verifier, challenge } = pkce();
    // openid scope so the token carries claims /userinfo will serve.
    const query = authorizeQuery(challenge, {
      clientId: OIDC_CLIENT_ID,
      scope: "openid email profile",
      state: "revoke",
    });
    const jid = await mintJid();

    const code = await codeFromApprove(query, jid);
    const tokenRes = await exchangeCode(code, verifier, OIDC_CLIENT_ID);
    expect(tokenRes.status).toBe(200);
    const { access_token } = await tokenRes.json();

    // Before revocation the token is accepted.
    const before = await app.request("/api/oauth2/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    expect(before.status).toBe(200);

    // Revoke the access token by force-expiring its stored row — exactly what the
    // TokenRepository.revoke()/isAccessTokenRevoked model does (the JWT's jti is
    // the stored accessToken). We expire the row directly rather than through the
    // /revoke route to isolate the userinfo guard from RFC 7009's client-auth step
    // (authenticateRevoke defaults on); the route itself does revoke an access
    // token when the request carries client_id.
    const jti = (jwt.decode(access_token) as { jti: string }).jti;
    await db
      .update(oauthTokens)
      .set({ accessTokenExpiresAt: new Date(0) })
      .where(eq(oauthTokens.accessToken, jti));

    // The JWT itself is still within its exp window, but the revocation guard
    // (getByAccessToken -> isAccessTokenRevoked) must now reject it. With the old
    // phantom findById this guard was skipped and the token still resolved.
    const after = await app.request("/api/oauth2/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    expect(after.status).toBe(401);
  });
});

describe("authorization_code replay protection", () => {
  it("rejects exchanging the same auth code twice", async () => {
    const { verifier, challenge } = pkce();
    const query = authorizeQuery(challenge, { state: "replay" });
    const jid = await mintJid();

    const code = await codeFromApprove(query, jid);

    const first = await exchangeCode(code, verifier);
    expect(first.status).toBe(200);

    const second = await exchangeCode(code, verifier);
    expect(second.status).toBeGreaterThanOrEqual(400);
    expect(second.status).toBeLessThan(500);
  });
});

describe("PKCE negatives", () => {
  it("rejects an authorize request with no code_challenge (requiresPKCE)", async () => {
    const jid = await mintJid();
    const query =
      `response_type=code&client_id=${CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT)}&scope=contacts.read&state=nopkce`;

    const res = await app.request(`/api/oauth2/authorize?${query}`, {
      headers: { Cookie: `jid=${jid}` },
      redirect: "manual",
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    // Must NOT redirect the user onward into login/consent.
    const location = res.headers.get("location") ?? "";
    expect(location).not.toMatch(/^\/api\/(login|scopes)/);
  });

  it("rejects a token exchange with no code_verifier", async () => {
    const { challenge } = pkce();
    const query = authorizeQuery(challenge, { state: "noverifier" });
    const code = await codeFromApprove(query, await mintJid());

    const res = await app.request("/api/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT,
        code, // no code_verifier
      }),
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("rejects code_challenge_method=plain (requiresS256)", async () => {
    const jid = await mintJid();
    const { challenge } = pkce();
    const query = authorizeQuery(challenge, { method: "plain", state: "plain" });

    const res = await app.request(`/api/oauth2/authorize?${query}`, {
      headers: { Cookie: `jid=${jid}` },
      redirect: "manual",
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});

describe("redirect_uri mismatch", () => {
  it("does not 302 to a foreign redirect_uri and maps to a 4xx", async () => {
    const jid = await mintJid();
    const { challenge } = pkce();
    const query = authorizeQuery(challenge, {
      redirect: "http://evil.example/callback",
      state: "evil",
    });

    const res = await app.request(`/api/oauth2/authorize?${query}`, {
      headers: { Cookie: `jid=${jid}` },
      redirect: "manual",
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    // Crucially, the attacker host is never used as a redirect target.
    const location = res.headers.get("location") ?? "";
    expect(location).not.toContain("evil.example");
  });
});
