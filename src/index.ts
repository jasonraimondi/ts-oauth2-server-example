import { serve } from "@hono/node-server";

import { app } from "./app.js";
import { closeDb } from "./db/index.js";
import { env } from "./lib/config.js";

// Long enough for in-flight OAuth requests to finish, short enough to stay under
// a container orchestrator's default termination grace period.
const SHUTDOWN_DEADLINE_MS = 10_000;

const server = serve({ fetch: app.fetch, port: env.PORT }, info => {
  console.log(`Server running at http://localhost:${info.port}`);
});

let shuttingDown = false;

async function shutdown(reason: string, exitCode: number): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${reason} — draining`);

  // unref'd so a drain that finishes early is not held open by the deadline itself.
  setTimeout(() => {
    console.error("[server] drain exceeded the shutdown deadline — forcing exit");
    process.exit(1);
  }, SHUTDOWN_DEADLINE_MS).unref();

  await new Promise<void>(resolve => server.close(() => resolve()));
  await closeDb();
  process.exit(exitCode);
}

process.on("SIGTERM", () => void shutdown("SIGTERM", 0));
process.on("SIGINT", () => void shutdown("SIGINT", 0));

// A rejection nobody handled means a request path silently lost its error; keep
// serving what is already in flight, then let the supervisor restart us clean.
process.on("unhandledRejection", reason => {
  console.error("[server] unhandled rejection", reason);
  void shutdown("unhandled rejection", 1);
});

// An uncaught exception leaves the process in an undefined state, so draining
// could itself fail — exit immediately instead.
process.on("uncaughtException", error => {
  console.error("[server] uncaught exception", error);
  process.exit(1);
});
