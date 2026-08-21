import type { D1Database, ExecutionContext } from "@cloudflare/workers-types";
import { drizzle } from "drizzle-orm/d1";

import { createApp } from "./app.js";
import { createContainer } from "./container.js";
import { drizzleOptions } from "./db/index.js";

type Env = { DB: D1Database };

// The D1 binding is stable for the life of the isolate, so the container (and
// with it the parsed OIDC key) is built once, not per request.
let app: ReturnType<typeof createApp> | undefined;

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    app ??= createApp(createContainer(drizzle(env.DB, drizzleOptions)));
    return app.fetch(request, env, ctx);
  },
};
