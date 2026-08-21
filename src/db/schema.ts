import { relations } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

const GRANT_TYPES = [
  "client_credentials",
  "authorization_code",
  "refresh_token",
  "implicit",
  "password",
] as const;

// SQLite has no uuid type; ids are text and generated application-side.
const uuid = () => text();
const uuidPrimaryKey = () =>
  uuid()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
// Millisecond epoch integers round-trip as Date through drizzle.
const timestamp = () => integer({ mode: "timestamp_ms" });
const timestampNow = () =>
  timestamp()
    .notNull()
    .$defaultFn(() => new Date());

export const users = sqliteTable("users", {
  id: uuidPrimaryKey(),
  email: text().notNull().unique(),
  name: text(),
  passwordHash: text(),
  tokenVersion: integer().notNull().default(0),
  lastLoginAt: timestamp(),
  lastLoginIP: text(),
  createdIP: text().notNull(),
  createdAt: timestampNow(),
  updatedAt: timestamp(),
});

export const oauthClients = sqliteTable("oauth_clients", {
  id: uuidPrimaryKey(),
  name: text().notNull(),
  secret: text(),
  createdAt: timestampNow(),
  updatedAt: timestamp(),
  redirectUris: text({ mode: "json" }).$type<string[]>().notNull(),
  allowedGrants: text({ mode: "json" }).$type<(typeof GRANT_TYPES)[number][]>().notNull(),
});

export const oauthScopes = sqliteTable(
  "oauth_scopes",
  {
    id: uuidPrimaryKey(),
    name: text().notNull(),
    // Shown on the consent screen in place of the raw scope name.
    description: text(),
    createdAt: timestampNow(),
    updatedAt: timestamp(),
  },
  // `name` is looked up by value (getAllByIdentifiers) and is not unique, so it
  // needs an explicit index — unlike the PK / unique columns, which already have one.
  table => [index("idx_oauth_scopes_name").on(table.name)],
);

export const oauthAuthCodes = sqliteTable(
  "oauth_auth_codes",
  {
    code: text().primaryKey(),
    redirectUri: text(),
    codeChallenge: text(),
    codeChallengeMethod: text({ enum: ["S256", "plain"] })
      .notNull()
      .default("plain"),
    nonce: text(),
    authTime: integer(),
    maxAge: integer(),
    expiresAt: timestamp().notNull(),
    createdAt: timestampNow(),
    updatedAt: timestamp(),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    clientId: uuid()
      .notNull()
      .references(() => oauthClients.id, { onDelete: "cascade" }),
  },
  // The prune job sweeps codes by expiry.
  table => [index("idx_oauth_auth_codes_expires_at").on(table.expiresAt)],
);

export const oauthTokens = sqliteTable(
  "oauth_tokens",
  {
    accessToken: text().primaryKey(),
    accessTokenExpiresAt: timestamp().notNull(),
    refreshToken: text().unique(),
    refreshTokenExpiresAt: timestamp(),
    // The authorization code this token chain descends from — the refresh-token
    // "family" key. The library threads it across rotations; we revoke the whole
    // family on refresh-token reuse or auth-code replay (RFC 9700).
    originatingAuthCodeId: text(),
    createdAt: timestampNow(),
    updatedAt: timestamp(),
    clientId: uuid()
      .notNull()
      .references(() => oauthClients.id, { onDelete: "cascade" }),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
  },
  table => [
    // The family lookup on the hottest security-critical path: reuse detection
    // revokes descendants by this column, and it grows with the token table.
    index("idx_oauth_tokens_originating_auth_code_id").on(table.originatingAuthCodeId),
    // The prune job sweeps tokens by expiry.
    index("idx_oauth_tokens_access_token_expires_at").on(table.accessTokenExpiresAt),
  ],
);

export const oauthClientScopes = sqliteTable(
  "oauth_client_scopes",
  {
    clientId: uuid()
      .notNull()
      .references(() => oauthClients.id, { onDelete: "cascade" }),
    scopeId: uuid()
      .notNull()
      .references(() => oauthScopes.id, { onDelete: "cascade" }),
  },
  table => [primaryKey({ columns: [table.clientId, table.scopeId] })],
);

export const oauthAuthCodeScopes = sqliteTable(
  "oauth_auth_code_scopes",
  {
    authCodeCode: text()
      .notNull()
      .references(() => oauthAuthCodes.code, { onDelete: "cascade" }),
    scopeId: uuid()
      .notNull()
      .references(() => oauthScopes.id, { onDelete: "cascade" }),
  },
  table => [primaryKey({ columns: [table.authCodeCode, table.scopeId] })],
);

export const oauthTokenScopes = sqliteTable(
  "oauth_token_scopes",
  {
    accessToken: text()
      .notNull()
      .references(() => oauthTokens.accessToken, { onDelete: "cascade" }),
    scopeId: uuid()
      .notNull()
      .references(() => oauthScopes.id, { onDelete: "cascade" }),
  },
  table => [primaryKey({ columns: [table.accessToken, table.scopeId] })],
);

export const usersRelations = relations(users, ({ many }) => ({
  authCodes: many(oauthAuthCodes),
  tokens: many(oauthTokens),
}));

export const oauthClientsRelations = relations(oauthClients, ({ many }) => ({
  clientScopes: many(oauthClientScopes),
  authCodes: many(oauthAuthCodes),
  tokens: many(oauthTokens),
}));

export const oauthScopesRelations = relations(oauthScopes, ({ many }) => ({
  clientScopes: many(oauthClientScopes),
  authCodeScopes: many(oauthAuthCodeScopes),
  tokenScopes: many(oauthTokenScopes),
}));

export const oauthAuthCodesRelations = relations(oauthAuthCodes, ({ one, many }) => ({
  user: one(users, { fields: [oauthAuthCodes.userId], references: [users.id] }),
  client: one(oauthClients, {
    fields: [oauthAuthCodes.clientId],
    references: [oauthClients.id],
  }),
  authCodeScopes: many(oauthAuthCodeScopes),
}));

export const oauthTokensRelations = relations(oauthTokens, ({ one, many }) => ({
  client: one(oauthClients, {
    fields: [oauthTokens.clientId],
    references: [oauthClients.id],
  }),
  user: one(users, { fields: [oauthTokens.userId], references: [users.id] }),
  tokenScopes: many(oauthTokenScopes),
}));

export const oauthClientScopesRelations = relations(oauthClientScopes, ({ one }) => ({
  client: one(oauthClients, {
    fields: [oauthClientScopes.clientId],
    references: [oauthClients.id],
  }),
  scope: one(oauthScopes, {
    fields: [oauthClientScopes.scopeId],
    references: [oauthScopes.id],
  }),
}));

export const oauthAuthCodeScopesRelations = relations(oauthAuthCodeScopes, ({ one }) => ({
  authCode: one(oauthAuthCodes, {
    fields: [oauthAuthCodeScopes.authCodeCode],
    references: [oauthAuthCodes.code],
  }),
  scope: one(oauthScopes, {
    fields: [oauthAuthCodeScopes.scopeId],
    references: [oauthScopes.id],
  }),
}));

export const oauthTokenScopesRelations = relations(oauthTokenScopes, ({ one }) => ({
  token: one(oauthTokens, {
    fields: [oauthTokenScopes.accessToken],
    references: [oauthTokens.accessToken],
  }),
  scope: one(oauthScopes, {
    fields: [oauthTokenScopes.scopeId],
    references: [oauthScopes.id],
  }),
}));
