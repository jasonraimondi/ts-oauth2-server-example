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
      <p>Do you authorize this application {client.name} the following scopes:</p>
      <ul>
        {scopes.length > 0 ? (
          scopes.map((scope) => <li>{scope.description ?? scope.name}</li>)
        ) : (
          <li>No scopes! Fix this empty state</li>
        )}
      </ul>
      <ul class="yes-no">
        <li>
          <form action={action} method="post">
            <input name="accept" value="yes" type="hidden" style="display: none;" />
            <button>Yes</button>
          </form>
        </li>
        <li>
          <form action={action} method="post">
            <input name="accept" value="no" type="hidden" style="display: none;" />
            <button>No</button>
          </form>
        </li>
      </ul>
    </div>
  </Layout>
);
