import { describe, expect, it } from "vitest";

import { app } from "../src/app.js";
import { readJson } from "./helpers.js";

// The library auto-enables client_credentials server-wide before enableGrantTypes
// runs, so per-client allowedGrants is the only thing keeping the grant closed.
// None of the seeded clients lists it; discovery does not advertise it either.
const SEEDED_CLIENTS = [
  { name: "Sample Client", id: "0e2ec2df-ee53-4327-a472-9d78c278bdbb", secret: undefined },
  { name: "OIDC Demo Client", id: "9b8c7d6e-5f40-4a3b-8c2d-1e0f9a8b7c6d", secret: undefined },
  {
    name: "BFF Web Client",
    id: "b1ff0000-0000-4000-8000-000000000001",
    secret: "bff-dev-secret-change-me",
  },
];

describe("client_credentials grant", () => {
  it("is absent from the discovery document", async () => {
    const res = await app.request("/.well-known/openid-configuration");
    const doc = await readJson(res);

    expect(doc.grant_types_supported).not.toContain("client_credentials");
  });

  it.each(SEEDED_CLIENTS)("is refused for $name", async ({ id, secret }) => {
    const body: Record<string, string> = {
      grant_type: "client_credentials",
      client_id: id,
      scope: "contacts.read",
    };
    if (secret) body.client_secret = secret;

    const res = await app.request("/api/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body),
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(await res.text()).not.toContain("access_token");
  });
});
