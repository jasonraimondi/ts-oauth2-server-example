# @jmondi/oauth2-server-example

An example implementation of [@jmondi/oauth2-server](https://github.com/jasonraimondi/ts-oauth2-server) using a [Hono](https://hono.dev) server and a SvelteKit client. It shows how to wire the package into a realistic app: a full authorization-code + PKCE flow with **real user consent**, OpenID Connect, refresh and revocation, and a browser client that consumes it.

> This repo targets **@jmondi/oauth2-server v5** (currently `5.0.0-rc.1`), which is what enables the Fetch `vanilla` adapter and the OIDC endpoints used here. npm `latest` is still v4, so the v5-only APIs in this example are expected.

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
| `POST /api/logout`                      | clears the session cookie                                                |
| `GET/POST /api/oauth2/userinfo`         | OIDC userinfo (bearer-authenticated, scope-filtered)                     |
| `GET /.well-known/openid-configuration` | OIDC discovery document                                                  |
| `GET /.well-known/jwks.json`            | public signing key (JWKS)                                                |

## OpenID Connect

OIDC is enabled on the authorization-code flow. Requesting the `openid` scope adds an `id_token` (RS256) to the token response. OIDC tokens are signed with an RSA key from `OIDC_PRIVATE_KEY` (or an ephemeral key generated at boot if unset — handy for dev, but tokens won't survive a restart). The seeded **OIDC Demo Client** is granted `openid`, `email`, and `profile`.

## Getting Started

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

Both clients are **public** (no secret) with redirect URI `http://localhost:5173/callback`, so PKCE (S256) is mandatory.

## Driving the flow

**In the browser:** start both servers, open the client at `http://localhost:5173/login`, sign in with the seeded user, approve the consent screen, and you'll land on the callback with tokens.

**By hand with `curl`** (the OIDC Demo Client, end to end). The login/consent forms are browser routes protected by Origin-based CSRF, so we use a cookie jar and send a matching `Origin` header:

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

## The browser client

The SvelteKit client in [`web/`](web/) demonstrates a **public** client: it generates a PKCE verifier/challenge and a `state` (full-entropy, via `crypto.getRandomValues`), keeps them in `sessionStorage` across the redirect, verifies `state` on the callback, and sends **no** `client_secret`.

To keep the access token out of script-readable storage, it is held **in memory** and is intentionally cleared on page reload (use the refresh button to mint a new one). See the security caveat below.

## Adapting for production

This repo optimizes for being readable and runnable on `localhost`. Before shipping anything like it, change at least:

- **Session cookie `Secure`** — gated to `NODE_ENV === "production"` here so the demo works over plain `http://localhost`. Production must serve over HTTPS with `Secure` on.
- **`SESSION_SECRET`** — the browser session cookie (`jid`) is an HS256 JWT signed with a secret that is deliberately **separate** from the OIDC RSA key (different trust domains). A hardcoded insecure default is used if unset (with a warning) — set a long random `SESSION_SECRET` in production.
- **`OIDC_PRIVATE_KEY`** — set a stable PEM so issued tokens survive restarts; otherwise an ephemeral key is generated at boot.
- **Browser token storage** — the SPA stores the **refresh token** in a JS-readable cookie _for demo visibility only_. That is an XSS → token-theft (account-takeover) vector. A production browser app should not hold the refresh token at all; use a Backend-for-Frontend (BFF) that keeps it server-side behind a `Secure; HttpOnly; SameSite` cookie. This is called out in `web/src/lib/browser_storage.ts`.
- **Trusted proxy** — `lastLoginIP` is read from `X-Forwarded-For`, which is client-spoofable unless a trusted reverse proxy sets it.
- **Consent persistence** — this demo asks for consent on every authorization; a real OP typically remembers prior grants per user+client.

### Known package limitation

In `5.0.0-rc.1`, `authorizationServer.revoke()` for an **access** token is dispatched to the client-credentials grant and is effectively a no-op, so the access-token row is not force-expired. Refresh-token revocation works, and the `/userinfo` revocation guard (`getByAccessToken` + `isAccessTokenRevoked`) works when a token is expired/revoked. The tests therefore assert revocation by expiring the row directly.

## Tests

```bash
pnpm test          # Vitest integration suite against a real Postgres "oauth_test" db
```

The suite covers the auth-code + PKCE happy path, refresh, revocation and userinfo, OIDC claims, the consent accept/deny branches, PKCE negatives (missing challenge/verifier, `plain` rejected), `redirect_uri` mismatch, and login hardening (unknown-email and null-hash both return a generic 401). It runs serially against one shared database with between-test truncation.
