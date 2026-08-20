import { describe, expect, it } from "vitest";

import { resolveSessionSecret } from "../src/lib/session.js";
import { resolvePrivateKey } from "../src/lib/oidc_key.js";

const DEV_SECRET = "dev-insecure-session-secret-change-me";
const REAL_SECRET = "a-real-production-secret-of-adequate-length";

// Run `fn` with the given env overrides applied, then restore the prior values.
// (undefined override = delete the var.) Tests share one process, so restoring
// is mandatory — never leak NODE_ENV=production into another test.
function withEnv(overrides: Record<string, string | undefined>, fn: () => void): void {
  const saved = Object.keys(overrides).map(k => [k, process.env[k]] as const);
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

describe("fail-closed secrets outside development", () => {
  it("resolveSessionSecret throws in production when SESSION_SECRET is unset", () => {
    withEnv({ NODE_ENV: "production", SESSION_SECRET: undefined }, () => {
      expect(() => resolveSessionSecret()).toThrow(/SESSION_SECRET/);
    });
  });

  it("resolveSessionSecret throws in production when SESSION_SECRET is the dev default", () => {
    withEnv({ NODE_ENV: "production", SESSION_SECRET: DEV_SECRET }, () => {
      expect(() => resolveSessionSecret()).toThrow(/SESSION_SECRET/);
    });
  });

  it("resolveSessionSecret throws when NODE_ENV is unset", () => {
    withEnv({ NODE_ENV: undefined, SESSION_SECRET: undefined }, () => {
      expect(() => resolveSessionSecret()).toThrow(/SESSION_SECRET/);
    });
  });

  it("resolveSessionSecret throws when NODE_ENV is an unrecognized value", () => {
    withEnv({ NODE_ENV: "staging", SESSION_SECRET: undefined }, () => {
      expect(() => resolveSessionSecret()).toThrow(/SESSION_SECRET/);
    });
  });

  it("resolveSessionSecret accepts a real secret in production", () => {
    withEnv({ NODE_ENV: "production", SESSION_SECRET: REAL_SECRET }, () => {
      expect(resolveSessionSecret()).toBe(REAL_SECRET);
    });
  });

  it("resolveSessionSecret falls back to the dev default in development and test", () => {
    for (const nodeEnv of ["development", "test"]) {
      withEnv({ NODE_ENV: nodeEnv, SESSION_SECRET: undefined }, () => {
        expect(resolveSessionSecret()).toBe(DEV_SECRET);
      });
    }
  });

  it("resolvePrivateKey throws in production when OIDC_PRIVATE_KEY is unset", () => {
    withEnv({ NODE_ENV: "production", OIDC_PRIVATE_KEY: undefined }, () => {
      expect(() => resolvePrivateKey()).toThrow(/OIDC_PRIVATE_KEY/);
    });
  });

  it("resolvePrivateKey throws when NODE_ENV is unset", () => {
    withEnv({ NODE_ENV: undefined, OIDC_PRIVATE_KEY: undefined }, () => {
      expect(() => resolvePrivateKey()).toThrow(/OIDC_PRIVATE_KEY/);
    });
  });

  it("resolvePrivateKey generates an ephemeral key in development and test", () => {
    for (const nodeEnv of ["development", "test"]) {
      withEnv({ NODE_ENV: nodeEnv, OIDC_PRIVATE_KEY: undefined }, () => {
        expect(resolvePrivateKey()).toContain("BEGIN PRIVATE KEY");
      });
    }
  });
});
