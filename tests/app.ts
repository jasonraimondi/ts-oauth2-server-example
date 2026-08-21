import { createApp } from "../src/app.js";
import { createContainer } from "../src/container.js";
import { createDb } from "../src/db/index.js";
import { env } from "../src/lib/config.js";

// One app instance shared by the whole suite, bound to the oauth_test database.
// vitest.config.ts runs every file in one worker, so this module loads once.
export const { db } = createDb(env.DATABASE_URL);
export const container = createContainer(db);
export const { authorizationServer, jwt, userRepository, tokenRepository } = container;
export const app = createApp(container);
