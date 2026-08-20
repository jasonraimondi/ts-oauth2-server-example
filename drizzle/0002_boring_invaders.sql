ALTER TABLE "oauth_scopes" ADD COLUMN "description" text;--> statement-breakpoint
CREATE INDEX "idx_oauth_auth_codes_expires_at" ON "oauth_auth_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_oauth_tokens_originating_auth_code_id" ON "oauth_tokens" USING btree ("originating_auth_code_id");--> statement-breakpoint
CREATE INDEX "idx_oauth_tokens_access_token_expires_at" ON "oauth_tokens" USING btree ("access_token_expires_at");