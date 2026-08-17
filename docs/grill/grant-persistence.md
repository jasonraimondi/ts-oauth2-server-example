# Grill: persist consent as a Grant so scope approval isn't re-asked every login

_Status: in progress · updated as we go_

## Decisions

- **What is persisted** — chose a first-class entity per `(Resource Owner, Client)` holding a scope set, over deriving prior approval from live tokens or storing flat per-scope rows. Because consent is its own fact and must survive token expiry and RFC 9700 family revocation; the derived option would make a security event silently re-prompt, and per-scope rows leave nowhere to hang grant-level metadata. Rejected: derive-from-tokens (conflates "user agreed" with "a token is live" — wrong lesson for a teaching repo), flat per-scope rows (partial consent not in scope).
- **Naming** — chose **Grant** for the durable record; **Consent** is now defined as the act. Because `CONTEXT.md` already spends paragraphs disambiguating overloaded terms ("client", "session") and reusing "consent" for both act and artifact repeats that mistake. Rejected `user_client_consents` (the handoff's proposal). `CONTEXT.md` updated: **Grant** added, **Consent** redefined, "never auto-approved" dropped.

- **Where the skip-consent branch lives** — chose `GET /api/oauth2/authorize` as the single interaction-policy decision point (no session → login; session, no covering Grant → consent screen; session + covering Grant → complete). Because it is the only placement that can host `prompt=none` (under the alternative, authorize has already redirected to `/api/login` before any Grant logic runs, breaking the no-UI promise); it also costs one redirect instead of two and keeps `/api/scopes` as purely the consent UI. Rejected: `GET /api/scopes` deciding whether to render itself. Rejected outright: `ScopeRepository.finalize()` — it runs inside token issuance and returns a scope array, so it structurally cannot suppress a page or a redirect; it is the seam for downscoping, not for interaction policy.
- **Fast path is read-only** — the auto-approved path does not write to the Grant (no `updatedAt` bump, no `lastUsedAt`). Because nothing reads such a column today and recency is inferable from `oauth_tokens.createdAt`; a write on every authorize is speculative.
- **Shared completion helper** — the block that sets `user` / `authTime` / `isAuthorizationApproved` and calls `completeAuthorizationRequest` is extracted from `POST /api/scopes` so authorize (auto) and the consent POST (interactive) share one path.

- **`prompt` handling** — implement `consent` (force re-ask despite a covering Grant) and `none` (no UI; redirect back with `error=login_required` or `error=consent_required` per OIDC Core 3.1.2.6, and reject `none` combined with other values as `invalid_request`). Because the authorize placement was justified by `none` being hostable there, and `none` reuses the deny branch's existing error-redirect builder, so the marginal cost over `consent`-only is mostly tests. Rejected: ignoring `prompt` (leaves clients no escape hatch once Grants exist, and renders HTML at a silent-renewal endpoint); rejected `prompt=login` (drags `max_age` in — parked as a captured idea).
- **Advertise it** — add `prompt_values_supported: ["none", "consent"]` to discovery via the `oidc.metadata` spread in `container.ts`. Because implementing a capability and hiding it from discovery is dishonest in a teaching example, and the list also signals that `login` is deliberately unsupported.

- **Scope-change semantics** — coverage is `grant exists && requested ⊆ granted`. On interactive approval the Grant unions: `granted ← granted ∪ requested`. Because union matches incremental authorization as Google/GitHub do it and avoids the prompt churn `replace` causes when a client narrows then re-widens its request. Rejected: replace (a later narrow request would silently shrink the Grant and re-prompt for a scope the user already approved). Accepted consequence: **Grants are monotonic** — without a withdrawal surface, an approval is permanent.
- **Empty-scope edge** — the Grant must exist before the subset check, because `∅ ⊆ ∅` would otherwise auto-approve a no-scope request on a first-ever visit and mint a code without the Resource Owner ever seeing a screen.
- **Consent screen on partial overlap** — shows all requested scopes, not just the ones new since the Grant. Because it needs no change to `src/views/Scopes.tsx` and a delta-only list can mislead a reader into thinking the Client ends up holding only the delta.
- **Issued scopes** — the token always carries the *requested* scopes, never the Grant's full set. Auto-approval must not widen a token to everything the Grant holds.

## Open questions
- Re-prompt semantics when the requested scope set changes — superset check against the Grant, and whether approval unions or replaces.
- Revocation surface — is there any way for a Resource Owner to withdraw a Grant in this pass?

## Assumptions to validate

- The consent screen stays all-or-nothing (no per-scope checkboxes). If wrong, the Grant scope set becomes a partial-approval result and the superset check changes meaning.

## Research

- Does `@jmondi/oauth2-server@5.0.0-rc.5` implement any of this? · **No.** It parses `prompt` into `AuthorizationRequest.prompt` (`dist/index.js:866`) and never reads it. `ScopeRepository.finalize(scopes, grantId, client, userId)` is called by the library and is a no-op here (`src/app/oauth/repositories/scope_repository.ts:20`). No consent/grant persistence of any kind.
- Does discovery advertise `prompt` support today? · **No.** `buildOidcDiscoveryDocument` (`dist/index.js:1463`) emits a fixed capability set with no `prompt_values_supported`; the field is optional in OIDC Discovery so the omission is spec-legal. The `oidc.metadata` spread is the extension point.
- Existing schema shape · `oauthClientScopes` / `oauthAuthCodeScopes` / `oauthTokenScopes` establish the composite-PK join-table idiom a Grant scope table should mirror (`src/db/schema.ts`).

## Landmines found (must be handled by the implementation)

- `tests/helpers.ts:approveAuthorize` hard-codes GET-authorize → POST-scopes. If authorize starts short-circuiting to the client redirect, the helper mints **two** codes instead of failing loudly.
- `tests/setup/truncate.ts` truncates only tokens and auth codes. New Grant tables must be added or state leaks between tests — the suite runs serially in one worker (`vitest.config.ts`, `maxWorkers: 1`), so leakage is certain.
- Docs asserting "never auto-approves" that all go stale on ship: `README.md` lines 5, 13, 37, 140, 142; `CLAUDE.md` (scope-based authorization bullet); the comment at `src/app.tsx:151`. Separately, `README.md:168` lists "Consent persistence" as a known limitation — that bullet gets deleted, not edited.
- `pnpm db:seed` is idempotent (`onConflictDoNothing` / `onConflictDoUpdate`, no truncate), so Grant rows in a developer's dev database survive a re-seed. Re-seeding is not a way to get the consent screen back.

## Captured ideas (out of scope)

- **`prompt=login` + `max_age` re-authentication** — the AS parses `max_age` and persists it on the auth-code row, and sets `auth_time`, but nothing in `src/app.tsx` ever forces re-authentication when the session is older than `max_age`. `prompt=login` is the same machinery. Doing either means authorize can route to `/api/login` despite a live AS Session, and login must not shortcut an already-authenticated user. Open: does forcing re-auth mint a new `jid`, or just update `lastLoginAt`? Deliberately excluded from the Grant work to keep the two features separable.
