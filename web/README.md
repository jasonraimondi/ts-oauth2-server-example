# OAuth2 / OIDC example client

A small SvelteKit single-page app that demonstrates how a **public** browser
client consumes the OAuth2 / OpenID Connect server in this repository
(built on [`@jmondi/oauth2-server`](https://github.com/jasonraimondi/ts-oauth2-server)).

It walks through the full Authorization Code flow with PKCE:

- **`/login`** — generates a PKCE `code_verifier`/`code_challenge` (S256) and a
  random `state`, stashes them in `sessionStorage`, and redirects the browser to
  the server's `/api/oauth2/authorize` endpoint requesting the
  `contacts.read contacts.write` scopes.
- **`/callback`** — handles the redirect back: surfaces any `error` from the
  server, verifies `state`, then exchanges the `code` (plus the stored
  `code_verifier`) for tokens at `/api/oauth2/token`. No client secret is sent —
  this is a public PKCE client.
- **`/refresh`** — exchanges the stored refresh token for a fresh access token.
- **`/`** — shows the current tokens.

## Token storage — DEMO ONLY

> [!WARNING]
> This client stores the **refresh token in a script-readable cookie** purely so
> the flow is easy to inspect while learning. That is a teaching shortcut, not a
> recommendation: any XSS bug could read it and take over the account. A real
> browser app should not hold the refresh token at all — use a
> Backend-for-Frontend (BFF) that keeps it server-side behind a `Secure`,
> `HttpOnly` cookie. As a partial mitigation, this demo keeps the short-lived
> **access token in memory only** (see `src/lib/browser_storage.ts`).

## Seeded client

The dev server seeds a public client you can use immediately:

| Field          | Value                                  |
| -------------- | -------------------------------------- |
| `client_id`    | `0e2ec2df-ee53-4327-a472-9d78c278bdbb` |
| `redirect_uri` | `http://localhost:5173/callback`       |
| `scopes`       | `contacts.read contacts.write`         |
| auth method    | none (public, PKCE + S256 required)    |

These values live in `src/lib/auth.ts`.

## Running it

This `web/` directory is its own standalone pnpm project (independent of the
repo root), so install it on its own:

```bash
# from web/
pnpm install --ignore-workspace
```

Start the OAuth2 server first (it listens on `http://localhost:3000`; see the
repository root README), then start this client:

```bash
pnpm dev
```

The dev server runs on `http://localhost:5173` and proxies `/api/*` through to
the OAuth2 server on port 3000, so the redirect URIs and seeded client above
work out of the box. Open <http://localhost:5173/login> to start the flow.

## Scripts

- `pnpm dev` — start the Vite dev server
- `pnpm build` — produce a static SPA build (in `build/`) via `adapter-static`
- `pnpm preview` — preview the production build
- `pnpm check` — type-check with `svelte-check`
- `pnpm lint` / `pnpm format` — check / apply Prettier formatting

## Stack

SvelteKit 2 · Svelte 5 (runes) · Vite 7 · TypeScript 5 · Prettier 3.
The app runs entirely in the browser (`ssr`/`prerender` disabled in
`src/routes/+layout.ts`), so `adapter-static` emits an SPA with an
`index.html` fallback.
