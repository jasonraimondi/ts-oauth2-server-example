import { pathToFileURL } from "node:url";

import bcryptjs from "bcryptjs";

import { db } from "./index.js";
import { oauthClients, oauthClientScopes, oauthScopes, users } from "./schema.js";

const USER_ID = "dd74961a-c348-4471-98a5-19fc3c5b5079";
const CLIENT_ID = "0e2ec2df-ee53-4327-a472-9d78c278bdbb";
const SCOPE_READ_ID = "c3d49dba-53c8-4d08-970f-9c567414732e";
const SCOPE_WRITE_ID = "22861a6c-dd8d-47b3-be1f-a3e7b67943bc";

export async function seed(database: typeof db = db): Promise<void> {
  const passwordHash = await bcryptjs.hash("password123", 10);

  await database
    .insert(users)
    .values({
      id: USER_ID,
      email: "jason@example.com",
      createdIP: "127.0.0.1",
      passwordHash,
    })
    .onConflictDoUpdate({ target: users.id, set: { passwordHash } });

  await database
    .insert(oauthClients)
    .values({
      id: CLIENT_ID,
      name: "Sample Client",
      secret: null,
      allowedGrants: ["authorization_code", "client_credentials", "refresh_token"],
      redirectUris: ["http://localhost:5173/callback"],
    })
    .onConflictDoNothing({ target: oauthClients.id });

  await database
    .insert(oauthScopes)
    .values([
      { id: SCOPE_READ_ID, name: "contacts.read" },
      { id: SCOPE_WRITE_ID, name: "contacts.write" },
    ])
    .onConflictDoNothing({ target: oauthScopes.id });

  await database
    .insert(oauthClientScopes)
    .values([
      { clientId: CLIENT_ID, scopeId: SCOPE_READ_ID },
      { clientId: CLIENT_ID, scopeId: SCOPE_WRITE_ID },
    ])
    .onConflictDoNothing();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await seed();
  process.exit(0);
}
