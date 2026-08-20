import { describe, expect, it } from "vitest";

import { app } from "../src/app.js";

describe("health endpoints", () => {
  it("GET /healthz answers while the process can serve", async () => {
    const res = await app.request("/healthz");

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("GET /readyz answers while the database is reachable", async () => {
    const res = await app.request("/readyz");

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ready");
  });
});
