ALTER TABLE "oauthAuthCodes" ADD COLUMN "nonce" text;--> statement-breakpoint
ALTER TABLE "oauthAuthCodes" ADD COLUMN "authTime" integer;--> statement-breakpoint
ALTER TABLE "oauthAuthCodes" ADD COLUMN "maxAge" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "name" varchar(255);