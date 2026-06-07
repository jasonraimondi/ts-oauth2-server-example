import { pathToFileURL } from "node:url";

import { db } from "./index.js";
import { oauthClients, oauthClientScopes, oauthScopes, users } from "./schema.js";
import { setPassword } from "../lib/password.js";

const USER_ID = "dd74961a-c348-4471-98a5-19fc3c5b5079";
const CLIENT_ID = "0e2ec2df-ee53-4327-a472-9d78c278bdbb";
const OIDC_CLIENT_ID = "9b8c7d6e-5f40-4a3b-8c2d-1e0f9a8b7c6d";
const SCOPE_READ_ID = "c3d49dba-53c8-4d08-970f-9c567414732e";
const SCOPE_WRITE_ID = "22861a6c-dd8d-47b3-be1f-a3e7b67943bc";
const SCOPE_OPENID_ID = "f0a1b2c3-d4e5-4f60-8a1b-2c3d4e5f6071";
const SCOPE_EMAIL_ID = "f0a1b2c3-d4e5-4f60-8a1b-2c3d4e5f6072";
const SCOPE_PROFILE_ID = "f0a1b2c3-d4e5-4f60-8a1b-2c3d4e5f6073";

export async function seed(database: typeof db = db): Promise<void> {
  // Hash via the same helper the app uses, so the bcrypt cost factor lives in one place.
  const passwordHash = await setPassword("password123");

  await database
    .insert(users)
    .values({
      id: USER_ID,
      email: "jason@example.com",
      name: "Jason Example",
      createdIP: "127.0.0.1",
      passwordHash,
    })
    .onConflictDoUpdate({ target: users.id, set: { passwordHash, name: "Jason Example" } });

  await database
    .insert(oauthClients)
    .values({
      id: CLIENT_ID,
      name: "Sample Client",
      secret: null,
      allowedGrants: ["authorization_code", "refresh_token"],
      redirectUris: ["http://localhost:5173/callback"],
    })
    .onConflictDoNothing({ target: oauthClients.id });

  // A separate client for the OIDC flow, keeping the Sample Client's API scopes
  // and the OIDC client's identity scopes cleanly separated.
  await database
    .insert(oauthClients)
    .values({
      id: OIDC_CLIENT_ID,
      name: "OIDC Demo Client",
      secret: null,
      allowedGrants: ["authorization_code", "refresh_token"],
      redirectUris: ["http://localhost:5173/callback"],
    })
    .onConflictDoNothing({ target: oauthClients.id });

  await database
    .insert(oauthScopes)
    .values([
      { id: SCOPE_READ_ID, name: "contacts.read" },
      { id: SCOPE_WRITE_ID, name: "contacts.write" },
      { id: SCOPE_OPENID_ID, name: "openid" },
      { id: SCOPE_EMAIL_ID, name: "email" },
      { id: SCOPE_PROFILE_ID, name: "profile" },
    ])
    .onConflictDoNothing({ target: oauthScopes.id });

  await database
    .insert(oauthClientScopes)
    .values([
      { clientId: CLIENT_ID, scopeId: SCOPE_READ_ID },
      { clientId: CLIENT_ID, scopeId: SCOPE_WRITE_ID },
      { clientId: OIDC_CLIENT_ID, scopeId: SCOPE_OPENID_ID },
      { clientId: OIDC_CLIENT_ID, scopeId: SCOPE_EMAIL_ID },
      { clientId: OIDC_CLIENT_ID, scopeId: SCOPE_PROFILE_ID },
    ])
    .onConflictDoNothing();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await seed();
  process.exit(0);
}
