import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

const proxyOptions = {
  target: `http://127.0.0.1:3000`,
  changeOrigin: false,
  secure: true,
  ws: false,
};

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    proxy: {
      "^/api(/|(\\?.*)?$)": proxyOptions,
    },
  },
});
