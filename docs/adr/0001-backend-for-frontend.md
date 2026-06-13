# Adopt a Backend-for-Frontend; remove in-browser token storage

## Status

accepted

## Context

The original web client was a static SvelteKit SPA that ran the Authorization Code + PKCE flow entirely in the browser and kept the OAuth tokens client-side — the access token in memory and the **refresh token in a JavaScript-readable cookie**. The code carried a prominent caveat admitting this is XSS-exfiltratable and not production-grade; it was a deliberate teaching shortcut. The repo's original premise was that the whole flow should be *visible in the browser*.

## Decision

Turn the SvelteKit app into a **Backend-for-Frontend (BFF)**: SvelteKit moves from `adapter-static`/`ssr=false` to `adapter-node` with server routes, becomes a **confidential** OAuth client (secret + PKCE), and holds all tokens in a server-side in-memory session store. The browser receives only an opaque `Secure; HttpOnly; SameSite=Strict` session cookie and talks exclusively to same-origin BFF endpoints. The in-browser token storage (`browser_storage.ts`, the client-side `callback`/`refresh` logic) is removed.

## Consequences

- We deliberately give up the "OAuth visible in the browser" teaching premise — the tokens are now invisible to devtools by design. This ADR is the record of that trade so a future reader doesn't "restore" in-browser tokens thinking it was an oversight.
- The BFF is the only place that performs token exchange, refresh, and id_token validation; the browser cannot reach the AS's token/resource endpoints.
- Flips the seeded client from public to confidential, which in turn makes client-secret-at-rest (bcrypt) and constant-time verification live code paths.
- Hand-rolled id_token validation in the BFF (using `jose` for crypto) becomes the highest-risk new code and is held to an explicit `iss`/`aud`/`exp`/`nonce`/alg-pinned checklist with dedicated tests.
