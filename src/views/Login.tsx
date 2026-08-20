import type { FC } from "hono/jsx";

import { Layout } from "./Layout.js";

const styles = (
  <style>{`
    html { font-family: Helvetica, Arial, sans-serif; }
    .button { background-color: tomato; color: white; padding: 0.5rem; text-decoration: none; font-weight: 600; border-radius: 4px; }
    label { display: block; }
  `}</style>
);

export const Login: FC<{ action: string; error?: string; email?: string }> = ({
  action,
  error,
  email,
}) => (
  <Layout title="Login" styles={styles}>
    <h1>Login</h1>
    {error ? (
      <p class="alert" role="alert">
        {error}
      </p>
    ) : null}
    <form action={action} method="post">
      <label>
        Email
        <input
          type="email"
          name="email"
          value={email}
          inputmode="email"
          autocomplete="username"
          required
        />
      </label>
      <label>
        Password
        <input
          type="password"
          name="password"
          autocomplete="current-password"
          maxlength={256}
          required
        />
      </label>
      <div class="actions">
        <button type="submit" class="button">
          Login
        </button>
      </div>
    </form>
    <p class="muted">Demo user: jason@example.com / password123</p>
  </Layout>
);
