import { sql } from "drizzle-orm";
import { beforeEach } from "vitest";

import { db } from "../../src/db/index.js";

export async function truncateDynamic(database: typeof db = db): Promise<void> {
  await database.execute(
    sql`TRUNCATE "oauthTokenScopes", "oauthAuthCodeScopes", "oauthTokens", "oauthAuthCodes" RESTART IDENTITY CASCADE;`,
  );
}

beforeEach(async () => {
  await truncateDynamic();
});
