import type { FC, Child } from "hono/jsx";

// One stylesheet for every server-rendered screen: login and consent are the
// same product and must not look like two of them. It mirrors
// example-client/src/app.css — keep the token block in both files in sync.
//
// Accent is hue-per-theme: green in light, purple in dark. Both are oklch, so
// a lighter or darker variant is a one-number change on L.
const styles = (
  <style>{`
    :root {
      color-scheme: light dark;

      --bg: #ffffff;
      --surface: #ffffff;
      --surface-2: #fafafa;
      --fg: #1a1a1a;
      --fg-soft: #3a3a3a;
      --muted: #6b6b6b;
      --border: #d9d9d9;
      --hairline: #f0f0f0;

      --accent: oklch(0.49 0.11 155);
      --accent-hover: oklch(0.41 0.10 155);
      --accent-quiet: oklch(0.49 0.11 155);
      --accent-fg: #ffffff;
      --accent-sheen: transparent;

      --radius: 6px;
      --radius-lg: 10px;

      --sans: "Instrument Sans", system-ui, sans-serif;
      --mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #101010;
        --surface: #161616;
        --surface-2: #1c1c1c;
        --fg: #ececec;
        --fg-soft: #c9c9c9;
        --muted: #9a9a9a;
        --border: #3a3a3a;
        --hairline: #242424;

        --accent: oklch(0.58 0.22 285);
        --accent-hover: oklch(0.65 0.19 285);
        --accent-quiet: oklch(0.70 0.14 285);
        --accent-sheen: rgba(255, 255, 255, 0.18);
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background-color: var(--bg);
      color: var(--fg);
      font-family: var(--sans);
      font-size: 0.875rem;
      line-height: 1.55;
      -webkit-font-smoothing: antialiased;
    }
    :focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
    main {
      max-width: 30rem;
      margin-inline: auto;
      padding-block: 3rem;
      padding-inline: 1rem;
    }
    .shell {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      background-color: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 1.625rem 1.625rem 1.375rem;
    }
    .brand { display: flex; align-items: center; gap: 0.5625rem; }
    .brand-mark {
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      border-radius: 7px;
      background-color: var(--accent);
      color: var(--accent-fg);
      font: 700 10px var(--mono);
      letter-spacing: -0.02em;
    }
    .brand-name { font-weight: 600; font-size: 0.8125rem; letter-spacing: 0.01em; }
    .brand-env {
      margin-left: auto;
      font: 400 0.6875rem var(--mono);
      color: var(--muted);
    }
    h1 {
      margin: 0;
      font-size: 1.3125rem;
      font-weight: 600;
      line-height: 1.25;
      letter-spacing: -0.015em;
    }
    p { margin: 0; }
    .lede { color: var(--muted); }
    .mono { font: 400 0.78125rem var(--mono); color: var(--muted); }
    .rows {
      display: flex;
      flex-direction: column;
      border: 1px solid var(--hairline);
      border-radius: 8px;
      overflow: hidden;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .row {
      display: flex;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.5625rem 0.75rem;
      border-bottom: 1px solid var(--hairline);
      background-color: var(--surface-2);
      font-size: 0.8125rem;
    }
    .row:last-child { border-bottom: 0; }
    .row-key {
      font: 400 0.6875rem var(--mono);
      color: var(--accent-quiet);
      white-space: nowrap;
    }
    form { display: grid; gap: 0.875rem; }
    label { display: grid; gap: 0.375rem; }
    label > span {
      font-size: 0.65625rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
    }
    input {
      padding: 0.5625rem 0.6875rem;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background-color: var(--surface-2);
      color: var(--fg);
      font: 400 0.84375rem var(--sans);
    }
    input:focus-visible { border-color: var(--accent); outline: none; }
    button {
      padding: 0.6875rem 1rem;
      border: 1px solid transparent;
      border-radius: var(--radius);
      background-color: var(--accent);
      color: var(--accent-fg);
      font: 600 0.84375rem var(--sans);
      cursor: pointer;
      box-shadow: inset 0 1px 0 var(--accent-sheen);
    }
    button:hover { background-color: var(--accent-hover); }
    button[data-variant=secondary] {
      background-color: transparent;
      border-color: var(--border);
      color: var(--fg-soft);
      box-shadow: none;
    }
    button[data-variant=secondary]:hover {
      background-color: var(--surface-2);
      border-color: var(--muted);
      color: var(--fg);
    }
    .actions { display: flex; gap: 0.625rem; }
    .actions button:first-child { flex: 1; }
    .alert {
      border: 1px solid var(--border);
      border-left: 2px solid var(--accent);
      border-radius: var(--radius);
      padding: 0.625rem 0.75rem;
      background-color: var(--surface-2);
      font-size: 0.8125rem;
    }
    .foot {
      margin-top: auto;
      border-top: 1px solid var(--hairline);
      padding-top: 0.75rem;
      font: 400 0.6875rem var(--mono);
      color: var(--muted);
    }
    a { color: var(--accent-quiet); }
    a:hover { color: var(--accent-hover); }
  `}</style>
);

export const Layout: FC<{ title?: string; children?: Child }> = ({
  title = "OAuth2",
  children,
}) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="initial-scale=1.0, width=device-width" />
      <title>{title}</title>
      <meta name="application-name" content="OAuth2 Example Server" />
      <meta
        name="description"
        content="Authorization server for the @jmondi/oauth2-server example."
      />
      <meta name="robots" content="noindex" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
      />
      {styles}
    </head>
    <body>
      <main>
        <div class="shell">
          {/* The mark and the port are the whole identity: which server is
              asking, and where it lives. */}
          <div class="brand">
            <span class="brand-mark" aria-hidden="true">
              oa
            </span>
            <span class="brand-name">Authorization Server</span>
            <span class="brand-env">:3000</span>
          </div>
          {children}
        </div>
      </main>
    </body>
  </html>
);
