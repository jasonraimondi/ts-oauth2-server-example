# @jmondi/oauth2-server-example

[![CI](https://github.com/jasonraimondi/ts-oauth2-server-example/actions/workflows/ci.yml/badge.svg)](https://github.com/jasonraimondi/ts-oauth2-server-example/actions/workflows/ci.yml)

An example implementation of [@jmondi/oauth2-server](https://github.com/jasonraimondi/ts-oauth2-server) using a [Hono](https://hono.dev) server and a SvelteKit client. It wires the package into a realistic app — a full authorization-code + PKCE flow with **real user consent**, OpenID Connect, token refresh and revocation, and a browser client that consumes it. The goal is a blueprint you can read end to end, not a "hello world".

> [!NOTE]
> This repo targets **@jmondi/oauth2-server v5** (currently `5.0.0-rc.6`), which is what enables the Fetch `vanilla` adapter and the OIDC endpoints used here. npm `latest` is still v4, so the v5-only APIs in this example are expected.

## Features

- **Authorization Code + PKCE** — S256 is mandatory for every client (the public demo clients and the confidential BFF alike).
- **A real consent step** — `GET /authorize` never auto-approves; the consent form honors both accept and deny.
- **OpenID Connect** — `id_token` (RS256) on the code flow, plus discovery, JWKS, and userinfo endpoints.
- **Refresh & revocation** — a refresh-token grant and an RFC 7009 revoke endpoint.
- **Server-rendered auth UI** — login + consent forms in Hono JSX, behind Origin-based CSRF.
- **Fetch-native** — Hono's `Request`/`Response` bridged to the package via the `vanilla` adapter.
- **Backend-for-Frontend (BFF)** — the SvelteKit app is a confidential client that holds all tokens server-side; the browser never sees them ([ADR-0001](docs/adr/0001-backend-for-frontend.md)).
- **Security hardening** — bcrypt-hashed client secrets, a scope-gated `/api/contacts` resource, revocable sessions (`tokenVersion`), per-IP rate limiting, refresh-token reuse detection (RFC 9700), and secrets that fail closed outside development.

## Stack

- **Server** — [Hono](https://hono.dev) on Node (`@hono/node-server`), listening on port `3000` with all routes under the `/api` prefix. The same app also deploys to [Cloudflare Workers](#cloudflare-workers) via `src/worker.ts`.
- **Database** — SQLite via [Drizzle ORM](https://orm.drizzle.team) (`@libsql/client`, a plain `file:` database).
- **Views** — server-rendered login + consent forms using [Hono JSX](https://hono.dev/docs/guides/jsx).
- **Tests** — [Vitest](https://vitest.dev) integration suite running against a throwaway SQLite file.
- **Client** — SvelteKit (Svelte 5) app in [`example-client/`](example-client/).

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
| `GET /healthz`                          | liveness probe; touches nothing, always 200 while the process runs       |
| `GET /readyz`                           | readiness probe; runs `select 1`, returns 503 when the database is down  |

## OpenID Connect

OIDC is enabled on the authorization-code flow. Requesting the `openid` scope adds an `id_token` (RS256) to the token response. OIDC tokens are signed with an RSA key from `OIDC_PRIVATE_KEY`. In `development` and `test` an ephemeral key is generated at boot when the variable is unset, so tokens do not survive a restart; anywhere else a missing key stops the boot. The seeded **OIDC Demo Client** is granted `openid`, `email`, and `profile`.

## Getting Started

**Prerequisites:** [Node.js](https://nodejs.org) >= 22 and [pnpm](https://pnpm.io) (`npm i -g pnpm`). The toolchain versions are pinned in `mise.toml` — with [mise](https://mise.jdx.dev) installed, `mise install` gets you the right Node and pnpm.

```bash
cp -n .env.example .env   # the defaults point at data/oauth.db

pnpm install
cd example-client && pnpm install --ignore-workspace && cd ..   # the client is a standalone pnpm project

pnpm db:migrate           # creates data/oauth.db
pnpm db:seed
```

`--ignore-workspace` is required. The client carries its own lockfile and must not be resolved against the root workspace.

Then run both processes. The simplest path is two terminals:

```bash
pnpm dev                  # server on http://localhost:3000 (tsx watch)
cd example-client && pnpm dev   # client on http://localhost:5173
```

Or run both at once with a Procfile manager — [Overmind](https://github.com/DarthSim/overmind) (`brew install overmind`) or [Foreman](https://github.com/ddollar/foreman) (`gem install foreman`):

```bash
overmind start            # or: foreman start
```

To start over from an empty database, run `pnpm db:reset`. It deletes `data/oauth.db`, migrates, and seeds.

## Scripts

| Script                 | What it does                                                          |
| ---------------------- | --------------------------------------------------------------------- |
| `pnpm dev`             | run the server in watch mode (`tsx`)                                  |
| `pnpm typecheck`       | type-check only (`tsc --noEmit`)                                      |
| `pnpm build`           | compile to `dist/` (`tsc -p tsconfig.build.json`)                     |
| `pnpm start`           | run the compiled server (`node dist/index.js`)                        |
| `pnpm test`            | run the Vitest suite against the `oauth_test` database                |
| `pnpm test:coverage`   | the same suite with a v8 coverage report                              |
| `pnpm db:generate`     | generate a Drizzle migration from the schema                          |
| `pnpm db:migrate`      | apply migrations with `drizzle-kit` (development)                     |
| `pnpm db:migrate:prod` | apply migrations from the compiled output (`node dist/db/migrate.js`) |
| `pnpm db:seed`         | seed the demo user, clients, and scopes                               |
| `pnpm db:prune`        | delete expired token and auth-code rows                               |
| `pnpm db:reset`        | delete the SQLite file, then migrate and seed a fresh database        |
| `pnpm cf:dev`          | serve the Worker entry point locally with `wrangler dev`              |
| `pnpm cf:migrate`      | apply `drizzle/*.sql` to D1 (`--local` or `--remote`)                 |
| `pnpm cf:seed`         | replay the seeded rows from `data/oauth.db` into D1                   |
| `pnpm cf:deploy`       | deploy the Worker with `wrangler deploy`                              |
| `pnpm lint`            | lint with oxlint                                                      |
| `pnpm format`          | format with Prettier                                                  |

## Configuration

Server configuration is read from the environment once at boot and validated with zod. An invalid value stops the process with a readable message instead of failing later. See `.env.example` for the annotated list.

| Variable           | Default                 | Notes                                                                                                   |
| ------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`         | `development`           | `development` and `test` enable the insecure demo defaults. Anything else fails closed.                 |
| `PORT`             | `3000`                  | The port the server listens on.                                                                         |
| `DATABASE_URL`     | _(required)_            | libsql URL of the SQLite file, e.g. `file:./data/oauth.db`.                                             |
| `OIDC_ISSUER`      | `http://localhost:3000` | Must byte-match the externally reachable base URL. No trailing slash. Must be `https://` in production. |
| `OIDC_PRIVATE_KEY` | _(none)_                | RSA private key (PEM) for OIDC token signing. Required outside development.                             |
| `SESSION_SECRET`   | _(none)_                | HS256 secret for the `jid` AS Session cookie. Required outside development.                             |
| `LOGIN_RATE_MAX`   | `10`                    | Login attempts per IP per 15 minutes.                                                                   |
| `TOKEN_RATE_MAX`   | `60`                    | Failed token requests per IP per minute.                                                                |
| `TRUST_PROXY`      | `false`                 | Set to `true` only behind a reverse proxy that overwrites `X-Forwarded-For`.                            |

`NODE_ENV` is the master switch. The insecure conveniences — the dev `SESSION_SECRET`, the ephemeral OIDC key, and a `jid` cookie without `Secure` — exist only when `NODE_ENV` is exactly `development` or `test`. Every other value, **including an unset one**, fails closed: the server refuses to boot without a real `SESSION_SECRET` and `OIDC_PRIVATE_KEY`.

`TRUST_PROXY` decides where the client IP comes from. When it is false, the IP is the socket peer address. When it is true, the IP is the last hop in `X-Forwarded-For`. Leave it false unless a proxy you control rewrites that header, because a client can otherwise set it to anything and slip past the rate limiter.

The BFF has its own variables, including adapter-node's `ORIGIN` and `PORT`. See [`example-client/README.md`](example-client/README.md).

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

The SvelteKit app in [`example-client/`](example-client/) is a **Backend-for-Frontend**, not a token-holding SPA. Its server side is a **confidential** OAuth client: it runs Authorization Code + PKCE, validates the `id_token` (`iss`/`aud`/`exp`/`nonce`, RS256-pinned via [`jose`](https://github.com/panva/jose)), and keeps the access/refresh/id tokens **server-side**. The browser receives only an opaque `HttpOnly; Secure; SameSite=Lax` session cookie and talks exclusively to same-origin BFF endpoints:

| Route                | Purpose                                                                          |
| -------------------- | -------------------------------------------------------------------------------- |
| `GET /`              | the home page; a server `load` supplies the signed-in identity — never tokens    |
| `GET /auth/login`    | starts the flow — CSPRNG `state`/`nonce`/PKCE stashed server-side                |
| `GET /auth/callback` | exchanges the code, validates the `id_token`, creates the session                |
| `POST /?/logout`     | form action; revokes the refresh token at the AS and destroys the session        |
| `GET /api/contacts`  | proxies the protected resource, attaching the Bearer token (refreshing if stale) |

Identity reaches the page through SvelteKit's server primitives — `hooks.server.ts` resolves the `sid` cookie into `event.locals`, and `+page.server.ts` returns the user from `load`. There is no browser fetch for identity.

Endpoints come from OIDC **discovery**, never hardcoded. This is exactly the pattern the old in-browser-token caveat recommended — see [ADR-0001](docs/adr/0001-backend-for-frontend.md). The security-critical pieces (id_token validation, the session store, the route handlers) are unit-tested in [`example-client/src/lib/server`](example-client/src/lib/server).

## Deploying

`pnpm build` compiles the server to `dist/` with `tsconfig.build.json`. `pnpm start` runs it with `node dist/index.js`. Nothing in `dist/` needs `tsx`, which stays a devDependency.

A `Dockerfile` builds the same artifact. Its runtime stage sets `ENV NODE_ENV=production`, which is load-bearing — see the fail-closed rule under [Configuration](#configuration).

```bash
pnpm build
NODE_ENV=production \
  DATABASE_URL=file:/var/lib/oauth/oauth.db \
  OIDC_ISSUER=https://auth.example.com \
  OIDC_PRIVATE_KEY="$(cat oidc.pem)" \
  SESSION_SECRET="$(openssl rand -hex 32)" \
  node dist/index.js
```

**Why there is a build step.** Node's `--experimental-strip-types` cannot run this server. `src/app.tsx` and the views under `src/views/` are JSX. Type stripping removes type annotations only — it does not transform JSX, so the file fails to parse. The forker who tries `node --experimental-strip-types src/index.ts` hits a confusing syntax error, not a missing flag. Compile instead.

**Migrate before you roll out.** Run `pnpm db:migrate:prod` as a one-shot release job, and let it finish before any new replica serves traffic. It uses the compiled migrator in `dist/db/migrate.js`, so the production image can migrate without `drizzle-kit`. Never migrate at application boot.

**Probes.** `/healthz` is liveness: it touches nothing and answers while the process is alive. Restart the container when it fails. `/readyz` is readiness: it runs `select 1` and answers 503 when the database is unreachable. Pull the instance out of the load balancer when it fails, but do not restart it — a database outage is not fixed by a restart loop.

**Prune on a schedule.** Revocation is force-expiry, so token and auth-code rows accumulate forever. Run `pnpm db:prune` once a day as a scheduled job. It deletes rows whose access and refresh windows both closed more than 24 hours ago. The grace window keeps refresh-token reuse detection able to see a replayed token. There is no in-process cron on purpose.

**Rotating the JWKS signing key.** Issued tokens stay valid until they expire, and relying parties cache the JWKS. A key therefore cannot be swapped in one step. The procedure is an overlap:

1. Generate a new RSA key and set it as `OIDC_PRIVATE_KEY`. Keep publishing the **old public key** in the JWKS alongside the new one. New tokens are signed with the new key; tokens already issued still verify against the old one.
2. Deploy, then wait at least one maximum token lifetime — the longest of the access-token, id_token, and refresh-token TTLs.
3. Stop publishing the old public key and deploy again.

Skipping the overlap invalidates every token issued before the rotation, and every relying party still holding the old JWKS.

Step 1 needs the JWKS to serve more than one key. This example signs with a single key, so publishing an overlap means extending `src/lib/oidc_key.ts` to carry a list of retired public keys. Plan for that before the first rotation, not during it.

### Cloudflare Workers

`src/worker.ts` is a second entry point for the same app: it builds the container from a [D1](https://developers.cloudflare.com/d1/) binding instead of a SQLite file and exports a Workers `fetch` handler. `wrangler.jsonc` declares the binding (`DB`), enables `nodejs_compat`, and points `migrations_dir` at the same `drizzle/` folder the Node migrator uses. The code is identical; only `src/index.ts` vs `src/worker.ts` differs.

```bash
pnpm exec wrangler d1 create oauth           # paste the id into wrangler.jsonc
pnpm cf:migrate --remote                     # apply drizzle/*.sql to D1
pnpm db:migrate && pnpm db:seed              # seed the local file...
pnpm cf:seed --remote                        # ...and replay its rows into D1
pnpm exec wrangler secret put OIDC_PRIVATE_KEY
pnpm exec wrangler secret put SESSION_SECRET
pnpm cf:deploy
```

Set `OIDC_ISSUER` in `wrangler.jsonc` to the Worker's public `https://` URL before deploying. `NODE_ENV` is `production` there, so the fail-closed rules under [Configuration](#configuration) apply.

For local development, `cp .dev.vars.example .dev.vars`, then `pnpm cf:migrate --local`, `pnpm cf:seed --local`, and `pnpm cf:dev` serves the Worker on `http://localhost:8787` against a local D1.

What to know before choosing this target:

- **Seeding goes through the local file.** `seed.ts` needs a drizzle connection and there is none to remote D1, so `cf:seed` dumps the seeded rows from `data/oauth.db` and replays them with `wrangler d1 execute`. The script needs the `sqlite3` CLI.
- **Password hashing is `bcryptjs`**, pure JS, because native `bcrypt` cannot load on Workers. A cost-12 hash takes a few hundred milliseconds of CPU, so the Worker needs the Paid plan's CPU budget; the Free plan's 10 ms ceiling is not enough for any real bcrypt cost.
- **The rate limiter is per isolate.** It still runs, but an attacker spread across isolates sees a higher ceiling than `LOGIN_RATE_MAX` suggests. Back it with KV or Durable Objects before relying on it.
- **`db.transaction()` is unavailable on D1.** The repositories already use `db.batch()` for their multi-statement writes, which D1 runs atomically. Keep to that shape when adding writes.
- **Migrations have two journals.** `wrangler d1 migrations` and drizzle's Node migrator each track applied files in their own table. Use one per database, never both.

## Adapting for production

> [!WARNING]
> This repo optimizes for being readable and runnable on `localhost`. Don't ship it as-is — at least change the following:

- **`NODE_ENV`** — set it to `production`. The demo conveniences below are enabled only when it is exactly `development` or `test`. An unset `NODE_ENV` fails closed, which is deliberate: a silent boot with a published secret is worse than no boot at all.
- **`SESSION_SECRET`** — the AS Session cookie (`jid`) is an HS256 JWT signed with a secret that is deliberately **separate** from the OIDC RSA key (different trust domains). Outside `development`/`test` a missing or default value fails closed — the server refuses to boot. Set a long random value.
- **`OIDC_PRIVATE_KEY`** — set a stable PEM so issued tokens survive restarts. Outside `development`/`test` a missing key fails closed rather than generating an ephemeral one.
- **`OIDC_ISSUER`** — must be `https://`, must have no trailing slash, and must byte-match the externally reachable URL. The BFF compares the discovery document's `issuer` byte for byte.
- **HTTPS** — the `jid` cookie carries `Secure` and the `__Host-` prefix outside development. Neither survives plain HTTP.
- **`TRUST_PROXY`** — the rate limiter and `lastLoginIP` read the client IP. Set `TRUST_PROXY=true` only when a reverse proxy you control overwrites `X-Forwarded-For`. Left false, the socket peer address is used, which a client cannot forge.
- **`ORIGIN` for the BFF** — behind a TLS-terminating proxy, set `ORIGIN` on the SvelteKit server. adapter-node otherwise derives the origin from the `Host` header, and SvelteKit's origin CSRF check rejects the logout form action.
- **BFF session store** — the BFF keeps sessions (and the tokens they hold) in a **per-process in-memory map**, so they're lost on restart and don't span instances. A multi-instance deployment needs a shared store, and a shared refresh lock: the BFF single-flights token refresh per session so concurrent requests don't replay a rotated refresh token into the AS's reuse detection (which revokes the whole family), but that guard is per-process only. `SessionStore` in `example-client/src/lib/server/session.ts` is the swap seam.
- **Password hashing** — this example uses bcrypt at cost 12, because the seeded hashes and the client-secret rows are already bcrypt. For a greenfield fork, prefer **argon2id** ([`@node-rs/argon2`](https://github.com/napi-rs/node-rs)). Changing the KDF invalidates every stored hash, so it is a choice you make at the start, not later.
- **Logging** — the built-in access log and error log write structured JSON with no dependency, which keeps the example light. In production, swap in [pino](https://getpino.io) with redaction configured. Authorization requests carry `state`, `nonce`, and `code_challenge` in the query string, and token requests carry secrets in the body; neither belongs in a log sink.
- **Consent persistence** — this demo asks for Consent on every authorization; a real provider stores a **Grant** per Resource Owner and Client, and skips the consent screen when the Grant already covers the requested scopes.

### Taking the database to production

SQLite keeps this example runnable with no services to start, and a single-process deployment can stay on it. Anything with more than one replica wants Postgres, and the port back is mostly mechanical. The [`postgres`](https://github.com/jasonraimondi/ts-oauth2-server-example/tree/postgres) tag marks the last commit on Postgres, with a working schema, migrator, and `docker-compose.yml` to copy from. What the SQLite version gave up:

- **Transactions** — `AuthCodeRepository.persist` and `TokenRepository.persist` use `db.batch()`, the one atomic shape libsql and D1 share. On Postgres, use `db.transaction()`.
- **Migration lock** — `src/db/migrate.ts` takes no lock, because one file has one writer. Two replicas rolling out together would race the same DDL; the Postgres version wrapped `migrate()` in `pg_advisory_lock`.
- **Native types** — ids are text uuids generated by the application, timestamps are integer millisecond epochs, `redirectUris` and `allowedGrants` are JSON text, and the IP columns are plain text. Postgres has `uuid`, `timestamptz`, `text[]`, an enum for the grant types, and `inet`, which rejects a malformed address at the column.
- **Case-insensitive email lookup** — login compares `lower(email)`, which cannot use the unique index on `email`. On Postgres, use `citext` or an expression index on `lower(email)`.
- **Backups** — the database is one file on a volume. Copy it with the process stopped, or use `sqlite3 .backup`; a live `cp` can catch a half-written page.

### Revocation requires client authentication

> [!IMPORTANT]
> The RFC 7009 revoke endpoint force-expires **both** access and refresh tokens, but `authenticateRevoke` defaults to `true`, so the request must authenticate the client (`client_id`, plus `client_secret` for a confidential client). An unauthenticated revoke returns a silent `200` and revokes nothing — RFC 7009 returns `200` even for invalid tokens, so a failed revoke is indistinguishable from a successful one. The suite asserts revocation without the endpoint: by force-expiring the stored row directly, and through the `/userinfo` guard (`getByAccessToken` + `isAccessTokenRevoked`).

## Using this as a template

Fork it, then rename the parts that are specific to this demo:

- **Package names** — `jmondi-oauth2-example-server` in `package.json`, and `jmondi-oauth2-example-client` in `example-client/package.json`.
- **Database** — the `DATABASE_URL` file path in `.env`. The image declares `/app/data` as a volume; mount persistent storage there.
- **Issuer** — `OIDC_ISSUER`, on both the server and the BFF. They must agree byte for byte.
- **Clients** — the client IDs, names, secrets, redirect URIs, and scopes in [`src/db/seed.ts`](src/db/seed.ts). The BFF's `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, and `OAUTH_REDIRECT_URI` must match the row you seed for it.

> [!CAUTION]
> `pnpm db:seed` is idempotent, but it writes a known user with a known password and a known client secret — all of them published in this repository. Never run it against a production database.

The parts worth keeping are the ones that took the longest to get right: PKCE S256 enforcement, the real consent step, refresh-token rotation with family revocation, the fail-closed configuration, and the BFF pattern.

## Tests

```bash
pnpm test          # Vitest integration suite against data/oauth_test.db, rebuilt every run
```

The suite covers the auth-code + PKCE happy path, refresh, revocation and userinfo, OIDC claims, the consent accept/deny branches, PKCE negatives (missing challenge/verifier, `plain` rejected), `redirect_uri` mismatch, and login hardening (unknown-email and null-hash both return a generic 401). It runs serially against one shared database with between-test truncation.
