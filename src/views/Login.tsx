import type { FC } from "hono/jsx";

import { Layout } from "./Layout.js";

const styles = (
  <style>{`
    html { font-family: Helvetica, Arial, sans-serif; }
    .button { background-color: tomato; color: white; padding: 0.5rem; text-decoration: none; font-weight: 600; border-radius: 4px; }
    label { display: block; }
    fieldset { padding: 0; border: none; }
  `}</style>
);

export const Login: FC<{ action: string }> = ({ action }) => (
  <Layout title="Login" styles={styles}>
    <h1>Login</h1>
    <form action={action} method="post">
      <fieldset>
        <label>
          Email
          <input type="email" name="email" value="jason@example.com" required />
        </label>
        <label>
          Password
          <input type="password" name="password" value="password123" required />
        </label>
        <a href="#">Forgot Your Password?</a>
        <div>
          <button type="submit" class="button">
            Login
          </button>
        </div>
      </fieldset>
    </form>
  </Layout>
);
