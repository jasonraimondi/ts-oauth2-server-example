CREATE TYPE "public"."CodeChallengeMethod" AS ENUM('S256', 'plain');--> statement-breakpoint
CREATE TYPE "public"."GrantTypes" AS ENUM('client_credentials', 'authorization_code', 'refresh_token', 'implicit', 'password');--> statement-breakpoint
CREATE TABLE "oauthAuthCodeScopes" (
	"authCodeCode" text NOT NULL,
	"scopeId" uuid NOT NULL,
	CONSTRAINT "oauthAuthCodeScopes_authCodeCode_scopeId_pk" PRIMARY KEY("authCodeCode","scopeId")
);
--> statement-breakpoint
CREATE TABLE "oauthAuthCodes" (
	"code" text PRIMARY KEY NOT NULL,
	"redirectUri" text,
	"codeChallenge" text,
	"codeChallengeMethod" "CodeChallengeMethod" DEFAULT 'plain' NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp (6) DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	"userId" uuid,
	"clientId" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauthClientScopes" (
	"clientId" uuid NOT NULL,
	"scopeId" uuid NOT NULL,
	CONSTRAINT "oauthClientScopes_clientId_scopeId_pk" PRIMARY KEY("clientId","scopeId")
);
--> statement-breakpoint
CREATE TABLE "oauthClients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"secret" varchar(255),
	"createdAt" timestamp (6) DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	"redirectUris" text[] NOT NULL,
	"allowedGrants" "GrantTypes"[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauthScopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"createdAt" timestamp (6) DEFAULT now() NOT NULL,
	"updatedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "oauthTokenScopes" (
	"accessToken" text NOT NULL,
	"scopeId" uuid NOT NULL,
	CONSTRAINT "oauthTokenScopes_accessToken_scopeId_pk" PRIMARY KEY("accessToken","scopeId")
);
--> statement-breakpoint
CREATE TABLE "oauthTokens" (
	"accessToken" text PRIMARY KEY NOT NULL,
	"accessTokenExpiresAt" timestamp NOT NULL,
	"refreshToken" text,
	"refreshTokenExpiresAt" timestamp,
	"createdAt" timestamp (6) DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	"clientId" uuid NOT NULL,
	"userId" uuid,
	CONSTRAINT "oauthTokens_refreshToken_unique" UNIQUE("refreshToken")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"passwordHash" varchar(255),
	"tokenVersion" integer DEFAULT 0 NOT NULL,
	"lastLoginAt" timestamp (6),
	"lastLoginIP" "inet",
	"createdIP" "inet" NOT NULL,
	"createdAt" timestamp (6) DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "oauthAuthCodeScopes" ADD CONSTRAINT "oauthAuthCodeScopes_authCodeCode_oauthAuthCodes_code_fk" FOREIGN KEY ("authCodeCode") REFERENCES "public"."oauthAuthCodes"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauthAuthCodeScopes" ADD CONSTRAINT "oauthAuthCodeScopes_scopeId_oauthScopes_id_fk" FOREIGN KEY ("scopeId") REFERENCES "public"."oauthScopes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauthAuthCodes" ADD CONSTRAINT "oauthAuthCodes_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauthAuthCodes" ADD CONSTRAINT "oauthAuthCodes_clientId_oauthClients_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."oauthClients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauthClientScopes" ADD CONSTRAINT "oauthClientScopes_clientId_oauthClients_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."oauthClients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauthClientScopes" ADD CONSTRAINT "oauthClientScopes_scopeId_oauthScopes_id_fk" FOREIGN KEY ("scopeId") REFERENCES "public"."oauthScopes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauthTokenScopes" ADD CONSTRAINT "oauthTokenScopes_accessToken_oauthTokens_accessToken_fk" FOREIGN KEY ("accessToken") REFERENCES "public"."oauthTokens"("accessToken") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauthTokenScopes" ADD CONSTRAINT "oauthTokenScopes_scopeId_oauthScopes_id_fk" FOREIGN KEY ("scopeId") REFERENCES "public"."oauthScopes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauthTokens" ADD CONSTRAINT "oauthTokens_clientId_oauthClients_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."oauthClients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauthTokens" ADD CONSTRAINT "oauthTokens_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_oauthscope_name" ON "oauthScopes" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_oauthtoken_accesstoken" ON "oauthTokens" USING btree ("accessToken");--> statement-breakpoint
CREATE INDEX "idx_oauthtoken_refreshtoken" ON "oauthTokens" USING btree ("refreshToken");--> statement-breakpoint
CREATE INDEX "idx_users_email" ON "users" USING btree ("email");