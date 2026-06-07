import type { FC, Child } from "hono/jsx";

export const Layout: FC<{ title?: string; styles?: Child; children?: Child }> = ({
  title = "OAuth2",
  styles,
  children,
}) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="initial-scale=1.0, width=device-width" />
      <title>{title}</title>
      <meta name="application-name" content="Scratchy" />
      <meta name="description" content="OAuth2 Rocks" />
      {styles}
    </head>
    <body>
      <main>{children}</main>
    </body>
  </html>
);
