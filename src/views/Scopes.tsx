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
    <div>
      <h1>Authorize {client.name}</h1>
      {userEmail ? <p class="mono">Signed in as {userEmail}</p> : null}
    </div>
    {scopes.length > 0 ? (
      <>
        <p class="lede">
          Do you authorize <strong>{client.name}</strong> to access the following scopes?
        </p>
        {/* Human description on the left, the raw scope key on the right: the
            reader of this example needs to see both. */}
        <ul class="rows">
          {scopes.map(scope => (
            <li class="row">
              <span>{scope.description ?? scope.name}</span>
              <span class="row-key">{scope.name}</span>
            </li>
          ))}
        </ul>
      </>
    ) : (
      <p class="lede">{client.name} is requesting access to your account but no scopes.</p>
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
