import { describe, expect, it } from "vitest";

import { Login } from "../src/views/Login.js";
import { Scopes } from "../src/views/Scopes.js";
import type { OAuthClient, OAuthScope } from "@jmondi/oauth2-server";

const client = { name: "Example BFF" } as OAuthClient;
const scope = { name: "contacts.read", description: "Read your contacts" } as OAuthScope;

function render(node: unknown): string {
  return String(node);
}

describe("Login view", () => {
  it("never ships a working credential in an input value", () => {
    const html = render(Login({ action: "/api/login" }));

    expect(html).not.toMatch(/value="password123"/);
    expect(html).not.toMatch(/value="jason@example.com"/);
    expect(html).toContain("Demo user: jason@example.com / password123");
  });

  it("renders the error as an alert and preserves the typed email", () => {
    const html = render(
      Login({ action: "/api/login", error: "Email or password is incorrect.", email: "a@b.co" }),
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain("Email or password is incorrect.");
    expect(html).toContain('value="a@b.co"');
  });

  it("caps the password at the server's limit", () => {
    expect(render(Login({ action: "/api/login" }))).toContain('maxlength="256"');
  });
});

describe("Scopes view", () => {
  it("names the client in a heading and the user who is consenting", () => {
    const html = render(
      Scopes({
        action: "/api/scopes",
        client,
        scopes: [scope],
        userEmail: "jason@example.com",
      }),
    );

    expect(html).toContain("<h1>Authorize Example BFF</h1>");
    expect(html).toContain("Signed in as jason@example.com");
    expect(html).toContain("Read your contacts");
  });

  it("falls back to the scope name when it has no description", () => {
    const html = render(
      Scopes({ action: "/api/scopes", client, scopes: [{ name: "contacts.read" } as OAuthScope] }),
    );

    expect(html).toContain("contacts.read");
    expect(html).not.toContain("Signed in as");
  });
});
