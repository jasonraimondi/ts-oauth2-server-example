# Rewrite the example server to Hono + Drizzle

Status: accepted (2026-05-31)

This repo is the reference example for `@jmondi/oauth2-server`. We rewrote the
server from NestJS/Express + Prisma to **HonoJS + Drizzle (postgres.js)**, keeping
the SvelteKit `web/` client, Docker Postgres, the `/api` paths/port 3000, the
`authorization_code` (PKCE/S256) + `refresh_token` grant set, and the exact seed
IDs/values unchanged. Goal: show the library wired into a smaller, Fetch-native,
decorator-free stack.

## OAuth bridged via the `vanilla` adapter — no Hono adapter exists or is needed

`@jmondi/oauth2-server` ships only `index` / `vanilla` / `express` / `fastify`
exports. There is **no Hono adapter, and none is required**: the `vanilla` adapter
(`requestFromVanilla(req: Request)` / `responseToVanilla(res)` / `responseFromVanilla`)
is built on the Fetch API, and Hono is Fetch-native (`c.req.raw` is a Fetch
`Request`; handlers return a Fetch `Response`). token/revoke/authorize bridge with
zero custom adapter code. A future reader looking for `@jmondi/oauth2-server/hono`
should stop — use the vanilla bridge.

## Scopes are now persisted (deliberate divergence from the prior example)

The previous Prisma repositories silently dropped scopes on `persist()`
(`const { scopes, ...row } = ...`), and `AuthCodeRepository.getByIdentifier` never
loaded them — so issued auth codes and tokens were stored with zero scope links.
The rewrite **fixes this**: three explicit join tables
(`oauthClientScopes` / `oauthAuthCodeScopes` / `oauthTokenScopes`), scope links
written inside the same transaction as the row, and `getByIdentifier` includes
scopes so the auth-code→token exchange and refresh-token narrowing carry real
scopes. The seed — which previously created scopes but never linked them to the
client — now links them too. `finalize()` is left unchanged (returns the
requested scopes verbatim; client-declared scopes are modeled but not enforced),
matching the original example's intent. This is a behavior change, made because a
reference example should model correct scope persistence. Don't "simplify" it
back to dropping scopes.

## Considered and rejected

- **Express/Fastify adapters** — both ship with the library, but the point of this
  rewrite was the leaner Fetch-native path; Hono + vanilla is the smallest surface.
- **Keeping Prisma** — Drizzle keeps the Postgres-specific schema fidelity
  (`inet`, `uuid`, enum arrays) via native column types while dropping the
  generate/engine build step.
- **`customType` / `text` for `inet`** — unnecessary; Drizzle pg-core has a native
  `inet()` that preserves the original `@db.Inet` exactly.
