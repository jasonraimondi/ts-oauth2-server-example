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

export const grantTypes = pgEnum("GrantTypes", [
  "client_credentials",
  "authorization_code",
  "refresh_token",
  "implicit",
  "password",
]);

export const codeChallengeMethod = pgEnum("CodeChallengeMethod", ["S256", "plain"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    name: varchar("name", { length: 255 }),
    passwordHash: varchar("passwordHash", { length: 255 }),
    tokenVersion: integer("tokenVersion").notNull().default(0),
    lastLoginAt: timestamp("lastLoginAt", { precision: 6 }),
    lastLoginIP: inet("lastLoginIP"),
    createdIP: inet("createdIP").notNull(),
    createdAt: timestamp("createdAt", { precision: 6 }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt"),
  },
  table => [index("idx_users_email").on(table.email)],
);

export const oauthClients = pgTable("oauthClients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  secret: varchar("secret", { length: 255 }),
  createdAt: timestamp("createdAt", { precision: 6 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt"),
  redirectUris: text("redirectUris").array().notNull(),
  allowedGrants: grantTypes("allowedGrants").array().notNull(),
});

export const oauthScopes = pgTable(
  "oauthScopes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    createdAt: timestamp("createdAt", { precision: 6 }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt"),
  },
  table => [index("idx_oauthscope_name").on(table.name)],
);

export const oauthAuthCodes = pgTable("oauthAuthCodes", {
  code: text("code").primaryKey(),
  redirectUri: text("redirectUri"),
  codeChallenge: text("codeChallenge"),
  codeChallengeMethod: codeChallengeMethod("codeChallengeMethod").notNull().default("plain"),
  nonce: text("nonce"),
  authTime: integer("authTime"),
  maxAge: integer("maxAge"),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt", { precision: 6 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt"),
  userId: uuid("userId").references(() => users.id),
  clientId: uuid("clientId")
    .notNull()
    .references(() => oauthClients.id),
});

export const oauthTokens = pgTable(
  "oauthTokens",
  {
    accessToken: text("accessToken").primaryKey(),
    accessTokenExpiresAt: timestamp("accessTokenExpiresAt").notNull(),
    refreshToken: text("refreshToken").unique(),
    refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
    createdAt: timestamp("createdAt", { precision: 6 }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt"),
    clientId: uuid("clientId")
      .notNull()
      .references(() => oauthClients.id),
    userId: uuid("userId").references(() => users.id),
  },
  table => [
    index("idx_oauthtoken_accesstoken").on(table.accessToken),
    index("idx_oauthtoken_refreshtoken").on(table.refreshToken),
  ],
);

export const oauthClientScopes = pgTable(
  "oauthClientScopes",
  {
    clientId: uuid("clientId")
      .notNull()
      .references(() => oauthClients.id),
    scopeId: uuid("scopeId")
      .notNull()
      .references(() => oauthScopes.id),
  },
  table => [primaryKey({ columns: [table.clientId, table.scopeId] })],
);

export const oauthAuthCodeScopes = pgTable(
  "oauthAuthCodeScopes",
  {
    authCodeCode: text("authCodeCode")
      .notNull()
      .references(() => oauthAuthCodes.code),
    scopeId: uuid("scopeId")
      .notNull()
      .references(() => oauthScopes.id),
  },
  table => [primaryKey({ columns: [table.authCodeCode, table.scopeId] })],
);

export const oauthTokenScopes = pgTable(
  "oauthTokenScopes",
  {
    accessToken: text("accessToken")
      .notNull()
      .references(() => oauthTokens.accessToken),
    scopeId: uuid("scopeId")
      .notNull()
      .references(() => oauthScopes.id),
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
