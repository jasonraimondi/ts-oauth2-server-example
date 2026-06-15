# OAuth2 / OIDC Example

The shared language for this repo: an OAuth 2.0 + OpenID Connect authorization server (Hono) and the browser client that authenticates against it. This glossary exists because several terms here — "client", "session" — are dangerously overloaded across the two halves of the system.

## Language

### Actors

**Authorization Server** (AS):
The Hono service (`:3000`) that authenticates the **Resource Owner**, runs consent, and issues tokens.
_Avoid_: "the backend", "the API", "the OAuth server" (it is specifically the AS, not a resource API).

**Resource Owner**:
The human (the seeded user) who logs in at the AS and grants consent.
_Avoid_: "the account" (ambiguous with the client app's notion of a logged-in user).

**Client** / **Relying Party** (RP):
The application requesting tokens on the Resource Owner's behalf. In this repo the Client is the **BFF**, not the browser.
_Avoid_: using "client" to mean the browser, the SPA, or `oauthClients` row interchangeably — say **BFF** or **browser** when that is what you mean.

**Backend-for-Frontend** (BFF):
The server-side half of the SvelteKit app (`:5173`) that _is_ the OAuth Client — it holds the tokens and exposes a same-origin API to the browser.
_Avoid_: "the SPA", "the frontend server".

**Resource Server**:
The endpoint that accepts an access token and serves a protected resource (the AS also plays this role for `/api/contacts` and `/userinfo`).
_Avoid_: conflating with the AS even though they share a process here.

### Credentials & sessions

**Confidential Client**:
A Client that authenticates to the AS with a `client_secret` (the BFF). Its secret is stored as a bcrypt hash at rest.

**Public Client**:
A Client with no secret, relying on PKCE alone. The original in-browser SPA was one; the BFF rewrite retires it.

**AS Session**:
The Resource Owner's authenticated session _at the AS_, carried by the `jid` cookie (HS256). Governs login + consent.
_Avoid_: plain "session" — always qualify.

**BFF Session**:
The end-user's session _with the Client app_, carried by an opaque `sid` cookie mapping to server-side token storage. A different trust relationship from the **AS Session**.
_Avoid_: plain "session".

**Consent**:
The Resource Owner's explicit per-request approval of requested scopes; never auto-approved.

## Relationships

- A **Resource Owner** authenticates to the **Authorization Server**, producing an **AS Session**.
- A **BFF** is one **Confidential Client** of the **Authorization Server**.
- A **BFF** holds tokens and issues the browser a **BFF Session**; the browser never holds tokens.
- The **BFF** spends an access token against the **Resource Server**; the browser only ever calls the **BFF**.

## Example dialogue

> **Dev:** "After login, does the browser store the access token?"
> **Domain expert:** "No. The **BFF** holds it server-side and the browser gets a **BFF Session** cookie. The token only leaves the **BFF** when it calls the **Resource Server**."
> **Dev:** "And the `jid` cookie?"
> **Domain expert:** "Different thing — that's the **AS Session**, the **Resource Owner** being logged in _at the AS_ for consent. Two sessions, two trust domains."

## Flagged ambiguities

- "client" was used for the browser, the SvelteKit app, and a DB `oauthClients` row — resolved: the **Client/BFF** is the SvelteKit server; the browser is the **browser**; a registered record is an "`oauthClients` row".
- "session" meant both the `jid` AS login and the user's app session — resolved into distinct **AS Session** (`jid`) and **BFF Session** (`sid`).
