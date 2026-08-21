import { beforeEach } from "vitest";

import { db } from "../app.js";
import { oauthAuthCodes, oauthTokens } from "../../src/db/schema.js";

// The scope join tables cascade from their parents.
export async function truncateDynamic(database: typeof db = db): Promise<void> {
  await database.delete(oauthTokens);
  await database.delete(oauthAuthCodes);
}

beforeEach(async () => {
  await truncateDynamic();
});
