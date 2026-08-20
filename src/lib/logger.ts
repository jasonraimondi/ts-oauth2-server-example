import { createMiddleware } from "hono/factory";
import type { LoggerService } from "@jmondi/oauth2-server";

type LogLevel = "debug" | "info" | "error";

/**
 * One line of JSON per event, on stdout for everything and stderr for errors.
 * Dependency-free on purpose: an example should stay light. A production fork
 * swaps this for pino and configures redaction there.
 */
export function logJson(level: LogLevel, message: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...fields });
  if (level === "error") console.error(line);
  else console.log(line);
}

/**
 * Access log. Records the pathname alone — an authorize or login query string
 * carries `state`, `nonce` and `code_challenge`, which must never reach a log
 * sink that outlives the request.
 */
export const accessLog = createMiddleware<{ Variables: { requestId: string } }>(async (c, next) => {
  const startedAt = Date.now();
  await next();
  logJson("info", "request", {
    requestId: c.get("requestId"),
    method: c.req.method,
    path: new URL(c.req.url).pathname,
    status: c.res.status,
    durationMs: Date.now() - startedAt,
  });
});

/**
 * The AuthorizationServer's own logging seam, pointed at the same JSON stream so
 * the library's protocol tracing lands next to the access log rather than in a
 * second format.
 */
export const oauthServerLogger: LoggerService = {
  log: (message?: unknown, ...params: unknown[]) =>
    logJson("debug", String(message), params.length > 0 ? { params } : {}),
};
