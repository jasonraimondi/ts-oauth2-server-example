import type { FC } from "hono/jsx";
import type { OAuthClient, OAuthScope } from "@jmondi/oauth2-server";

import { Layout } from "./Layout.js";

const styles = <style>{`.yes-no { list-style-type: none; display: flex; }`}</style>;

export const Scopes: FC<{ action: string; client: OAuthClient; scopes: OAuthScope[] }> = ({
  action,
  client,
  scopes,
}) => (
  <Layout title="Authorize" styles={styles}>
    <div>
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
        <ul class="yes-no">
          <li>
            <button name="accept" value="yes" type="submit">
              Approve
            </button>
          </li>
          <li>
            <button name="accept" value="no" type="submit">
              Deny
            </button>
          </li>
        </ul>
      </form>
    </div>
  </Layout>
);
