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

<div class="brand">
  <span class="brand-mark" aria-hidden="true">oa</span>
  <span class="brand-name">BFF Demo</span>
  {#if data.user}
    <span class="chip">{data.user.email ?? data.user.sub}</span>
  {:else}
    <span class="brand-env">:5173</span>
  {/if}
</div>

<h1>Backend-for-Frontend OAuth2 demo</h1>

{#if authError}
  <p class="notice" role="status">{authError}</p>
{/if}

{#if error}
  <p class="alert" role="alert">{error}</p>
{/if}

{#if data.user}
  <div class="actions">
    <button class="button-sm" onclick={loadContacts} disabled={loading}>
      {loading ? "Loading…" : "Load contacts"}
    </button>

    <form method="POST" action="?/logout" use:enhance={logout}>
      <button class="button-sm" type="submit" data-variant="secondary" disabled={loading}>
        Log out
      </button>
    </form>
  </div>

  {#if contacts}
    <ul class="rows">
      <li class="rows-head">GET /api/contacts</li>
      {#each contacts as contact (contact.email)}
        <li class="row">
          <span>{contact.name}</span>
          <span class="row-value">{contact.email}</span>
        </li>
      {/each}
    </ul>
  {/if}

  <p class="foot">tokens held server-side</p>
{:else}
  <p class="lede">Not logged in. The OAuth tokens are held by the server — never the browser.</p>
  <!-- Full-page navigation: the BFF starts the OAuth redirect dance. -->
  <a class="button" href="/auth/login" style="align-self: flex-start">Log in</a>
  <p class="foot">GET /auth/login</p>
{/if}
