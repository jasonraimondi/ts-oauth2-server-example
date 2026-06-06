import { config } from "dotenv";
import { defineConfig } from "vitest/config";

const { parsed } = config({ path: "tests/.env.test" });

export default defineConfig({
  test: {
    env: parsed,
    globalSetup: ["tests/setup/global-setup.ts"],
    setupFiles: ["tests/setup/truncate.ts"],
    // The whole suite shares ONE oauth_test db with between-test truncation, so
    // tests MUST run serially against it. fileParallelism:false + maxWorkers:1
    // keep everything in a single fork; isolate:false reuses that one worker.
    fileParallelism: false,
    pool: "forks",
    maxWorkers: 1,
    isolate: false,
  },
});
