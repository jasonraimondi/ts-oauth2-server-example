// This client is a browser-only SPA: every route relies on window, cookies and
// in-memory state, so there is no server to render or prerender against.
// Disabling SSR/prerender lets adapter-static emit a single-page-app fallback.
export const ssr = false;
export const prerender = false;
