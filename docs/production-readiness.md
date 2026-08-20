# Production Readiness Report

Six independent reviews (security/OAuth2 spec, server idioms, SvelteKit client, template DX, tests/CI, production ops) of this repo as an example + starter template for `@jmondi/oauth2-server`. 75 raw findings, deduplicated to the items below and organized into parallel-safe workstreams for implementation.

## Verdict

The core OAuth2/OIDC machinery is in excellent shape — PKCE S256 enforcement, redirect_uri validation, refresh-token rotation with RFC 9700 family revocation, timing-safe login, fail-closed secrets, and a genuinely well-tested server (see "Verified OK" at the end). What is *not* production-ready is everything around the core: safety gates that fail open when `NODE_ENV` is unset, zero security headers (the consent page is clickjackable), a spoofable rate limiter, no deployable artifact or start path, unbounded in-memory maps, a client README that documents a deleted architecture, and a SvelteKit client that skips every SvelteKit idiom a template should demonstrate.

## Execution plan

Three waves. Workstreams within a wave touch disjoint files and can run as parallel agents. Waves are sequential (Wave 2 builds on Wave 1's config module; Wave 3's strictness/tests run against settled code).

| Wave | Workstream | Owns (exclusive) |
|---|---|---|
| 1 | **A — Config & process lifecycle** | `src/lib/config.ts` (new), `src/index.ts`, `src/lib/session.ts`, `src/lib/oidc_key.ts`, `src/db/index.ts`, `src/db/seed.ts`, `src/container.ts` (env reads), `src/app.tsx` (env-read swaps only), `.env.example`, `tests/fail-closed.test.ts`, `example-client/src/lib/server/config.ts` |
| 1 | **B — Build, deploy & CI** | `package.json` (root scripts/fields), `tsconfig.build.json` (new), `Dockerfile` + `.dockerignore` (new, both apps), `src/db/migrate.ts` (new), `.github/workflows/ci.yml`, `.github/dependabot.yml`, `docker-compose.yml`, `vitest.config.ts` coverage blocks |
| 1 | **C — SvelteKit client rework** | everything under `example-client/src/`, `example-client/package.json` |
| 1 | **D — Documentation** | `README.md`, `example-client/README.md`, `docs/` reorganization, `CONTEXT.md` links |
| 2 | **E1 — HTTP surface hardening** | `src/app.tsx` (sole owner in this wave), `src/lib/rate_limit.ts`, `src/lib/client_ip.ts` (new), `src/lib/require_scope.ts` (new), `src/app/oauth/current_user.ts` |
| 2 | **E2 — Server-rendered views** | `src/views/Login.tsx`, `src/views/Scopes.tsx`, `src/views/Layout.tsx` |
| 2 | **F — OAuth internals & data layer** | `src/app/oauth/repositories/*`, `src/app/oauth/services/*`, `src/lib/password.ts`, `src/db/schema.ts`, `drizzle/` (new migration), `src/db/prune.ts` (new), `src/container.ts` (OIDC metadata) |
| 3 | **G — Strictness, lint & test gaps** | `tsconfig.json`, `.oxlintrc.json`, `tests/*` additions, remaining comment cleanups |

Known light-contention files: root `package.json` (A adds nothing, B owns it; F adds the `bcrypt` dep — trivial merge), `container.ts` (A in wave 1, F in wave 2 — sequential, fine), `.env.example` (A owns; other streams hand A their vars via this report). Each workstream also writes the tests named in its own items — Wave 3 only adds the independent gaps.

**Cross-stream interfaces** (agreed here so parallel streams don't negotiate):

- `Login` view accepts optional props `error?: string` and `email?: string` (E2 implements, E1 consumes).
- `Scopes` view accepts `userEmail?: string` (E2 implements, E1 passes).
- `src/lib/password.ts` exports `verifyDummyPassword(): Promise<void>` (or equivalent constant-work call) so `app.tsx` never hardcodes a dummy hash (F implements, E1 consumes).
- Shared design tokens (used verbatim by both C and E2):

```css
:root {
  color-scheme: light dark;
  --bg: #ffffff; --fg: #1a1a1a; --muted: #6b6b6b;
  --accent: #c62f14; --accent-fg: #ffffff;
  --border: #d9d9d9; --radius: 4px; --space: 0.75rem;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #161616; --fg: #ececec; --muted: #9a9a9a; --border: #3a3a3a; }
}
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
main { max-width: 40rem; margin-inline: auto; padding-block: 2rem; padding-inline: 1rem; }
```

## Adjudicated decisions (where reviewers disagreed)

1. **Password hashing**: replace `bcryptjs` with native **`bcrypt`** (same API, libuv thread pool, hash-compatible with existing seeds/rows) rather than argon2id. Rationale: bcryptjs computes cost-12 hashes on the event loop (~100–300 ms of blocked loop per login — a DoS lever), but switching KDFs would break every seeded hash and complicate an example. Document argon2id (`@node-rs/argon2`) as the recommended choice for greenfield forks.
2. **Logging**: dependency-free structured JSON (Hono `requestId` + a ~12-line access-log middleware + error logging in `onError`), not pino. An example should stay light; the README names pino-with-redaction as the production swap. The package's `logger` option gets wired to the same JSON logger at debug level.
3. **Scripts**: `"typecheck": "tsc --noEmit"`, `"build": "tsc -p tsconfig.build.json"` (emits `dist/`), `"start": "node dist/index.js"`. CI's `pnpm build # type-check` comment goes away.
4. **Hardcoded demo credentials in Login.tsx**: removed, not commented. Demo credentials render as visible helper text instead (`Demo user: jason@example.com / password123`).
5. **BFF session store**: fix the TTL bug and eviction, define a small `SessionStore` interface as the swap seam, but do **not** ship a Redis implementation — README documents the swap.
6. **Rate limiter / prune / key rotation**: keep in-memory limiter (bounded), keep prune as a script (no in-process cron), treat JWKS key-overlap rotation as an optional stretch item plus a documented procedure.

---

## Wave 1

### WS-A — Config & process lifecycle

**A1. Safety gates fail open when NODE_ENV is unset** (SEC-1, High)
`src/lib/session.ts:24`, `src/lib/oidc_key.ts:21`, `src/app.tsx:208,230`. The fail-closed checks (dev SESSION_SECRET, ephemeral OIDC key) and the cookie `Secure` flag trigger only when `NODE_ENV === "production"`. Unset NODE_ENV silently boots with the published HS256 secret — anyone can forge a `jid` cookie for any user. Invert the gate: insecure behavior only when NODE_ENV is explicitly `development` or `test`; everything else fails closed. Update `tests/fail-closed.test.ts` to assert unset-NODE_ENV → throws, and ensure `NODE_ENV=test` is set for the suite.

**A2. Validated config module** (SRV-2 + OPS-3, High)
Ten raw `process.env` reads across six files, three `import "dotenv/config"` side effects, and `Number(process.env.LOGIN_RATE_MAX ?? 10)` which turns `""` into `0` (every login 429s) and junk into `NaN` (limiter silently off). Create `src/lib/config.ts` with a zod schema:

```ts
import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  OIDC_ISSUER: z.url().refine(v => !v.endsWith("/"), "no trailing slash").default("http://localhost:3000"),
  OIDC_PRIVATE_KEY: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(32).optional(),
  LOGIN_RATE_MAX: z.coerce.number().int().positive().default(10),
  TOKEN_RATE_MAX: z.coerce.number().int().positive().default(60),
  TRUST_PROXY: z.coerce.boolean().default(false),
});
const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("[config] invalid environment:\n" + z.prettifyError(parsed.error));
  process.exit(1);
}
export const env = parsed.data;
export const isDev = env.NODE_ENV === "development" || env.NODE_ENV === "test";
if (env.NODE_ENV === "production" && !env.OIDC_ISSUER.startsWith("https://"))
  throw new Error("OIDC_ISSUER must be https:// in production.");
```

Replace every `process.env.X` read (`app.tsx:64,68,208,230`, `container.ts:26`, `db/index.ts:7`, `oidc_key.ts:15,21`, `session.ts:19,24`) with `env.X` / `!isDev`. Remove the extra `dotenv/config` imports from `container.ts` and `db/index.ts` (keep the one in `drizzle.config.ts` — drizzle-kit runs standalone). Caution: `tests/fail-closed.test.ts` mutates `process.env` and re-imports — the fail-closed checks in `session.ts`/`oidc_key.ts` must keep reading env through a function call, not a module-level constant.

**A3. Entry point: PORT, graceful shutdown, crash policy** (SRV-1 + OPS-2, High)
`src/index.ts` hardcodes port 3000, has no SIGTERM/SIGINT handling, never closes the pg pool, and no unhandledRejection policy. Export `const closeDb = () => client.end({ timeout: 5 })` from `src/db/index.ts`, then rewrite `src/index.ts`: read `env.PORT`, on SIGTERM/SIGINT set a 10s `setTimeout(...).unref()` hard deadline, `server.close()`, `await closeDb()`, exit 0; on `unhandledRejection` log + drain + exit 1; on `uncaughtException` log + exit 1 immediately. Guard against double shutdown with a boolean. (The BFF needs none of this — adapter-node already handles SIGTERM.)

**A4. Seed script: close the pool instead of `process.exit(0)`** (SRV-10, Medium)
`src/db/seed.ts:101-104` — replace `process.exit(0)` with `await seed(); await closeDb();` so stdout isn't truncated and failures exit non-zero naturally.

**A5. BFF refuses the published dev client secret outside dev** (OPS-3 item 3, High)
`example-client/src/lib/server/config.ts` defaults `OAUTH_CLIENT_SECRET` to the literal `bff-dev-secret-change-me` that is published in this repo. Inside `discover()` (not module top level — it must not fire during `vite build`): `if (!dev && config.clientSecret === DEV_CLIENT_SECRET) throw new Error(...)` using `dev` from `$app/environment`.

**A6. `.env.example` completeness** (DX-3 + OPS additions, Medium)
Add every var the config module knows, with one-line comments: `PORT`, `LOGIN_RATE_MAX` (10/15min per IP), `TOKEN_RATE_MAX` (60/min per IP), `TRUST_PROXY`. Note that `OIDC_ISSUER` must byte-match the externally reachable URL, no trailing slash — the BFF verifies it byte-for-byte.

### WS-B — Build, deploy & CI

**B1. Real build + start + Dockerfiles** (OPS-1 + SRV-3 + DX-5 + CLI-7, High)
Nothing deployable is ever produced; `tsx` is a devDependency; Node's `--experimental-strip-types` is not an option because `app.tsx`/views are JSX (document this — it's the confusing failure a forker will hit). Do:
- Add `tsconfig.build.json`: `{ "extends": "./tsconfig.json", "compilerOptions": { "noEmit": false, "outDir": "dist", "rootDir": "src", "sourceMap": true } }`.
- Root scripts per the adjudicated decision (#3 above), plus `"db:migrate:prod": "node dist/db/migrate.js"`.
- Multi-stage `Dockerfile` for the server (node:22-alpine, corepack, `pnpm install --frozen-lockfile` → compile → prod-deps stage → runtime stage with `ENV NODE_ENV=production` (load-bearing for A1), `COPY drizzle ./drizzle`, `USER node`, `EXPOSE 3000`, `CMD ["node","dist/index.js"]`, plus a `HEALTHCHECK` curling `/healthz` once E1 adds it). Companion `.dockerignore`: `node_modules`, `dist`, `build`, `.svelte-kit`, `.git`, `.env`, `tests`, `.plan-bender`.
- `example-client/Dockerfile`: adapter-node already emits a runnable server — build stage runs `pnpm run build`, runtime stage `CMD ["node","build"]`, `USER node`. Add `"start": "node build"` to `example-client/package.json` and **remove the unused `@sveltejs/adapter-auto`** devDependency (a live trap: switching to it silently breaks the in-memory session store on serverless).

**B2. Production migration path with an advisory lock** (OPS-5, High)
`pnpm db:migrate` shells to `drizzle-kit` (devDependency) — the prod image can't migrate. Drizzle's postgres migrator takes no advisory lock, so two replicas rolling out simultaneously race the DDL. Add `src/db/migrate.ts` using `drizzle-orm/postgres-js/migrator` (already a prod dep; pattern proven in `tests/setup/global-setup.ts:29`), wrapped in `select pg_advisory_lock(<stable-key>)` / unlock, `max: 1` connection, reading `process.env.DATABASE_URL` directly with its own guard (self-contained — no import from WS-A's config so the streams stay independent). Run it as a one-shot release job before new replicas serve, never at app boot.

**B3. CI: compile, build the image, lint the client, coverage** (OPS-12 + TEST-5/DX-9 + TEST-4, Medium)
- `server` job: rename the type-check step to `pnpm typecheck`, add `pnpm run build` (real emit) and `docker build -t oauth-server:ci .`; optionally a smoke step that boots the image against the CI Postgres with production-shaped env (`NODE_ENV=production`, generated `SESSION_SECRET`/`OIDC_PRIVATE_KEY`, `OIDC_ISSUER=https://ci.example.com`) and curls `/healthz` — this single step catches regressions in A1–A3, B1, and E1's health endpoint at once.
- `web` job: add `- run: pnpm run lint` (currently nothing in CI checks example-client formatting).
- Add a `coverage` block (`provider: "v8"`, `reporter: ["text","html"]`) to both `vitest.config.ts` files and `test:coverage` scripts; report-only, no thresholds.

**B4. Repo plumbing fixes** (DX-2/OPS-11 + DX-8 + DX-10/DX-11, Medium)
- `.github/dependabot.yml`: `directory: "/web"` → `"/example-client"` — the rename silently stopped all client dependency updates, **including `jose`, which does the id_token crypto**. Add a `github-actions` ecosystem entry while there.
- Add `"packageManager": "pnpm@10.x.y"` and `"license": "MIT"` to both `package.json` files.
- `docker-compose.yml`: add a `pg_isready` healthcheck (mirroring CI) so `docker compose up -d && pnpm db:migrate` stops racing cold-volume startup, and bind the port to loopback (`127.0.0.1:8888:5432`).
- Add `"db:reset": "docker compose down -v && docker compose up -d --wait && pnpm db:migrate && pnpm db:seed"`.

### WS-C — SvelteKit client rework

**C1. Adopt SvelteKit server idioms: SSR, hooks, load, form actions** (CLI-2, High)
`+layout.ts` sets `ssr = false` and the page `onMount`-fetches identity the server already had in cookies — a BFF is the one architecture where SvelteKit's server primitives fit perfectly, and the template demonstrates none of them. Add `src/hooks.server.ts` (`handle` resolves the `sid` cookie → `event.locals.session`, clearing stale cookies), type `App.Locals`, add `+page.server.ts` with a `load` returning `{ user }` and a `logout` form action (replacing `auth/logout/+server.ts`), re-enable SSR, replace the `me`/`onMount` state with `let { data } = $props()`, use `<form method="POST" action="?/logout" use:enhance>`. Delete `api/me/+server.ts` once `load` replaces it. Keep `/api/contacts` as a fetch-on-demand endpoint.

**C2. Upstream 401 vs session-expiry are indistinguishable — dead button** (CLI-3, High)
`api/contacts/+server.ts:61` forwards upstream statuses verbatim; the page treats every 401 as "session gone", re-fetches identity, finds the session alive, and shows nothing. On upstream 401: destroy the session, clear the cookie, return `{ error: "session_expired" }` 401. Map any other upstream failure to 502 `{ error: "upstream_error" }`. In the page, show an error for every non-ok response.

**C3. Denied consent renders the stock error page** (CLI-5, Medium)
Denying consent is a first-class outcome, not an exception. In `auth/callback/+server.ts`, turn the AS `error` param and the expired-state case into `redirect(302, "/?auth_error=...")`; render a `role="status"` banner on the home page mapping `access_denied` and `expired_state` to friendly text. Add `+error.svelte` (status, message, link home) for genuinely exceptional cases.

**C4. Session TTL bug + store eviction + swap seam** (CLI-6 + OPS-4, High)
`createSession`/`updateSession` call `sessions.set(sid, value)` with **no TTL** — sessions and the refresh tokens they hold live forever; `MemoryStore` evicts only lazily on `get`, so abandoned `pending` records leak. Move `SESSION_TTL` into `session.ts` as the single constant (the callback route currently duplicates it), pass it on every `set`, add a lazy sweep to `MemoryStore.set()` (sweep expired entries at most once per minute — no timers). Define `interface SessionStore<T>` in `session.ts`, have `MemoryStore` implement it, add `setSessionStore()` for injection. Tests: expired entry gone after a `set` sweep; session created in the past reads back undefined.

**C5. Network-failure handling + in-flight state** (CLI-8, Medium)
`loadContacts` and logout have no try/catch (unhandled rejection, silent dead button) and no loading state. Wrap both, reuse the existing "Couldn't reach the server" wording, add `let loading = $state(false)` with `disabled={loading}`.

**C6. `sid` cookie `SameSite=Strict` → `Lax`** (CLI-15, Low)
Strict can drop the cookie on the redirect landing after a genuinely cross-site callback. `Lax` still blocks cross-site POSTs (the CSRF-relevant case; SvelteKit's origin check also covers the logout POST). Record the reasoning in the comment.

**C7. Landmarks, live regions, validated JSON boundaries, app.css** (CLI-11 + CLI-13 + client half of CLI-12, Medium)
Wrap `{@render children()}` in `<main>`; drop the one-link `<nav>`. Error messages get `role="alert"` / status banners `role="status"`. Replace bare `as` casts / untyped `res.json()` with small type guards (or zod) at the fetch boundaries — `oauth.ts:83` should verify `access_token` is a string before building an Authorization header. Create `example-client/src/app.css` with the shared token block from the interfaces section and import it in `+layout.svelte`.

**C8. BFF route-handler tests** (TEST-1, High)
The most security-sensitive files in the BFF (state consumption in the callback, cookie minting, refresh-then-401 handling, best-effort revoke on logout) have zero tests — only their pure dependencies do. After C1's refactor, test the handlers (either extract handler cores as pure functions mirroring `oauth.ts`, or a second vitest project loading the sveltekit plugin). Minimum cases: error param → redirect; missing code/state → 400; state mismatch → 400; success sets `sid` with httpOnly; email falls back to userinfo; contacts with no cookie → 401; refresh failure destroys session; logout revokes best-effort and always clears the cookie.

### WS-D — Documentation

**D1. Rewrite `example-client/README.md`** (DX-1 = CLI-1 = OPS-10, High — flagged independently by three reviewers)
It documents the pre-BFF SPA: `sessionStorage` PKCE, a script-readable refresh-token cookie ("DEMO ONLY"), routes `/login`/`/callback`/`/refresh`, files that no longer exist, the wrong seeded client (public `0e2ec2df-…` instead of confidential `b1ff0000-…`), a dev proxy that was removed, and `adapter-static` output that an operator would try to deploy to a static host. Rewrite around the BFF: confidential client, tokens server-side, browser holds only `sid`; actual route table; env vars incl. adapter-node's `ORIGIN`/`PORT`; `pnpm build` → Node server in `build/`, started with `node build`; link ADR-0001; "Demo limitations" = in-process store (single instance) + dev-default secret; "Swapping the session store" section for C4's seam.

**D2. Root README corrections and additions** (DX-4 + DX-6 + OPS notes, Medium)
- Install line must include `--ignore-workspace` (CI and the client README both use it; the root README's copy-paste line is the one that's wrong).
- Add "Deploying" (tsc → `dist/`, `node dist/index.js`, `NODE_ENV=production` required, why strip-types can't work here, migration-before-rollout order, probe split `/healthz` liveness vs `/readyz` readiness).
- Add "Using this as a template" (what to rename: package names, `POSTGRES_DB`, seeded client IDs/redirect URIs, `OIDC_ISSUER`; pointer to `seed.ts`; seed is idempotent but writes known credentials — never run against production).
- Document `ORIGIN` for the BFF behind TLS-terminating proxies (adapter-node derives origin from Host otherwise, breaking the origin CSRF check), `TRUST_PROXY`, and the JWKS key-rotation procedure (add new active key, keep old public key published for max token TTL, then drop).
- Prerequisites: mention `mise install` as the optional toolchain pin.

**D3. docs/ hygiene** (DX-7, Low)
`docs/plans/` and `docs/grill/` are plan-bender working artifacts, unlinked and indistinguishable from current docs. Either link them from CONTEXT.md as "design history" or move under `docs/history/` with a one-line index.

---

## Wave 2

### WS-E1 — HTTP surface hardening (`src/app.tsx` owner)

**E1-1. Security headers — consent page is clickjackable** (SEC-2, High)
Nothing sets `X-Frame-Options`/CSP/`frame-ancestors` — framing the consent page and tricking a click on "Approve" is the classic OAuth clickjacking attack (RFC 6749 §10.13, RFC 9700). Mount `secureHeaders` from `hono/secure-headers` app-wide: CSP `default-src 'self'; frame-ancestors 'none'; form-action 'self'; style-src 'unsafe-inline'` (views use inline `<style>`), `Referrer-Policy: no-referrer` (the login/consent URLs carry `state` and `code_challenge`), HSTS in non-dev, `X-Frame-Options: DENY`. Test that GET `/api/login` and `/api/scopes` carry `frame-ancestors 'none'`.

**E1-2. Trusted client IP + rate limiter fixes** (SEC-3 + SEC-8 + SEC-15 + OPS-8, High)
The limiter keys on the first (attacker-supplied) `X-Forwarded-For` hop: rotating the header bypasses it entirely, each rotation leaks a Map entry forever, and with no proxy all clients collapse into one shared bucket (one abuser locks out every user's login). Also `app.tsx:197-201` writes that same spoofable value into the `inet` column — `X-Forwarded-For: not-an-ip` passes password verification then 500s on the Postgres inet parse. Do:
- New `src/lib/client_ip.ts`: honor XFF (rightmost untrusted hop, `.split(",").pop()`) only when `env.TRUST_PROXY`; otherwise `getConnInfo(c).remote.address` from `@hono/node-server/conninfo`.
- `rate_limit.ts`: accept a key function; sweep expired buckets on write (no timers).
- `lastLoginIP`: use `clientIp()`, validate with `node:net`'s `isIP` (store null on failure), and never let the audit UPDATE fail the login.
- Token endpoint: count only failed responses (status ≥ 400 after `next()`) against the bucket — a confidential BFF funnels all users through one egress IP, so counting successes locks the whole client base out at ~60 logins/min.
- Tests: rotating XFF without TRUST_PROXY lands in one bucket; expired buckets evicted; garbage XFF login still 302s.

**E1-3. `jid` cookie: `Strict` → `Lax`, `__Host-` prefix** (SEC-4, Medium)
An AS session cookie must survive top-level navigations arriving from the client's site; with `Strict`, once AS and client are on different registrable domains every authorize looks logged-out — SSO silently dies. Switch to `Lax` (still blocks cross-site POSTs), use Hono's `prefix: "host"` in non-dev, export the cookie-name constant for `current_user.ts` and tests.

**E1-4. OIDC `prompt`/`max_age` enforcement** (SEC-5, Medium)
The library parses them onto the AuthorizationRequest but leaves enforcement to the app, which ignores both: `max_age=300` against a 29-day session sails through and only dies at the token endpoint; `prompt=none` shows the login page instead of redirecting with `error=login_required` (OIDC Core §3.1.2.1 hard MUST NOT). Compute freshness from `user.lastLoginAt` vs `authRequest.maxAge`; `prompt=none` + (no user or stale) → 302 to redirect_uri with `error=login_required` and `state`; `prompt=login` or stale → treat as logged out. Same check on the `/api/scopes` routes. Tests in `tests/oidc.test.ts`.

**E1-5. Consent-page gaps** (SEC-12, Low)
GET `/api/scopes` renders consent to anonymous visitors (client/scope enumeration; unanswerable form) — redirect to login when no user. Pass `user.email` to the view so consent shows *who* is consenting. Add `app.use("/api/logout", csrf())` (defense-in-depth once cookies go Lax).

**E1-6. Login failure UX** (CLI-4, High)
Wrong password currently replaces the page with the bare string `Unauthorized`; the query string and form are lost. Re-render the `Login` view (401) with `error="Email or password is incorrect."` and the typed email preserved; give `zValidator` a hook that re-renders with a 400 instead of raw JSON. Keep the message identical across unknown-email/wrong-password branches (preserves the enumeration defense).

**E1-7. `jti as string` unsafe cast → 500** (SRV-6, Medium)
`app.tsx:125` casts an optional claim; a token without `jti` reaches Drizzle as `eq(col, undefined)`, throws, and surfaces as 500 instead of 401. Guard `if (!payload.jti) return bearerUnauthorized(...)` before the lookup.

**E1-8. Extract `requireScope` middleware; inject `currentUser`** (SRV-14 + SRV-9, Medium)
27 of the 33 lines of `/api/contacts` are reusable resource-server plumbing readers will copy verbatim per route — extract to `src/lib/require_scope.ts` with `accessTokenVerifier`/`tokenRepository` constructor-injected. Convert `current_user.ts` from importing the container singleton (service-locator leak; imports open a pg connection) to a factory `currentUser(userRepository)`.

**E1-9. Health endpoints + observability baseline** (OPS-6 + OPS-9, Medium)
- `/healthz` (liveness, touches nothing) and `/readyz` (readiness, `select 1`, 503 on failure) — `/api/ping` can't distinguish "alive" from "DB unreachable".
- **Log in `app.onError`** — currently a production 500 produces a generic OAuth body and *no server-side trace at all*; the single highest-value line in this report. JSON with requestId/method/pathname/error.
- `app.use(requestId())` from `hono/request-id`; widen `AppEnv` with `requestId: string`.
- Replace `hono/logger` (ANSI-colored, unparseable, logs full query strings — which carry `state`, `nonce`, `code_challenge`) with a ~12-line JSON access-log middleware logging pathname only.
- Wire the package's `AuthorizationServerOptions.logger` seam to the same JSON logger at debug (it's the demonstration seam an example should show).
- `app.use(bodyLimit({ maxSize: 64 * 1024 }))` from `hono/body-limit` (pairs with F1's password cap).

### WS-E2 — Server-rendered views

**E2-1. Login form hygiene** (SEC-6 + CLI-10, Medium/High)
`value="password123"` bakes a working credential into the page source of the file forkers are most likely to keep. Remove both `value` attributes; add `autocomplete="username"` + `inputmode="email"` and `autocomplete="current-password"`; render seed credentials as visible helper text instead; delete the dead `href="#"` "Forgot Your Password?" link; drop the layout-only `<fieldset>`; add `maxlength` matching F1's cap. Implement the `error?`/`email?` props from the interface section.

**E2-2. Consent page markup** (CLI-9, Medium)
No `<h1>` (add `Authorize {client.name}`); Approve/Deny wrapped in a `<ul>` announced as "list, 2 items" (replace with a flex `<div class="actions">`); style Deny as secondary so the two actions aren't visually identical; render `userEmail` ("Signed in as …") per E1-5.

**E2-3. Shared styles, dark mode, contrast** (CLI-12 server half + CLI-14, Medium)
Move the `<style>` from `Login.tsx` into `Layout.tsx` using the shared token block (interfaces section) so login and consent stop being two visual languages; white-on-tomato is 2.93:1 (fails WCAG AA) — the token `--accent: #c62f14` clears 4.5:1; `color-scheme: light dark` fixes the white-flash on dark-mode OSes; add the `:focus-visible` rule. Fix `Layout.tsx` metadata: `application-name "Scratchy"` is another project's, description is placeholder; add `<meta name="robots" content="noindex">` (auth screens).

### WS-F — OAuth internals & data layer

**F1. bcryptjs → native bcrypt + password cap** (SEC-7 + SRV-12, Medium)
Per adjudicated decision #1. Swap the dependency in `src/lib/password.ts` only (signatures unchanged); export `BCRYPT_COST = 12` (the seed comment claiming it "lives in one place" becomes true again) and `verifyDummyPassword()` for the login route; route client-secret comparison in `client_repository.ts` through the same helper; login schema gets `password: z.string().min(1).max(256)` (bcrypt truncates at 72 bytes; unbounded input is a KDF-DoS lever).

**F2. Absolute refresh-family lifetime** (SEC-9, Medium)
`issueRefreshToken` re-stamps `now + 30d` on every rotation — one consent can be kept alive forever by refreshing monthly. RFC 9700 recommends bounding overall refresh lifetime. The family anchor already exists (`originatingAuthCodeId`): cap `refreshTokenExpiresAt` at `min(now + 30d, familyStart + ABSOLUTE_TTL)` with `ABSOLUTE_TTL = 30d` as a named constant. Test with a backdated family start.

**F3. Missing indexes + prune script — tables grow forever** (OPS-7, Medium)
Revocation is force-expiry; nothing ever DELETEs, and `revokeDescendantsOf` filters on un-indexed `originating_auth_code_id` — a sequential scan on the hottest security-critical query (the RFC 9700 reuse-detection path) over the fastest-growing table. Add indexes on `oauth_tokens(originating_auth_code_id)`, `oauth_tokens(access_token_expires_at)`, `oauth_auth_codes(expires_at)`; add `src/db/prune.ts` deleting rows whose access *and* refresh windows closed >24h ago (grace window keeps reuse-detection sighted; scope join tables already cascade); `"db:prune": "tsx src/db/prune.ts"` + README line recommending a daily scheduled job (no in-process cron). Generate **one** migration for this + F5's column in this workstream (single owner of `drizzle/` avoids journal conflicts).

**F4. Repository parameter types** (SRV-7, Medium)
Implementations narrow interface parameters to concrete classes (`Client` where the package declares `OAuthClient`) — compiles via bivariance but is unsound, and it's exactly what readers copy. Widen parameter types to the package interfaces; keep the concrete return types (that direction is sound). Fix the stray `_user_id` snake_case parameter.

**F5. Scope descriptions on the consent screen** (SRV-13, Low)
`{scope.description ?? scope.name}` type-checks only via the package's index signature — the column doesn't exist, so consent shows raw `contacts.read`. Add `description: text()` to `oauthScopes`, seed real descriptions ("Read your contacts", "See your email address"). The view expression already tolerates both states, so no coordination with E2 needed. Also `pnpm remove -D @types/jsonwebtoken` (unused).

**F6. Discovery + token-surface tidy-ups** (SEC-10 + SEC-11 + SEC-13, Low)
- Advertise the implemented revocation endpoint: `oidc.metadata: { revocation_endpoint: \`${issuer}/api/oauth2/revoke\` }` in `container.ts`; test discovery contains it.
- Remove `email` from `extraTokenFields` (`custom_jwt_service.ts`) — access tokens travel to every resource server and log sink; identity claims belong in the id_token/userinfo behind the `email` scope. Update the oauth-flow test that decodes the payload. Add the missing docstring explaining what the extension seam is for.
- Align the auth-code TTL placeholder in `auth_code_repository.ts` to `"10m"` (RFC 6749 recommends ≤10 min; the controlling 15m default lives in the library — see Upstream notes).
- Add a test asserting `grant_type=client_credentials` is rejected for every seeded client (the library auto-enables the grant server-wide; per-client `allowedGrants` is the only gate today).

**F7. (Stretch) JWKS key-overlap rotation** (SEC-14, Low)
Optional `OIDC_PREVIOUS_PUBLIC_KEYS` env: `getKeySet()` returns active + previous public JWKs, `verify()` tries each. If skipped, the WS-D rotation-procedure doc is the minimum.

---

## Wave 3

### WS-G — Strictness, lint & remaining test gaps

**G1. Restore the lint ruleset** (SRV-4, Medium)
`.oxlintrc.json` sets `"categories": { "correctness": "off" }` — the entire default ruleset is off to silence four `no-unused-vars` false positives from rest-destructuring. Replace with `"no-unused-vars": ["error", { "ignoreRestSiblings": true, "argsIgnorePattern": "^_" }]` plus `typescript/no-floating-promises` and `no-misused-promises`; widen the lint script to `src tests`.

**G2. Type-check everything; four cheap strictness flags** (SRV-5, Medium)
`include` covers only `src/` — the 19-file test suite and configs are never type-checked. Widen include to tests + configs; add `noUncheckedIndexedAccess`, `noImplicitOverride`, `noUnusedLocals`, `noUnusedParameters`; fix the four resulting one-liners (`app.tsx` redirect fallback, `seed.ts` argv, two `override name =`). Ensure `tsconfig.build.json` still emits only `src/`.

**G3. Independent test gaps** (TEST-2 + TEST-3, Medium)
- `POST /api/oauth2/revoke` with an access token is never exercised through the route (the comment pointing at "oauth-flow's revocation test" references a test that doesn't exist). Add: revoke an issued access token via the endpoint, then assert `/api/contacts` 401s.
- No malformed-zod-body tests: `email=not-an-email`, missing password, `accept=maybe` → assert 400, not a raw 500.

**G4. Comment cleanups + suite hygiene** (SRV-11 remainder + TEST-6/TEST-7, Low)
Delete the export-list-narrating comment in `container.ts:74-76` and the duplicated `casing` comment in `schema.ts` (keep the `db/index.ts` copy); add the missing why-comment on `ScopeRepository.finalize` (it's the entitlement-narrowing hook, deliberately pass-through). Optional: `BCRYPT_COST` override in test env to cut suite wall-clock; a note near `globalSetup` about dropping a corrupted `oauth_test` DB.

---

## Upstream notes for `@jmondi/oauth2-server`

Findings whose root cause is in the package rather than this example (worth fixing at the source since this repo showcases it):

1. **Default `authCodeTTL` is 15 minutes**; RFC 6749 §4.1.2 recommends ≤10. It's a protected field not reachable through `enableGrantTypes` options — either lower the default or expose it as an option.
2. **`client_credentials` and `refresh_token` grants are auto-enabled** by the constructor before `enableGrantTypes` runs, so the token endpoint accepts `grant_type=client_credentials` even when discovery doesn't advertise it. Per-client `allowedGrants` gates it, but enabled-but-undocumented surface invites drift.
3. `prompt`/`max_age` are parsed but inert at the authorize step — consider documenting the consumer's enforcement obligation prominently (this repo now demonstrates it via E1-4).
4. The stale comment in this repo claiming userinfo accepts query-string tokens was wrong — the library correctly rejects the query form; worth an explicit doc line.

## Verified OK — do not "fix"

- PKCE: `requiresPKCE` + `requiresS256`, plain rejected, timing-safe compare; all negatives tested.
- redirect_uri: exact-match after normalization, fragments rejected, loopback-port exception only; no open redirect anywhere (login redirects to a fixed path; deny uses the validated `authRequest.redirectUri`). `safeReturnTo` in the BFF handles absolute/protocol-relative/backslash/control-char tricks.
- Auth-code single-use with family revocation on replay; refresh rotation with reuse detection killing the family; refresh scope narrowing.
- Client auth: secrets bcrypt-hashed, `invalid_client` without echoing ids; revoke endpoint authenticated with token-client binding.
- Login: dummy-hash compare on every path, one generic 401 (no enumeration or timing oracle) — tested.
- Session design: HttpOnly `jid`, separate HS256/RS256 trust domains, `typ:"session"` so id_tokens can't impersonate cookies, `tokenVersion` server-side revocation — tested.
- userinfo: verifier pins RS256/`at+jwt`/iss, revocation-aware, scope-filtered, `sub` unoverridable. id_token: correct `aud`/`nonce`/`auth_time`/`at_hash`, protocol claims protected.
- XSS (hono/jsx auto-escaping), SQL injection (parameterized throughout), CSRF scoping (forms only, fail-closed origin check), error hygiene (typed `OAuthException`s, single boundary).
- `validateIdToken` in the BFF: RS256 pinned, iss/aud/exp/nonce, alg-confusion and `alg:none` tested. `coalesceRefresh` single-flight with `.finally` cleanup. Consume-once `state`.
- Entities derived from Drizzle schema (`$inferSelect` + package interfaces), constructor-injected repositories, ESM hygiene (`.js` specifiers, `node:` prefixes, `verbatimModuleSyntax`), transactional persists, idempotent seed, pinned `postgres:17`, CI env-scoping comments, ADR-0001 itself.
