# Plan: BFF rewrite + server hardening

See [ADR-0001](../adr/0001-backend-for-frontend.md) and [CONTEXT.md](../../CONTEXT.md).

## Locked decisions

- SvelteKit becomes the **BFF** (`adapter-node`, SSR on).
- In-memory server session store; opaque `sid` cookie (`HttpOnly; Secure; SameSite=Strict`).
- Hand-rolled OAuth protocol + **`jose` for all JWT crypto**. **Discovery, never hardcoded endpoints.**
- id_token contract: `iss` exact, `aud` contains `client_id`, `exp`/`iat` (small skew), **`nonce`**, signature with **alg pinned to RS256** (reject `alg:none`/HS\*). JWKS via `jose.createRemoteJWKSet`.
- BFF is a **confidential client**; client secret **bcrypt-hashed at rest**; `isClientValid` → `bcrypt.compare`.
- Minimal scoped `GET /api/contacts` resource on the AS; BFF proxies and attaches the Bearer token.
- Hardening: **#4** fail-closed secrets in prod · **#2** revocable AS session (`tokenVersion`) · **#7** rate limiting · **#3** refresh-token family reuse-detection.
- Tests both sides (extend AS Vitest suite + new `web` Vitest harness).
- Defaults: BFF logout revokes the refresh token at the AS; transparent refresh before proxying; remove the vite `/api`→:3000 proxy.

## Phases (each ends green)

### Phase 0 — Scaffolding
- `web`: add `jose`; `svelte.config.js` → `adapter-node`; drop `ssr=false`/`prerender=false`; add Vitest; new env (`OIDC_ISSUER`, `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`); remove the `/api`→:3000 vite proxy.
- verify: `pnpm --dir web build && pnpm --dir web check`.

### Phase 1 — AS confidential client (bcrypt)
- `isClientValid` → `bcrypt.compare` (public/null-secret path unchanged).
- seed: client → confidential (`bcrypt(secret)`), `redirectUris=['http://localhost:5173/auth/callback']`, grants include `authorization_code`+`refresh_token`. Plaintext secret only in `.env.example`.
- verify (TDD): correct secret authenticates, wrong → 401, public path intact; `pnpm test`.

### Phase 2 — AS `/api/contacts` resource
- `GET /api/contacts`: validate Bearer like `/userinfo`, require `contacts.read`, return seeded contacts; 401 bad token / 403 missing scope.
- verify: 200 with scope, 403 without, 401 unauth.

### Phase 3 — AS hardening
- #4 fail-closed `SESSION_SECRET`/`OIDC_PRIVATE_KEY` in production.
- #2 `ver:tokenVersion` in `jid` claims, compared in `currentUser`, bumped on logout.
- #7 in-memory rate limiter → 429 on `/api/login` + `/api/oauth2/token`.
- #3 migration `oauth_tokens += refresh_token_family uuid`; family threaded through issue/persist; replay of a revoked refresh token revokes the whole family.
- verify: a test per item; `pnpm db:generate` + migrate.

### Phase 4 — BFF core
- `lib/server/`: discovery+cache, CSPRNG state/nonce/PKCE, jose id_token validation, form-encoded exchange/refresh, in-memory session store, cookie helpers.
- routes: `GET /auth/login`, `GET /auth/callback`, `POST /auth/logout` (revokes at AS), `GET /api/me`, `GET /api/contacts` (transparent refresh → proxy).
- browser thin: Login / identity / Load contacts / Logout. Delete `browser_storage.ts`, `auth.ts`, `http_client.ts`, `base64.ts`, `random.ts`, old `callback`/`refresh` pages.
- verify: end-to-end via `overmind`; `pnpm --dir web check`.

### Phase 5 — BFF tests
- id_token rejection table (bad `iss`/`aud`/`exp`/`nonce`, `alg:none`, HS256) with mocked JWKS; session take-once; callback state/nonce mismatch.
- verify: `pnpm --dir web test`.

### Phase 6 — Docs & cleanup
- Fix the now-false "access token kept in memory in the browser" line in CLAUDE.md/README; update `.env.example`; drop unused web deps (`js-cookie`, `@jmondi/browser-storage`, `wretch`).
- verify: full `pnpm test` + `pnpm --dir web test` + both builds; manual login→contacts→logout.

## Risks tracked
- AS `/token` must accept `application/x-www-form-urlencoded` from the BFF (verify the package's vanilla adapter in Phase 1; also fixes the old JSON wart).
- Discovery `issuer` must byte-match `OIDC_ISSUER`.
