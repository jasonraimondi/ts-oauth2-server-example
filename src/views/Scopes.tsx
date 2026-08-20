import type { FC } from "hono/jsx";
import type { OAuthClient, OAuthScope } from "@jmondi/oauth2-server";

import { Layout } from "./Layout.js";

export const Scopes: FC<{
  action: string;
  client: OAuthClient;
  scopes: OAuthScope[];
  userEmail?: string;
}> = ({ action, client, scopes, userEmail }) => (
  <Layout title="Authorize">
    <h1>Authorize {client.name}</h1>
    {userEmail ? <p class="muted">Signed in as {userEmail}</p> : null}
    {scopes.length > 0 ? (
      <>
        <p>Do you authorize {client.name} to access the following scopes?</p>
        <ul>
          {scopes.map(scope => (
            <li>{scope.description ?? scope.name}</li>
          ))}
        </ul>
      </>
    ) : (
      <p>{client.name} is requesting access to your account but no scopes.</p>
    )}
    {/* One form, two named submit buttons: the clicked button's value tells the
        server whether the user approved (yes) or denied (no) the request. */}
    <form action={action} method="post">
      <div class="actions">
        <button name="accept" value="yes" type="submit">
          Approve
        </button>
        <button name="accept" value="no" type="submit" data-variant="secondary">
          Deny
        </button>
      </div>
    </form>
  </Layout>
);
