import { createHash } from "node:crypto";

import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTVerifyGetKey } from "jose";
import { beforeAll, describe, expect, it } from "vitest";

import {
  buildAuthorizeUrl,
  exchangeCode,
  fetchUserInfo,
  generatePkce,
  validateIdToken,
} from "./oauth";

const ISSUER = "http://localhost:3000";
const CLIENT_ID = "bff-client";
const NONCE = "nonce-123";

let privateKey: CryptoKey;
let jwks: JWTVerifyGetKey;
let signSymmetric: Uint8Array;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const jwk = await exportJWK(pair.publicKey);
  jwk.alg = "RS256";
  jwks = createLocalJWKSet({ keys: [jwk] });
  signSymmetric = new TextEncoder().encode("a-shared-symmetric-secret-of-sufficient-length!!");
});

// Sign a valid RS256 id_token, then apply `overrides` to claims/header for the
// negative cases.
async function idToken(
  over: { iss?: string; aud?: string; nonce?: string; expSecondsFromNow?: number } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ nonce: over.nonce ?? NONCE })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(over.iss ?? ISSUER)
    .setAudience(over.aud ?? CLIENT_ID)
    .setSubject("user-1")
    .setIssuedAt(now)
    .setExpirationTime(now + (over.expSecondsFromNow ?? 300))
    .sign(privateKey);
}

const opts = () => ({ jwks, issuer: ISSUER, clientId: CLIENT_ID, nonce: NONCE });

describe("generatePkce", () => {
  it("produces a verifier in the RFC 7636 range and a matching S256 challenge", () => {
    const { verifier, challenge } = generatePkce();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
  });

  it("is non-deterministic", () => {
    expect(generatePkce().verifier).not.toBe(generatePkce().verifier);
  });
});

describe("buildAuthorizeUrl", () => {
  it("sets response_type=code, S256, and the passed params", () => {
    const url = new URL(
      buildAuthorizeUrl({
        authorizationEndpoint: `${ISSUER}/api/oauth2/authorize`,
        clientId: CLIENT_ID,
        redirectUri: "http://localhost:5173/auth/callback",
        scope: "openid contacts.read",
        state: "st",
        nonce: NONCE,
        codeChallenge: "chal",
      }),
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(url.searchParams.get("nonce")).toBe(NONCE);
    expect(url.searchParams.get("code_challenge")).toBe("chal");
  });
});

describe("exchangeCode", () => {
  it("posts form-encoded with the client secret and returns parsed tokens", async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    const fetchMock = (async (url: string, init: RequestInit) => {
      captured = { url, init };
      return new Response(
        JSON.stringify({ access_token: "at", token_type: "Bearer", refresh_token: "rt" }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }) as unknown as typeof fetch;

    const tokens = await exchangeCode({
      fetch: fetchMock,
      tokenEndpoint: `${ISSUER}/api/oauth2/token`,
      clientId: CLIENT_ID,
      clientSecret: "sec",
      redirectUri: "http://localhost:5173/auth/callback",
      code: "the-code",
      codeVerifier: "the-verifier",
    });

    expect(tokens.access_token).toBe("at");
    expect(tokens.refresh_token).toBe("rt");
    const headers = captured!.init.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/x-www-form-urlencoded");
    const body = captured!.init.body as URLSearchParams;
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("client_secret")).toBe("sec");
    expect(body.get("code_verifier")).toBe("the-verifier");
  });

  it("throws on a non-2xx token response", async () => {
    const fetchMock = (async () =>
      new Response(JSON.stringify({ error: "invalid_grant" }), {
        status: 400,
      })) as unknown as typeof fetch;
    await expect(
      exchangeCode({
        fetch: fetchMock,
        tokenEndpoint: `${ISSUER}/api/oauth2/token`,
        clientId: CLIENT_ID,
        clientSecret: "sec",
        redirectUri: "x",
        code: "x",
        codeVerifier: "x",
      }),
    ).rejects.toThrow();
  });
});

describe("fetchUserInfo", () => {
  it("sends the access token as a Bearer and returns the claims", async () => {
    let authorization: string | undefined;
    const fetchMock = (async (_url: string, init: RequestInit) => {
      authorization = (init.headers as Record<string, string>).authorization;
      return new Response(JSON.stringify({ sub: "u1", email: "ada@example.com" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const claims = await fetchUserInfo({
      fetch: fetchMock,
      userinfoEndpoint: `${ISSUER}/api/oauth2/userinfo`,
      accessToken: "AT",
    });

    expect(claims.email).toBe("ada@example.com");
    expect(authorization).toBe("Bearer AT");
  });

  it("throws on a non-2xx userinfo response", async () => {
    const fetchMock = (async () => new Response("", { status: 401 })) as unknown as typeof fetch;
    await expect(
      fetchUserInfo({
        fetch: fetchMock,
        userinfoEndpoint: `${ISSUER}/userinfo`,
        accessToken: "AT",
      }),
    ).rejects.toThrow();
  });
});

describe("validateIdToken", () => {
  it("accepts a well-formed RS256 token and returns its claims", async () => {
    const claims = await validateIdToken(await idToken(), opts());
    expect(claims.sub).toBe("user-1");
  });

  it("rejects a wrong issuer", async () => {
    await expect(validateIdToken(await idToken({ iss: "http://evil" }), opts())).rejects.toThrow();
  });

  it("rejects a wrong audience", async () => {
    await expect(validateIdToken(await idToken({ aud: "someone-else" }), opts())).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    await expect(
      validateIdToken(await idToken({ expSecondsFromNow: -3600 }), opts()),
    ).rejects.toThrow();
  });

  it("rejects a nonce mismatch", async () => {
    await expect(validateIdToken(await idToken({ nonce: "other" }), opts())).rejects.toThrow(
      /nonce/i,
    );
  });

  it("rejects an HS256 token (algorithm confusion)", async () => {
    const hs = await new SignJWT({ nonce: NONCE })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setSubject("user-1")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(signSymmetric);
    await expect(validateIdToken(hs, opts())).rejects.toThrow();
  });

  it("rejects an alg:none token", async () => {
    const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const none =
      `${enc({ alg: "none", typ: "JWT" })}.` +
      `${enc({ iss: ISSUER, aud: CLIENT_ID, sub: "user-1", nonce: NONCE, exp: now + 300, iat: now })}.`;
    await expect(validateIdToken(none, opts())).rejects.toThrow();
  });
});
