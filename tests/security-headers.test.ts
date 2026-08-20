import { describe, expect, it } from "vitest";

import { app } from "../src/app.js";
import { mintJid, pkce } from "./helpers.js";

const CLIENT_ID = "0e2ec2df-ee53-4327-a472-9d78c278bdbb";
const REDIRECT = "http://localhost:5173/callback";

function authorizeQuery(): string {
  const { challenge } = pkce();
  return (
    `response_type=code&client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT)}&scope=contacts.read&state=st` +
    `&code_challenge=${challenge}&code_challenge_method=S256`
  );
}

describe("security headers on the browser form routes", () => {
  it("forbids framing the login page", async () => {
    const res = await app.request(`/api/login?${authorizeQuery()}`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });

  it("forbids framing the consent page", async () => {
    const jid = await mintJid();
    const res = await app.request(`/api/scopes?${authorizeQuery()}`, {
      headers: { Cookie: `jid=${jid}` },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });

  it("keeps the authorize query out of the Referer, allows the views' inline style, and leaves the consent redirect unblocked", async () => {
    const res = await app.request(`/api/login?${authorizeQuery()}`);

    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    const csp = res.headers.get("content-security-policy")!;
    expect(csp).not.toContain("form-action");
    expect(csp).toContain("style-src 'unsafe-inline'");
  });

  it("omits HSTS in development, where https is not available", async () => {
    const res = await app.request("/api/ping");

    expect(res.headers.get("strict-transport-security")).toBeNull();
  });
});
