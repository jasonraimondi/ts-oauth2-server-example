# @jmondi/oauth2-server-example

This is an example implementation of the [@jmondi/oauth2-server](https://github.com/jasonraimondi/ts-oauth2-server) project using a [Hono](https://hono.dev) server and a SvelteKit client. This is closer to a real-world example of how to implement the package in a production application.

## Stack

- **Server** — [Hono](https://hono.dev) on Node (`@hono/node-server`), listening on port `3000` with all routes under the `/api` prefix.
- **Database** — PostgreSQL via [Drizzle ORM](https://orm.drizzle.team) (postgres.js driver).
- **Views** — server-rendered login/scopes forms using [Hono JSX](https://hono.dev/docs/guides/jsx).
- **Tests** — [Vitest](https://vitest.dev) integration suite running against a real Postgres test database.
- **Client** — SvelteKit app in `web/`.

The OAuth2 HTTP endpoints bridge Hono's Fetch `Request`/`Response` to the package via the `@jmondi/oauth2-server/vanilla` adapter.

## OpenID Connect

OIDC is enabled on the authorization-code flow. Requesting the `openid` scope adds an `id_token` (RS256) to the token response, and the server exposes:

- `GET /.well-known/openid-configuration` — discovery document
- `GET /.well-known/jwks.json` — public signing key (JWKS)
- `GET|POST /api/oauth2/userinfo` — bearer-authenticated, scope-filtered claims

Tokens are signed with an RSA key from `OIDC_PRIVATE_KEY` (or an ephemeral key generated at boot if unset). The seeded **OIDC Demo Client** is granted the `openid`, `email`, and `profile` scopes.

## Getting Started

You can use [Foreman](https://github.com/ddollar/foreman) or [Overmind](https://github.com/DarthSim/overmind) to manage these processes. Both tools allow running multiple applications specified in a Procfile simultaneously.

```
cp -n .env.example .env
# then set DATABASE_URL in .env (OIDC_ISSUER/OIDC_PRIVATE_KEY are optional — see .env.example)

pnpm install
pnpm install --prefix web

docker compose up -d
pnpm db:migrate
pnpm db:seed

overmind start # or use foreman
```

To run the server on its own (with file watching), use `pnpm dev`. To run the Vitest suite, use `pnpm test`.
