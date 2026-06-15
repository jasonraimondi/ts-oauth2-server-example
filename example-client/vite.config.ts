import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

// No dev proxy: the browser only ever talks to this app's own BFF endpoints
// (/api/*, /auth/*), which run server-side. The BFF reaches the authorization
// server (:3000) itself, server-to-server — the browser can't touch it directly.
export default defineConfig({
  plugins: [sveltekit()],
});
