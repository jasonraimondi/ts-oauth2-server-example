<script lang="ts">
  import { enhance } from "$app/forms";
  import { invalidateAll } from "$app/navigation";
  import type { SubmitFunction } from "@sveltejs/kit";

  import type { PageProps } from "./$types";

  type Contact = { name: string; email: string };

  let { data }: PageProps = $props();

  let contacts = $state<Contact[] | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(false);

  const NETWORK_ERROR = "Couldn't reach the server. Check your connection and try again.";

  const AUTH_ERRORS: Record<string, string> = {
    access_denied: "You declined the request, so nothing was shared.",
    expired_state: "That sign-in attempt expired before it finished. Please try again.",
  };

  let authError = $derived(
    data.authError === null
      ? null
      : (AUTH_ERRORS[data.authError] ?? "Sign-in did not complete. Please try again."),
  );

  function isContactList(value: unknown): value is Contact[] {
    return (
      Array.isArray(value) &&
      value.every((item: unknown) => {
        const contact = item as Contact | null;
        return typeof contact?.name === "string" && typeof contact.email === "string";
      })
    );
  }

  async function loadContacts() {
    loading = true;
    error = null;
    contacts = null;
    try {
      const res = await fetch("/api/contacts");
      if (res.status === 401) {
        // The BFF tore the session down; re-run load so the page falls back to
        // the logged-out view instead of leaving a dead button behind.
        error = "Your session has ended. Please log in again.";
        await invalidateAll();
        return;
      }
      if (!res.ok) {
        error = `Couldn't load contacts (HTTP ${res.status}).`;
        return;
      }
      const body: unknown = await res.json();
      if (!isContactList(body)) {
        error = "The server returned contacts in an unexpected shape.";
        return;
      }
      contacts = body;
    } catch {
      error = NETWORK_ERROR;
    } finally {
      loading = false;
    }
  }

  const logout: SubmitFunction = () => {
    loading = true;
    error = null;
    return async ({ result, update }) => {
      loading = false;
      if (result.type === "error") {
        error = NETWORK_ERROR;
        return;
      }
      contacts = null;
      await update();
    };
  };
</script>

<h1>Backend-for-Frontend OAuth2 demo</h1>

{#if authError}
  <p role="status">{authError}</p>
{/if}

{#if error}
  <p role="alert">{error}</p>
{/if}

{#if data.user}
  <p>Signed in as <strong>{data.user.email ?? data.user.sub}</strong>.</p>

  <button onclick={loadContacts} disabled={loading}>Load contacts</button>

  <form method="POST" action="?/logout" use:enhance={logout}>
    <button type="submit" disabled={loading}>Log out</button>
  </form>

  {#if contacts}
    <ul>
      {#each contacts as contact (contact.email)}
        <li>{contact.name} — {contact.email}</li>
      {/each}
    </ul>
  {/if}
{:else}
  <p>Not logged in. The OAuth tokens are held by the server — never the browser.</p>
  <!-- Full-page navigation: the BFF starts the OAuth redirect dance. -->
  <a href="/auth/login">Log in</a>
{/if}
