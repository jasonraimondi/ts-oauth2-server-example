# OIDC support for the Hono/Drizzle example backend

Date: 2026-06-06
Status: Approved

## Goal

Add OpenID Connect support to this example backend, exercising the OIDC API that
landed in `@jmondi/oauth2-server` 5.0.0-rc.1 (PR #231). Backend only — no
SvelteKit/web changes.

When a client runs the authorization-code + PKCE flow with the `openid` scope,
the `/token` response must include an `id_token`, and the server must expose the
three OIDC discovery surfaces: discovery document, JWKS, and userinfo.

## Decisions

- **Signing key:** read `OIDC_PRIVATE_KEY` (PEM) from env; if unset, generate an
  ephemeral RSA key at boot and warn that tokens won't survive a restart. A
  single RS256 `JwtService` signs both OAuth tokens and the session cookie
  (consistent with today's reuse of the HS256 secret).
- **Claims surface:** `openid` + `email` + `profile`. Add a `name` column to
  `users`. `getUserClaims` returns only stored attributes (no fabricated
  `email_verified`).
- **Auth-code OIDC fields:** persist all three of `nonce`, `authTime`, `maxAge`
  (not just `nonce`) so the example fully honors the `OAuthAuthCode` contract and
  demonstrates `auth_time`.

## Changes

### A. Signing: HS256 → RS256
- New `src/lib/oidc_key.ts` exporting `resolvePrivateKey()`: returns
  `process.env.OIDC_PRIVATE_KEY` (un-escaping `\n` for single-line `.env`
  storage); else `generateKeyPairSync("rsa", { modulusLength: 2048, ... pkcs8/spki
  PEM })` with a warning.
- `container.ts`: `new MyCustomJwtService({ key: resolvePrivateKey() })`. Remove
  the now-orphaned `JWT_SECRET` read. `MyCustomJwtService` is otherwise unchanged
  (its constructor already accepts `JwtAsymmetricKeyOptions`).

### B. AuthorizationServer OIDC config (`container.ts`)
- `issuer = process.env.OIDC_ISSUER ?? "http://localhost:3000"` (loopback http is
  a valid issuer per the library).
- Add `issuer` + `oidc` to the options:
  - `authorizationEndpoint: ${issuer}/api/oauth2/authorize`
  - `tokenEndpoint: ${issuer}/api/oauth2/token`
  - `userinfoEndpoint: ${issuer}/api/oauth2/userinfo`
  - `jwksUri: ${issuer}/.well-known/jwks.json`
  - `getUserClaims(sub)` → fetch user via `userRepository.getUserByCredentials`,
    return `{ sub, email, name: name ?? undefined }`.

### C. Persist OIDC fields on auth codes
- **Schema (`db/schema.ts`):** add `nonce text`, `authTime integer`,
  `maxAge integer` to `oauthAuthCodes`; add `name varchar(255)` to `users`.
  Generate a drizzle migration.
- **`AuthCode` entity:** add optional `nonce`/`authTime`/`maxAge`, defaulted from
  the constructor entity.
- **`auth_code_repository.persist`:** write the three fields (`?? null`).
  `getByIdentifier` already spreads the row. Mandatory: the library throws
  `invalid_grant` at token-exchange if `nonce` wasn't persisted for opaque codes.
- **`app.tsx` authorize handler:** set `authRequest.authTime` from
  `user.lastLoginAt` (fallback `Date.now()`), so `auth_time` lands in the id_token
  and `max_age` is enforceable.

### D. Routes (`app.tsx`), via the existing vanilla bridge
- `GET /.well-known/openid-configuration` → `responseToVanilla(authorizationServer.openidConfiguration())`
- `GET /.well-known/jwks.json` → `responseToVanilla(authorizationServer.jwks())`
- `GET|POST /api/oauth2/userinfo` → `responseToVanilla(await authorizationServer.userInfo(await requestFromVanilla(c.req.raw)))`

Discovery + JWKS sit at root to match the issuer. None are CSRF-scoped (bearer /
non-form).

### E. Seed (`db/seed.ts`)
Add `openid`/`email`/`profile` scopes (fixed UUIDs), grant all three to the
Sample Client, and set a `name` on the seeded user.

### F. Tests (`tests/oidc.test.ts`, TDD)
- Discovery document shape (issuer, endpoints, `scopes_supported`,
  `id_token_signing_alg_values_supported: ["RS256"]`).
- JWKS shape (`kty:"RSA"`, `use:"sig"`, `alg:"RS256"`, `kid`, `n`, `e`).
- Full auth-code + PKCE flow with `scope=openid email profile` and a `nonce`:
  `/token` returns `id_token`; decoded header `alg:"RS256"`; payload `iss`/`aud`/
  `sub`/`nonce`/`at_hash`/`auth_time` correct.
- `/userinfo` with the bearer access token → scope-filtered `{ sub, email, name }`.
- `/userinfo` without a token → 401.
- Existing suite stays green under RS256.

### Env / docs
- `.env.example` / `.env` / `tests/.env.test`: drop `JWT_SECRET`; add
  `OIDC_ISSUER` and a commented `OIDC_PRIVATE_KEY` with an `openssl` one-liner.
- `CLAUDE.md`: note the OIDC endpoints, RS256 signing, and the two env vars.

## Verification
- `pnpm build` (tsc) clean.
- `pnpm test` green (Postgres test DB up; global setup migrates + seeds).
