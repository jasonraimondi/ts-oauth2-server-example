import type { FC } from "hono/jsx";

import { Layout } from "./Layout.js";

export const Login: FC<{ action: string; error?: string; email?: string }> = ({
  action,
  error,
  email,
}) => (
  <Layout title="Login">
    <h1>Log in</h1>
    {error ? (
      <p class="alert" role="alert">
        {error}
      </p>
    ) : null}
    <form action={action} method="post">
      <label>
        <span>Email</span>
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
        <span>Password</span>
        <input
          type="password"
          name="password"
          autocomplete="current-password"
          maxlength={256}
          required
        />
      </label>
      <button type="submit">Log in</button>
    </form>
    <p class="foot">Demo user: jason@example.com / password123</p>
  </Layout>
);
