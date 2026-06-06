import { createHash, randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { app } from "../src/app.js";

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

// Same-origin headers so hono/csrf passes for the POST. app.request("/...")
// uses http://localhost as the origin.
const formHeaders = {
  "content-type": "application/x-www-form-urlencoded",
  origin: "http://localhost",
  host: "localhost",
};

describe("login form", () => {
  it("GET /api/login renders the login form with the query in the action", async () => {
    const q = authorizeQuery();
    const res = await app.request(`/api/login?${q}`);

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("<form");
    expect(body).toContain('name="email"');
    expect(body).toContain(`/api/login?response_type=code`);
    expect(body).toContain(`client_id=${CLIENT_ID}`);
  });

  it("POST /api/login authenticates, sets jid cookie, redirects back to authorize", async () => {
    const q = authorizeQuery();
    const res = await app.request(`/api/login?${q}`, {
      method: "POST",
      headers: formHeaders,
      body: "email=jason@example.com&password=password123",
    });

    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location.startsWith("/api/oauth2/authorize?")).toBe(true);
    expect(location).toContain(`client_id=${CLIENT_ID}`);
    expect(res.headers.get("set-cookie")).toContain("jid=");
  });

  it("POST /api/login with a wrong password returns 401", async () => {
    const q = authorizeQuery();
    const res = await app.request(`/api/login?${q}`, {
      method: "POST",
      headers: formHeaders,
      body: "email=jason@example.com&password=wrongpassword",
    });

    expect(res.status).toBe(401);
  });
});
