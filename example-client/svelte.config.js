import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://kit.svelte.dev/docs/integrations#preprocessors
  // for more information about preprocessors
  preprocess: vitePreprocess(),

  kit: {
    // The app is a Backend-for-Frontend: it runs as a Node server so it can hold
    // OAuth tokens server-side and expose same-origin endpoints. See ADR-0001.
    adapter: adapter(),
  },
};

export default config;
