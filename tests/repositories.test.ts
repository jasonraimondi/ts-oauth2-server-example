import { describe, expect, it } from "vitest";

import { db } from "../src/db/index.js";
import { ClientRepository } from "../src/app/oauth/repositories/client_repository.js";
import { ScopeRepository } from "../src/app/oauth/repositories/scope_repository.js";
import { UserRepository } from "../src/app/oauth/repositories/user_repository.js";

const SEEDED_CLIENT_ID = "0e2ec2df-ee53-4327-a472-9d78c278bdbb";
const SEEDED_USER_ID = "dd74961a-c348-4471-98a5-19fc3c5b5079";

describe("ClientRepository", () => {
  const repository = new ClientRepository(db);

  it("getByIdentifier loads the client with both linked scopes", async () => {
    const client = await repository.getByIdentifier(SEEDED_CLIENT_ID);

    expect(client.id).toBe(SEEDED_CLIENT_ID);
    const names = client.scopes.map(s => s.name);
    expect(names).toContain("contacts.read");
    expect(names).toContain("contacts.write");
  });

  it("getByIdentifier rejects for an unknown id", async () => {
    await expect(
      repository.getByIdentifier("00000000-0000-0000-0000-000000000000"),
    ).rejects.toThrow();
  });
});

describe("ScopeRepository", () => {
  const repository = new ScopeRepository(db);

  it("getAllByIdentifiers returns exactly one scope for a single name", async () => {
    const scopes = await repository.getAllByIdentifiers(["contacts.read"]);
    expect(scopes).toHaveLength(1);
    expect(scopes[0]?.name).toBe("contacts.read");
  });

  it("getAllByIdentifiers returns two scopes for two names", async () => {
    const scopes = await repository.getAllByIdentifiers(["contacts.read", "contacts.write"]);
    expect(scopes).toHaveLength(2);
  });

  it("finalize returns the scopes verbatim", async () => {
    const scopes = await repository.getAllByIdentifiers(["contacts.read"]);
    const finalized = await repository.finalize(scopes, "client_credentials", {} as never);
    expect(finalized).toBe(scopes);
  });
});

describe("UserRepository", () => {
  const repository = new UserRepository(db);

  it("getUserByCredentials returns the user with a correct password", async () => {
    const user = await repository.getUserByCredentials(SEEDED_USER_ID, "password123");
    expect(user.email).toBe("jason@example.com");
  });

  it("getUserByCredentials rejects with a wrong password", async () => {
    await expect(
      repository.getUserByCredentials(SEEDED_USER_ID, "wrong-password"),
    ).rejects.toThrow();
  });

  it("getUserByCredentials returns the user when no password is supplied", async () => {
    const user = await repository.getUserByCredentials(SEEDED_USER_ID);
    expect(user.email).toBe("jason@example.com");
  });
});
