CREATE TABLE `oauth_auth_code_scopes` (
	`auth_code_code` text NOT NULL,
	`scope_id` text NOT NULL,
	PRIMARY KEY(`auth_code_code`, `scope_id`),
	FOREIGN KEY (`auth_code_code`) REFERENCES `oauth_auth_codes`(`code`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scope_id`) REFERENCES `oauth_scopes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `oauth_auth_codes` (
	`code` text PRIMARY KEY NOT NULL,
	`redirect_uri` text,
	`code_challenge` text,
	`code_challenge_method` text DEFAULT 'plain' NOT NULL,
	`nonce` text,
	`auth_time` integer,
	`max_age` integer,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`user_id` text,
	`client_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_oauth_auth_codes_expires_at` ON `oauth_auth_codes` (`expires_at`);--> statement-breakpoint
CREATE TABLE `oauth_client_scopes` (
	`client_id` text NOT NULL,
	`scope_id` text NOT NULL,
	PRIMARY KEY(`client_id`, `scope_id`),
	FOREIGN KEY (`client_id`) REFERENCES `oauth_clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scope_id`) REFERENCES `oauth_scopes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `oauth_clients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`secret` text,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`redirect_uris` text NOT NULL,
	`allowed_grants` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth_scopes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_oauth_scopes_name` ON `oauth_scopes` (`name`);--> statement-breakpoint
CREATE TABLE `oauth_token_scopes` (
	`access_token` text NOT NULL,
	`scope_id` text NOT NULL,
	PRIMARY KEY(`access_token`, `scope_id`),
	FOREIGN KEY (`access_token`) REFERENCES `oauth_tokens`(`access_token`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scope_id`) REFERENCES `oauth_scopes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `oauth_tokens` (
	`access_token` text PRIMARY KEY NOT NULL,
	`access_token_expires_at` integer NOT NULL,
	`refresh_token` text,
	`refresh_token_expires_at` integer,
	`originating_auth_code_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`client_id` text NOT NULL,
	`user_id` text,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_tokens_refreshToken_unique` ON `oauth_tokens` (`refresh_token`);--> statement-breakpoint
CREATE INDEX `idx_oauth_tokens_originating_auth_code_id` ON `oauth_tokens` (`originating_auth_code_id`);--> statement-breakpoint
CREATE INDEX `idx_oauth_tokens_access_token_expires_at` ON `oauth_tokens` (`access_token_expires_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`password_hash` text,
	`token_version` integer DEFAULT 0 NOT NULL,
	`last_login_at` integer,
	`last_login_ip` text,
	`created_ip` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);