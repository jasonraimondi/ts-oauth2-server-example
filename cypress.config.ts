import { defineConfig } from "cypress";

export default defineConfig({
  video: false,
  e2e: {
    baseUrl: "http://localhost:5173",
    setupNodeEvents(on, config) {
      // implement node event listeners here
    },
  },
  // @see https://docs.cypress.io/guides/references/configuration#blockHosts
  blockHosts: ["*google-analytics.com"],
});
