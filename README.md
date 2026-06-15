# @jmondi/oauth2-server-example

[![CI](https://github.com/jasonraimondi/ts-oauth2-server-example/actions/workflows/ci.yml/badge.svg)](https://github.com/jasonraimondi/ts-oauth2-server-example/actions/workflows/ci.yml)

An example implementation of [@jmondi/oauth2-server](https://github.com/jasonraimondi/ts-oauth2-server) using a [Hono](https://hono.dev) server and a SvelteKit client. It wires the package into a realistic app — a full authorization-code + PKCE flow with **real user consent**, OpenID Connect, token refresh and revocation, and a browser client that consumes it. The goal is a blueprint you can read end to end, not a "hello world".

> [!NOTE]
> This repo targets **@jmondi/oauth2-server v5** (currently `5.0.0-rc.2`), which is what enables the Fetch `vanilla` adapter and the OIDC endpoints used here. npm `latest` is still v4, so the v5-only APIs in this example are expected.

## Features

- **Authorization Code + PKCE** — S256 is mandatory for every client (the public demo clients and the confidential BFF alike).
- **A real consent step** — `GET /authorize` never auto-approves; the consent form honors both accept and deny.
- **OpenID Connect** — `id_token` (RS256) on the code flow, plus discovery, JWKS, and userinfo endpoints.
- **Refresh & revocation** — a refresh-token grant and an RFC 7009 revoke endpoint.
- **Server-rendered auth UI** — login + consent forms in Hono JSX, behind Origin-based CSRF.
- **Fetch-native** — Hono's `Request`/`Response` bridged to the package via the `vanilla` adapter.
- **Backend-for-Frontend (BFF)** — the SvelteKit app is a confidential client that holds all tokens server-side; the browser never sees them ([ADR-0001](docs/adr/0001-backend-for-frontend.md)).
- **Security hardening** — bcrypt-hashed client secrets, a scope-gated `/api/contacts` resource, revocable sessions (`tokenVersion`), per-IP rate limiting, refresh-token reuse detection (RFC 9700), and secrets that fail closed in production.

## Stack

- **Server** — [Hono](https://hono.dev) on Node (`@hono/node-server`), listening on port `3000` with all routes under the `/api` prefix.
- **Database** — PostgreSQL via [Drizzle ORM](https://orm.drizzle.team) (postgres.js driver).
- **Views** — server-rendered login + consent forms using [Hono JSX](https://hono.dev/docs/guides/jsx).
- **Tests** — [Vitest](https://vitest.dev) integration suite running against a real Postgres test database.
- **Client** — SvelteKit (Svelte 5) app in [`web/`](web/).

The OAuth2 HTTP endpoints bridge Hono's Fetch `Request`/`Response` to the package via the `@jmondi/oauth2-server/vanilla` adapter (`requestFromVanilla` / `responseToVanilla` / `handleVanillaError`).

## Endpoints

| Route                                   | Purpose                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------ |
| `POST /api/oauth2/token`                | token endpoint (authorization_code, refresh_token)                       |
| `POST /api/oauth2/revoke`               | token revocation                                                         |
| `GET /api/oauth2/authorize`             | starts the flow; redirects to login or consent (never auto-approves)     |
| `GET/POST /api/login`                   | server-rendered login form + session cookie                              |
| `GET/POST /api/scopes`                  | server-rendered **consent** form; `POST` completes or denies the request |
| `POST /api/logout`                      | revokes the session (bumps `tokenVersion`) and clears the cookie         |
| `GET/POST /api/oauth2/userinfo`         | OIDC userinfo (bearer-authenticated, scope-filtered)                     |
| `GET /api/contacts`                     | scope-gated resource (Bearer + `contacts.read`; revoked token → 401)     |
| `GET /.well-known/openid-configuration` | OIDC discovery document                                                  |
| `GET /.well-known/jwks.json`            | public signing key (JWKS)                                                |

## OpenID Connect

OIDC is enabled on the authorization-code flow. Requesting the `openid` scope adds an `id_token` (RS256) to the token response. OIDC tokens are signed with an RSA key from `OIDC_PRIVATE_KEY` (or an ephemeral key generated at boot if unset — handy for dev, but tokens won't survive a restart). The seeded **OIDC Demo Client** is granted `openid`, `email`, and `profile`.

## Getting Started

**Prerequisites:** [Node.js](https://nodejs.org) >= 22, [pnpm](https://pnpm.io) (`npm i -g pnpm`), and [Docker](https://www.docker.com) for Postgres.

```bash
cp -n .env.example .env   # the defaults already match the bundled docker-compose

pnpm install
cd web && pnpm install && cd ..   # the web client is a standalone pnpm project

docker compose up -d      # Postgres on localhost:8888
pnpm db:migrate
pnpm db:seed
```

Then run both processes. The simplest path is two terminals:

```bash
pnpm dev                  # server on http://localhost:3000 (tsx watch)
cd web && pnpm dev        # client on http://localhost:5173
```

Or run both at once with a Procfile manager — [Overmind](https://github.com/DarthSim/overmind) (`brew install overmind`) or [Foreman](https://github.com/ddollar/foreman) (`gem install foreman`):

```bash
overmind start            # or: foreman start
```

## Seeded data

`pnpm db:seed` creates:

- **User** — `jason@example.com` / `password123`
- **Sample Client** (public, PKCE) — `0e2ec2df-ee53-4327-a472-9d78c278bdbb`, scopes `contacts.read contacts.write`
- **OIDC Demo Client** (public, PKCE) — `9b8c7d6e-5f40-4a3b-8c2d-1e0f9a8b7c6d`, scopes `openid email profile`
- **BFF Web Client** (confidential, PKCE) — `b1ff0000-0000-4000-8000-000000000001`, scopes `openid email contacts.read contacts.write`

The Sample and OIDC Demo clients are **public** (PKCE only, redirect `http://localhost:5173/callback`). The **BFF Web Client** is **confidential** (redirect `http://localhost:5173/auth/callback`): its secret is stored as a bcrypt hash, and the plaintext lives only in the BFF's env (dev default `bff-dev-secret-change-me`).

## Driving the flow

**In the browser:** start both servers, open `http://localhost:5173`, click **Log in** (the BFF starts the OAuth redirect), sign in with the seeded user, and approve the consent screen — you'll land back home, signed in. The tokens stay on the server; click **Load contacts** to have the BFF spend the access token against the protected `/api/contacts` resource.

**By hand with `curl`** (driving the AS directly with the public OIDC Demo Client, end to end). The login/consent forms are browser routes protected by Origin-based CSRF, so we use a cookie jar and send a matching `Origin` header:

```bash
CLIENT_ID=9b8c7d6e-5f40-4a3b-8c2d-1e0f9a8b7c6d
REDIRECT=http://localhost:5173/callback
JAR=$(mktemp)

# 1. PKCE: generate a verifier and its S256 challenge
VERIFIER=$(openssl rand -hex 32)
CHALLENGE=$(printf '%s' "$VERIFIER" | openssl dgst -binary -sha256 | openssl base64 | tr '+/' '-_' | tr -d '=')
STATE=$(openssl rand -hex 8)
QUERY="response_type=code&client_id=$CLIENT_ID&redirect_uri=$REDIRECT&scope=openid%20email%20profile&state=$STATE&code_challenge=$CHALLENGE&code_challenge_method=S256"

# 2. Log in — sets the "jid" session cookie (302 back to /authorize)
curl -s -c "$JAR" -H "Origin: http://localhost:3000" \
  --data-urlencode "email=jason@example.com" --data-urlencode "password=password123" \
  "http://localhost:3000/api/login?$QUERY" -o /dev/null

# 3. Consent — approve, and the server redirects to the callback with ?code=...
LOCATION=$(curl -s -b "$JAR" -H "Origin: http://localhost:3000" \
  --data-urlencode "accept=yes" \
  "http://localhost:3000/api/scopes?$QUERY" -o /dev/null -w '%{redirect_url}')
CODE=$(printf '%s' "$LOCATION" | sed -n 's/.*[?&]code=\([^&]*\).*/\1/p')
#   (sending accept=no instead yields ...callback?error=access_denied — consent is real)

# 4. Exchange the code (+ the original verifier) for tokens
TOKENS=$(curl -s http://localhost:3000/api/oauth2/token \
  --data-urlencode grant_type=authorization_code \
  --data-urlencode "client_id=$CLIENT_ID" \
  --data-urlencode "redirect_uri=$REDIRECT" \
  --data-urlencode "code=$CODE" \
  --data-urlencode "code_verifier=$VERIFIER")
echo "$TOKENS"   # { access_token, refresh_token, id_token, token_type, expires_in, scope }

# 5. Call userinfo with the access token
ACCESS=$(printf '%s' "$TOKENS" | node -e 'console.log(JSON.parse(require("fs").readFileSync(0)).access_token)')
curl -s http://localhost:3000/api/oauth2/userinfo -H "Authorization: Bearer $ACCESS"
#   -> {"email":"jason@example.com","name":"Jason Example","sub":"..."}

# 6. Refresh
REFRESH=$(printf '%s' "$TOKENS" | node -e 'console.log(JSON.parse(require("fs").readFileSync(0)).refresh_token)')
curl -s http://localhost:3000/api/oauth2/token \
  --data-urlencode grant_type=refresh_token \
  --data-urlencode "client_id=$CLIENT_ID" \
  --data-urlencode "refresh_token=$REFRESH"
```

## How consent works

`GET /api/oauth2/authorize` validates the request and then redirects to `/api/login` (no session) or `/api/scopes` (session present) — it **never** auto-approves. `POST /api/scopes` reads the user's decision: `accept=yes` calls `completeAuthorizationRequest` and issues a code; anything else bounces back to the client's `redirect_uri` with `error=access_denied`. This is the consent step a real authorization server must implement, and it's the part most "hello world" examples skip.

## The Backend-for-Frontend (BFF)

The SvelteKit app in [`web/`](web/) is a **Backend-for-Frontend**, not a token-holding SPA. Its server side is a **confidential** OAuth client: it runs Authorization Code + PKCE, validates the `id_token` (`iss`/`aud`/`exp`/`nonce`, RS256-pinned via [`jose`](https://github.com/panva/jose)), and keeps the access/refresh/id tokens **server-side**. The browser receives only an opaque `HttpOnly; Secure; SameSite=Strict` session cookie and talks exclusively to same-origin BFF endpoints:

| Route                | Purpose                                                                          |
| -------------------- | -------------------------------------------------------------------------------- |
| `GET /auth/login`    | starts the flow — CSPRNG `state`/`nonce`/PKCE stashed server-side                |
| `GET /auth/callback` | exchanges the code, validates the `id_token`, creates the session                |
| `GET /api/me`        | the signed-in identity (`id_token` + userinfo `email`) — never tokens            |
| `GET /api/contacts`  | proxies the protected resource, attaching the Bearer token (refreshing if stale) |
| `POST /auth/logout`  | revokes the refresh token at the AS and destroys the session                     |

Endpoints come from OIDC **discovery**, never hardcoded. This is exactly the pattern the old in-browser-token caveat recommended — see [ADR-0001](docs/adr/0001-backend-for-frontend.md). The security-critical pieces (id_token validation, the session store) are unit-tested in [`web/src/lib/server`](web/src/lib/server).

## Adapting for production

> [!WARNING]
> This repo optimizes for being readable and runnable on `localhost`. Don't ship it as-is — at least change the following:

- **Session cookie `Secure`** — gated to `NODE_ENV === "production"` here so the demo works over plain `http://localhost`. Production must serve over HTTPS with `Secure` on.
- **`SESSION_SECRET`** — the browser session cookie (`jid`) is an HS256 JWT signed with a secret that is deliberately **separate** from the OIDC RSA key (different trust domains). Outside production a warned dev default is used; **in production a missing or default value fails closed** — the server refuses to boot. Set a long random `SESSION_SECRET`.
- **`OIDC_PRIVATE_KEY`** — set a stable PEM so issued tokens survive restarts. Outside production an ephemeral key is generated at boot; **in production a missing key fails closed** rather than generating one.
- **BFF session store** — the BFF keeps sessions (and the tokens they hold) in a **per-process in-memory map**, so they're lost on restart and don't span instances. A multi-instance deployment needs a shared store (e.g. Redis) — and a shared refresh lock: the BFF single-flights token refresh per session so concurrent requests don't replay a rotated refresh token into the AS's reuse detection (which revokes the whole family), but that guard is per-process only.
- **Trusted proxy** — `lastLoginIP` and the rate limiter read the client IP from `X-Forwarded-For`, which is client-spoofable unless a trusted reverse proxy sets it.
- **Consent persistence** — this demo asks for consent on every authorization; a real OP typically remembers prior grants per user+client.

### Revocation requires client authentication

> [!IMPORTANT]
> The RFC 7009 revoke endpoint force-expires **both** access and refresh tokens, but `authenticateRevoke` defaults to `true`, so the request must authenticate the client (`client_id`, plus `client_secret` for a confidential client). An unauthenticated revoke returns a silent `200` and revokes nothing — RFC 7009 returns `200` even for invalid tokens, so a failed revoke is indistinguishable from a successful one. The suite asserts revocation without the endpoint: by force-expiring the stored row directly, and through the `/userinfo` guard (`getByAccessToken` + `isAccessTokenRevoked`).

## Tests

```bash
pnpm test          # Vitest integration suite against a real Postgres "oauth_test" db
```

The suite covers the auth-code + PKCE happy path, refresh, revocation and userinfo, OIDC claims, the consent accept/deny branches, PKCE negatives (missing challenge/verifier, `plain` rejected), `redirect_uri` mismatch, and login hardening (unknown-email and null-hash both return a generic 401). It runs serially against one shared database with between-test truncation.
