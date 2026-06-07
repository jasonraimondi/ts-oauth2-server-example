import { createHash, randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { app } from "../src/app.js";
import { approveAuthorize, mintJid } from "./helpers.js";

const CLIENT_ID = "0e2ec2df-ee53-4327-a472-9d78c278bdbb";
const REDIRECT = "http://localhost:5173/callback";

const base64url = (buf: Buffer): string => buf.toString("base64url");

function authorizeQuery(): string {
  const verifier = base64url(randomBytes(32));
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return (
    `response_type=code&client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT)}&scope=contacts.read&state=st` +
    `&code_challenge=${challenge}&code_challenge_method=S256`
  );
}

describe("GET /api/oauth2/authorize", () => {
  it("redirects to /api/login with the original query when there is no session", async () => {
    const res = await app.request(`/api/oauth2/authorize?${authorizeQuery()}`, { redirect: "manual" });

    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location.startsWith("/api/login?")).toBe(true);
    expect(location).toContain(`client_id=${CLIENT_ID}`);
  });

  it("redirects an authenticated session to the consent screen (no auto-approve)", async () => {
    const token = await mintJid();
    const res = await app.request(`/api/oauth2/authorize?${authorizeQuery()}`, {
      headers: { Cookie: `jid=${token}` },
      redirect: "manual",
    });

    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location.startsWith("/api/scopes?")).toBe(true);
    expect(location).toContain(`client_id=${CLIENT_ID}`);
  });

  it("completes via consent and redirects to redirect_uri with code + state", async () => {
    const token = await mintJid();
    const res = await approveAuthorize(authorizeQuery(), token);

    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location.startsWith(`${REDIRECT}?`)).toBe(true);
    const params = new URL(location).searchParams;
    expect(params.get("code")).toEqual(expect.any(String));
    expect(params.get("state")).toBe("st");
  });

  it("treats an invalid jid as no session and redirects to /api/login", async () => {
    const res = await app.request(`/api/oauth2/authorize?${authorizeQuery()}`, {
      headers: { Cookie: "jid=garbage" },
      redirect: "manual",
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")!.startsWith("/api/login?")).toBe(true);
  });
});
