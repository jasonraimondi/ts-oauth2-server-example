# Claude Development Notes

## Project Overview

TypeScript OAuth2 server example implementation using a Hono server and a SvelteKit client. This demonstrates real-world usage of the @jmondi/oauth2-server package.

## Development Setup

```bash
# Install dependencies (the web client is a standalone pnpm project)
pnpm install
cd web && pnpm install && cd ..

# Start database
docker compose up -d

# Run migrations and seed
pnpm db:migrate
pnpm db:seed

# Start development servers
overmind start  # or foreman start
```

## Available Scripts

- `pnpm dev` - Start server in watch mode (tsx)
- `pnpm build` - Type-check / compile with tsc
- `pnpm test` - Run the Vitest suite
- `pnpm db:generate` - Generate a Drizzle migration from the schema (drizzle-kit)
- `pnpm db:migrate` - Apply Drizzle migrations (drizzle-kit)
- `pnpm db:seed` - Seed database with initial data (tsx)
- `pnpm format` - Format code with Prettier

## Project Structure

- `/src` - Hono server application
  - `index.ts` - `@hono/node-server` entry point (serves on port 3000)
  - `app.tsx` - Hono routes + middleware (logger, currentUser, CSRF)
  - `container.ts` - composition root wiring the AuthorizationServer, repositories, and JWT service
  - `db/` - Drizzle schema, client, and seed
  - `app/oauth/` - entities, repositories, and services
  - `views/` - server-rendered forms (Hono JSX)
- `/web` - SvelteKit client application
- `/drizzle` - Database migrations
- `/tests` - Vitest integration tests

## Key Components

- OAuth2 authorization server implementation
- User authentication and management
- Client registration and management
- Scope-based authorization with a **real consent step** (authorize never auto-approves; `POST /api/scopes` honors accept/deny)
- OAuth/OIDC token signing with an RS256 key (published via JWKS)
- Browser session cookie (`jid`) signed separately with an HS256 `SESSION_SECRET` — a different trust domain from the OIDC key
- OpenID Connect: `id_token` on the code flow, plus discovery, JWKS, and userinfo endpoints
- Hono JSX server-rendered login + consent forms
- zod request validation
- Origin-based CSRF protection (`hono/csrf`) scoped to the browser form routes
- Fetch `Request`/`Response` bridged to the package via the `@jmondi/oauth2-server/vanilla` adapter

## Database

- PostgreSQL in Docker; image pinned to `postgres:17` (the unpinned tag broke on the v18 data-dir change)
- Drizzle ORM (postgres.js driver); dev role/db are `oauth` / `oauth_example`, tests use `oauth_test`
- The connection string has no `?schema=public` cruft (no `.replace` strips)
- Migrations in `/drizzle`

## Development Notes

- Server runs on port 3000 with all routes under the `/api` prefix
- Web client (`web/`) is a SvelteKit **Backend-for-Frontend**: a confidential OAuth client that holds all tokens server-side (in-memory session store) and exposes same-origin `/auth/*` + `/api/*` endpoints; the browser only ever holds an opaque `sid` cookie (see ADR-0001)
- Uses ESM modules (`"type": "module"`)
- OIDC tokens are signed with an RSA key from `OIDC_PRIVATE_KEY` (PEM); if unset, an ephemeral key is generated at boot
- The session cookie uses a separate `SESSION_SECRET` (HS256); an insecure dev default is used if unset
- The `jid` cookie's `Secure` flag is gated on `NODE_ENV === "production"` so the demo works over http://localhost
- OIDC issuer set via `OIDC_ISSUER` (defaults to `http://localhost:3000`); discovery + JWKS live at `/.well-known/*`, userinfo at `/api/oauth2/userinfo`
- CSRF protection enabled on the browser form routes; the whole app shares one `app.onError` using the package's `handleVanillaError`
