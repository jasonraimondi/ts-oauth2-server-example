# Claude Development Notes

## Project Overview
TypeScript OAuth2 server example implementation using a Hono server and a SvelteKit client. This demonstrates real-world usage of the @jmondi/oauth2-server package.

## Development Setup
```bash
# Install dependencies
pnpm install
pnpm install --prefix web

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
- Scope-based authorization
- JWT token handling (RS256 asymmetric signing)
- OpenID Connect: `id_token` on the code flow, plus discovery, JWKS, and userinfo endpoints
- Hono JSX server-rendered login/scopes forms
- zod request validation
- Origin-based CSRF protection (`hono/csrf`) scoped to the browser form routes
- Fetch `Request`/`Response` bridged to the package via the `@jmondi/oauth2-server/vanilla` adapter

## Database
- PostgreSQL database running in Docker
- Drizzle ORM (postgres.js driver) for database operations
- Migrations in `/drizzle`

## Development Notes
- Server runs on port 3000 with all routes under the `/api` prefix
- Web client runs separately via SvelteKit
- Uses ESM modules (`"type": "module"`)
- OIDC tokens are signed with an RSA key from `OIDC_PRIVATE_KEY` (PEM); if unset, an ephemeral key is generated at boot
- OIDC issuer set via `OIDC_ISSUER` (defaults to `http://localhost:3000`); discovery + JWKS live at `/.well-known/*`, userinfo at `/api/oauth2/userinfo`
- CSRF protection enabled on the browser form routes
