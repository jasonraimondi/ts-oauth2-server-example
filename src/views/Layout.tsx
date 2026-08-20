import type { FC, Child } from "hono/jsx";

// One stylesheet for every server-rendered screen: login and consent are the
// same product and must not look like two of them.
const styles = (
  <style>{`
    :root {
      color-scheme: light dark;
      --bg: #ffffff;
      --fg: #1a1a1a;
      --muted: #6b6b6b;
      --accent: #c62f14;
      --accent-fg: #ffffff;
      --border: #d9d9d9;
      --radius: 4px;
      --space: 0.75rem;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #161616;
        --fg: #ececec;
        --muted: #9a9a9a;
        --border: #3a3a3a;
      }
    }
    :focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
    main {
      max-width: 40rem;
      margin-inline: auto;
      padding-block: 2rem;
      padding-inline: 1rem;
    }
    body {
      margin: 0;
      background-color: var(--bg);
      color: var(--fg);
      font-family: system-ui, sans-serif;
      line-height: 1.5;
    }
    h1 {
      font-size: 1.5rem;
    }
    form {
      display: grid;
      gap: var(--space);
      max-width: 22rem;
    }
    label {
      display: grid;
      gap: calc(var(--space) / 3);
    }
    input {
      padding: var(--space);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background-color: var(--bg);
      color: inherit;
      font: inherit;
    }
    button {
      padding: var(--space) calc(var(--space) * 1.5);
      border: 1px solid transparent;
      border-radius: var(--radius);
      background-color: var(--accent);
      color: var(--accent-fg);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    button[data-variant=secondary] {
      background-color: transparent;
      border-color: var(--border);
      color: var(--fg);
    }
    .actions {
      display: flex;
      gap: var(--space);
    }
    .alert {
      border: 1px solid var(--accent);
      border-radius: var(--radius);
      padding: var(--space);
    }
    .muted {
      color: var(--muted);
      font-size: 0.875rem;
    }
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
      {styles}
    </head>
    <body>
      <main>{children}</main>
    </body>
  </html>
);
