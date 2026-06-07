CREATE TYPE "public"."code_challenge_method" AS ENUM('S256', 'plain');--> statement-breakpoint
CREATE TYPE "public"."grant_types" AS ENUM('client_credentials', 'authorization_code', 'refresh_token', 'implicit', 'password');--> statement-breakpoint
CREATE TABLE "oauth_auth_code_scopes" (
	"auth_code_code" text NOT NULL,
	"scope_id" uuid NOT NULL,
	CONSTRAINT "oauth_auth_code_scopes_auth_code_code_scope_id_pk" PRIMARY KEY("auth_code_code","scope_id")
);
--> statement-breakpoint
CREATE TABLE "oauth_auth_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"redirect_uri" text,
	"code_challenge" text,
	"code_challenge_method" "code_challenge_method" DEFAULT 'plain' NOT NULL,
	"nonce" text,
	"auth_time" integer,
	"max_age" integer,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"user_id" uuid,
	"client_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_client_scopes" (
	"client_id" uuid NOT NULL,
	"scope_id" uuid NOT NULL,
	CONSTRAINT "oauth_client_scopes_client_id_scope_id_pk" PRIMARY KEY("client_id","scope_id")
);
--> statement-breakpoint
CREATE TABLE "oauth_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"secret" varchar(255),
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"redirect_uris" text[] NOT NULL,
	"allowed_grants" "grant_types"[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_scopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "oauth_token_scopes" (
	"access_token" text NOT NULL,
	"scope_id" uuid NOT NULL,
	CONSTRAINT "oauth_token_scopes_access_token_scope_id_pk" PRIMARY KEY("access_token","scope_id")
);
--> statement-breakpoint
CREATE TABLE "oauth_tokens" (
	"access_token" text PRIMARY KEY NOT NULL,
	"access_token_expires_at" timestamp NOT NULL,
	"refresh_token" text,
	"refresh_token_expires_at" timestamp,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"client_id" uuid NOT NULL,
	"user_id" uuid,
	CONSTRAINT "oauth_tokens_refreshToken_unique" UNIQUE("refresh_token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255),
	"password_hash" varchar(255),
	"token_version" integer DEFAULT 0 NOT NULL,
	"last_login_at" timestamp (6),
	"last_login_ip" "inet",
	"created_ip" "inet" NOT NULL,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "oauth_auth_code_scopes" ADD CONSTRAINT "oauth_auth_code_scopes_auth_code_code_oauth_auth_codes_code_fk" FOREIGN KEY ("auth_code_code") REFERENCES "public"."oauth_auth_codes"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_auth_code_scopes" ADD CONSTRAINT "oauth_auth_code_scopes_scope_id_oauth_scopes_id_fk" FOREIGN KEY ("scope_id") REFERENCES "public"."oauth_scopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_auth_codes" ADD CONSTRAINT "oauth_auth_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_auth_codes" ADD CONSTRAINT "oauth_auth_codes_client_id_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client_scopes" ADD CONSTRAINT "oauth_client_scopes_client_id_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client_scopes" ADD CONSTRAINT "oauth_client_scopes_scope_id_oauth_scopes_id_fk" FOREIGN KEY ("scope_id") REFERENCES "public"."oauth_scopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_token_scopes" ADD CONSTRAINT "oauth_token_scopes_access_token_oauth_tokens_access_token_fk" FOREIGN KEY ("access_token") REFERENCES "public"."oauth_tokens"("access_token") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_token_scopes" ADD CONSTRAINT "oauth_token_scopes_scope_id_oauth_scopes_id_fk" FOREIGN KEY ("scope_id") REFERENCES "public"."oauth_scopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_client_id_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_oauth_scopes_name" ON "oauth_scopes" USING btree ("name");