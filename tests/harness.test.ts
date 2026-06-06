import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "../src/db/index.js";
import { oauthScopes, oauthTokens } from "../src/db/schema.js";

const SEEDED_CLIENT_ID = "0e2ec2df-ee53-4327-a472-9d78c278bdbb";
const DUMMY_ACCESS_TOKEN = "harness-dummy-token";

describe("test-db harness", () => {
  it("has the seeded scope (migrate + seed ran)", async () => {
    const rows = await db.select().from(oauthScopes).where(eq(oauthScopes.name, "contacts.read"));
    expect(rows).toHaveLength(1);
  });

  it("inserts a dynamic token row", async () => {
    await db.insert(oauthTokens).values({
      accessToken: DUMMY_ACCESS_TOKEN,
      accessTokenExpiresAt: new Date(Date.now() + 60_000),
      clientId: SEEDED_CLIENT_ID,
    });

    const rows = await db
      .select()
      .from(oauthTokens)
      .where(eq(oauthTokens.accessToken, DUMMY_ACCESS_TOKEN));
    expect(rows).toHaveLength(1);
  });

  it("truncation reset removed the token but kept seeded data", async () => {
    const tokens = await db
      .select()
      .from(oauthTokens)
      .where(eq(oauthTokens.accessToken, DUMMY_ACCESS_TOKEN));
    expect(tokens).toHaveLength(0);

    const scopes = await db.select().from(oauthScopes).where(eq(oauthScopes.name, "contacts.read"));
    expect(scopes).toHaveLength(1);
  });
});
