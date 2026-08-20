import { describe, expect, it } from "vitest";

import { app } from "../src/app.js";
import { formHeaders, mintJid, pkce } from "./helpers.js";

const CLIENT_ID = "0e2ec2df-ee53-4327-a472-9d78c278bdbb";
const REDIRECT = "http://localhost:5173/callback";

function authorizeQuery(): string {
  const { challenge } = pkce();
  return (
    `response_type=code&client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT)}&scope=contacts.read&state=val` +
    `&code_challenge=${challenge}&code_challenge_method=S256`
  );
}

async function postLogin(body: string): Promise<Response> {
  return app.request(`/api/login?${authorizeQuery()}`, {
    method: "POST",
    headers: formHeaders,
    body,
  });
}

// A browser posts these forms, so a rejected body has to come back as a page the
// user can correct and resubmit — never as the zod error JSON, and never as a 500.
describe("POST /api/login rejects a malformed form body", () => {
  it("re-renders the login form with 400 for an email that is not an address", async () => {
    const res = await postLogin("email=not-an-email&password=password123");

    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain("<form");
    expect(body).toContain("Enter a valid email address");
  });

  it("re-renders the login form with 400 when the password field is absent", async () => {
    const res = await postLogin("email=jason@example.com");

    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("<form");
  });

  it("re-renders the login form with 400 for an empty password", async () => {
    const res = await postLogin("email=jason@example.com&password=");

    expect(res.status).toBe(400);
    expect(await res.text()).toContain("<form");
  });
});

describe("POST /api/scopes rejects a malformed consent decision", () => {
  it("answers 400, not 500, for an accept value outside yes/no", async () => {
    const res = await app.request(`/api/scopes?${authorizeQuery()}`, {
      method: "POST",
      headers: { ...formHeaders, Cookie: `jid=${await mintJid()}` },
      body: "accept=maybe",
      redirect: "manual",
    });

    expect(res.status).toBe(400);
  });

  it("answers 400, not 500, when accept is absent entirely", async () => {
    const res = await app.request(`/api/scopes?${authorizeQuery()}`, {
      method: "POST",
      headers: { ...formHeaders, Cookie: `jid=${await mintJid()}` },
      body: "",
      redirect: "manual",
    });

    expect(res.status).toBe(400);
  });
});
