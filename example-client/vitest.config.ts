import { defineConfig } from "vitest/config";

// Standalone config (no SvelteKit plugin): the BFF's security-critical modules
// under src/lib/server are pure — they take config as parameters and never import
// $env/$app — so they unit-test in a plain Node environment with no SvelteKit runtime.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
