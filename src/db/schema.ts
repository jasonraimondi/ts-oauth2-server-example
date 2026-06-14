import { relations } from "drizzle-orm";
import {
  index,
  inet,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const grantTypes = pgEnum("grant_types", [
  "client_credentials",
  "authorization_code",
  "refresh_token",
  "implicit",
  "password",
]);

export const codeChallengeMethod = pgEnum("code_challenge_method", ["S256", "plain"]);

// Column DB names are derived from the camelCase keys by `casing: "snake_case"`
// (set on the drizzle() client and in drizzle.config.ts), so `passwordHash`
// becomes the `password_hash` column without spelling it out here.
export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  email: varchar({ length: 255 }).notNull().unique(),
  name: varchar({ length: 255 }),
  passwordHash: varchar({ length: 255 }),
  tokenVersion: integer().notNull().default(0),
  lastLoginAt: timestamp({ precision: 6 }),
  lastLoginIP: inet(),
  createdIP: inet().notNull(),
  createdAt: timestamp({ precision: 6 }).notNull().defaultNow(),
  updatedAt: timestamp(),
});

export const oauthClients = pgTable("oauth_clients", {
  id: uuid().primaryKey().defaultRandom(),
  name: varchar({ length: 255 }).notNull(),
  secret: varchar({ length: 255 }),
  createdAt: timestamp({ precision: 6 }).notNull().defaultNow(),
  updatedAt: timestamp(),
  redirectUris: text().array().notNull(),
  allowedGrants: grantTypes().array().notNull(),
});

export const oauthScopes = pgTable(
  "oauth_scopes",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    createdAt: timestamp({ precision: 6 }).notNull().defaultNow(),
    updatedAt: timestamp(),
  },
  // `name` is looked up by value (getAllByIdentifiers) and is not unique, so it
  // needs an explicit index — unlike the PK / unique columns, which already have one.
  table => [index("idx_oauth_scopes_name").on(table.name)],
);

export const oauthAuthCodes = pgTable("oauth_auth_codes", {
  code: text().primaryKey(),
  redirectUri: text(),
  codeChallenge: text(),
  codeChallengeMethod: codeChallengeMethod().notNull().default("plain"),
  nonce: text(),
  authTime: integer(),
  maxAge: integer(),
  expiresAt: timestamp().notNull(),
  createdAt: timestamp({ precision: 6 }).notNull().defaultNow(),
  updatedAt: timestamp(),
  userId: uuid().references(() => users.id, { onDelete: "set null" }),
  clientId: uuid()
    .notNull()
    .references(() => oauthClients.id, { onDelete: "cascade" }),
});

export const oauthTokens = pgTable("oauth_tokens", {
  accessToken: text().primaryKey(),
  accessTokenExpiresAt: timestamp().notNull(),
  refreshToken: text().unique(),
  refreshTokenExpiresAt: timestamp(),
  // The authorization code this token chain descends from — the refresh-token
  // "family" key. The library threads it across rotations; we revoke the whole
  // family on refresh-token reuse or auth-code replay (RFC 9700).
  originatingAuthCodeId: text(),
  createdAt: timestamp({ precision: 6 }).notNull().defaultNow(),
  updatedAt: timestamp(),
  clientId: uuid()
    .notNull()
    .references(() => oauthClients.id, { onDelete: "cascade" }),
  userId: uuid().references(() => users.id, { onDelete: "set null" }),
});

export const oauthClientScopes = pgTable(
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

export const oauthAuthCodeScopes = pgTable(
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

export const oauthTokenScopes = pgTable(
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
