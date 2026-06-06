import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://kit.svelte.dev/docs/integrations#preprocessors
  // for more information about preprocessors
  preprocess: vitePreprocess(),

  kit: {
    // SPA mode: emit a fallback page so client-routed paths resolve on a
    // static host (the routes render entirely in the browser).
    adapter: adapter({ fallback: "index.html" }),
  },
};

export default config;
