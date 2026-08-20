# OAuth2 / OIDC example client (Backend-for-Frontend)

A SvelteKit app that is the **Backend-for-Frontend (BFF)** for the authorization server in this repository (built on [`@jmondi/oauth2-server`](https://github.com/jasonraimondi/ts-oauth2-server)).

The SvelteKit server _is_ the OAuth **Client**. It is a **confidential client**: it authenticates to the Authorization Server (AS) with a `client_secret` and PKCE, it runs the Authorization Code flow server-to-server, and it keeps the access, refresh, and id tokens server-side. The browser receives only an opaque `sid` cookie. The browser never sees a token and never calls the AS.

Read [ADR-0001](../docs/adr/0001-backend-for-frontend.md) for the decision and its consequences. Read [CONTEXT.md](../CONTEXT.md) for the vocabulary — AS Session vs BFF Session, Consent vs Grant.

## How a login works

1. The browser requests `GET /auth/login`. The BFF generates a CSPRNG `state`, a `nonce`, and a PKCE verifier and S256 challenge. It stores them server-side, keyed by `state`, then redirects the browser to the AS.
2. The Resource Owner signs in at the AS and approves the consent screen.
3. The AS redirects the browser back to `GET /auth/callback`. The BFF consumes the pending record for that `state`. A missing record is a failed CSRF check.
4. The BFF exchanges the code for tokens, server-to-server, with the client secret and the PKCE verifier.
5. The BFF validates the `id_token`: `iss`, `aud`, `exp`, `nonce`, and an RS256 algorithm pin. [`jose`](https://github.com/panva/jose) does the crypto and resolves the JWKS.
6. The BFF creates a **BFF Session**, holds the tokens in it, and sets the `sid` cookie.

Every AS endpoint comes from OIDC **discovery**. No endpoint is hardcoded. The `issuer` in the discovery document must byte-match the configured `OIDC_ISSUER`.

## Routes

| Route                | Kind          | Purpose                                                                                |
| -------------------- | ------------- | -------------------------------------------------------------------------------------- |
| `GET /`              | page + `load` | The home page. `+page.server.ts` returns the signed-in user. Rendered on the server.   |
| `POST /?/logout`     | form action   | Revokes the refresh token at the AS (best effort), destroys the session, clears `sid`. |
| `GET /auth/login`    | endpoint      | Starts the Authorization Code + PKCE flow.                                             |
| `GET /auth/callback` | endpoint      | Exchanges the code, validates the `id_token`, creates the BFF Session.                 |
| `GET /api/contacts`  | endpoint      | Proxies the protected resource with the Bearer token, and refreshes it first if stale. |

`src/hooks.server.ts` reads the `sid` cookie on every request, resolves it to `event.locals.session`, and clears the cookie when the session is gone. The identity therefore reaches the page through `load`, not through a browser fetch. There is no `/api/me` endpoint and no `onMount` identity call.

Denied consent is a normal outcome, not an error. The callback redirects to `/?auth_error=access_denied`, and the home page shows a status banner. An expired login state gives `/?auth_error=expired_state`. `+error.svelte` covers the genuinely exceptional cases.

## Session and cookie

The `sid` cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` outside development. It holds an opaque identifier only.

`SameSite=Lax` is deliberate. `Strict` can drop the cookie on the landing navigation after a cross-site callback. `Lax` still blocks cross-site POSTs, and SvelteKit's origin check covers the logout form action.

The tokens live in the session record on the server. The BFF refreshes an expired access token before it proxies a request. Concurrent requests share one refresh through a per-session single-flight guard. Without that guard the second request replays an already-rotated refresh token, the AS reads it as theft under RFC 9700, and the whole token family is revoked.

## Swapping the session store

`src/lib/server/session.ts` defines a `SessionStore<T>` interface. `MemoryStore` implements it. `setSessionStore()` injects a different implementation.

The default store is a per-process in-memory map. Sessions are lost on restart and do not span instances. For more than one instance, implement `SessionStore<T>` against Redis or another shared store, and inject it at startup. A shared store also needs a shared refresh lock, because the single-flight guard is per-process.

This repository ships no Redis implementation on purpose. The interface is the seam. The implementation is yours.

## Environment

The server-side variables are read through `$env/dynamic/private`. They never reach the browser. The dev defaults in `src/lib/server/config.ts` match the seeded **BFF Web Client**, so the demo runs with no `.env` file.

| Variable              | Default                                | Purpose                                                                      |
| --------------------- | -------------------------------------- | ---------------------------------------------------------------------------- |
| `OIDC_ISSUER`         | `http://localhost:3000`                | The AS issuer. Must byte-match the discovery document.                       |
| `OAUTH_CLIENT_ID`     | `b1ff0000-0000-4000-8000-000000000001` | The seeded confidential client.                                              |
| `OAUTH_CLIENT_SECRET` | `bff-dev-secret-change-me`             | The plaintext secret. The AS stores only its bcrypt hash.                    |
| `OAUTH_REDIRECT_URI`  | `http://localhost:5173/auth/callback`  | Must match the seeded redirect URI exactly.                                  |
| `ORIGIN`              | _(unset)_                              | adapter-node only. The public origin, for example `https://app.example.com`. |
| `PORT`                | `3000`                                 | adapter-node only. The port the built server listens on.                     |

`OAUTH_CLIENT_SECRET` is published in this repository as a demo value. The BFF refuses to run with that literal secret outside development. Set a real secret before you deploy.

Set `ORIGIN` when a TLS-terminating proxy sits in front of the BFF. Without it, adapter-node derives the origin from the `Host` header, and SvelteKit's origin CSRF check rejects the logout form action.

## Running it

This directory is a standalone pnpm project, independent of the repository root.

```bash
pnpm install --ignore-workspace
```

Start the AS first on `http://localhost:3000`. See the [root README](../README.md). Then start this app:

```bash
pnpm dev
```

Open <http://localhost:5173> and click **Log in**. Sign in as `jason@example.com` / `password123` and approve the consent screen. These are seeded demo credentials, published on purpose.

## Deploying

`pnpm build` produces a Node server in `build/`. Start it with `node build`, which is the `start` script.

This is **not** a static site. `adapter-static` went away with the SPA. Do not deploy `build/` to a static host.

```bash
pnpm build
ORIGIN=https://app.example.com OAUTH_CLIENT_SECRET=... node build
```

Serverless targets do not work with the default session store, because each invocation gets its own memory. `@sveltejs/adapter-auto` is deliberately absent for the same reason: a switch to it silently breaks the in-memory store.

## Demo limitations

- **In-process session store** — one instance only. See "Swapping the session store".
- **Published dev client secret** — good for `localhost`, refused outside development.
- **No Grant persistence** — the AS asks for consent on every authorization.

## Scripts

- `pnpm dev` — start the Vite dev server on `http://localhost:5173`
- `pnpm build` — build the Node server into `build/`
- `pnpm start` — run the built server (`node build`)
- `pnpm preview` — preview the production build
- `pnpm check` — type-check with `svelte-check`
- `pnpm test` — run the Vitest suite
- `pnpm lint` / `pnpm format` — check / apply Prettier formatting

## Stack

SvelteKit 2 · Svelte 5 (runes) · adapter-node · Vite 7 · TypeScript 5 · `jose` 6 · Vitest · Prettier 3.

The security-critical code is unit-tested in [`src/lib/server`](src/lib/server): `id_token` validation, including `alg:none` and algorithm-confusion attempts; the `state` consume-once path; session TTL and eviction; and the route handlers that mint and destroy the `sid` cookie.
