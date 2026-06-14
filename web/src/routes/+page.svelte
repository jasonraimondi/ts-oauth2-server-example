<script lang="ts">
  import { onMount } from "svelte";

  type Me = { authenticated: boolean; user?: { sub: string; email?: string } };
  type Contact = { name: string; email: string };

  let me = $state<Me | null>(null);
  let contacts = $state<Contact[] | null>(null);
  let error = $state<string | null>(null);
  let meError = $state<string | null>(null);

  async function loadMe() {
    meError = null;
    try {
      const res = await fetch("/api/me");
      if (!res.ok) {
        meError = `Couldn't check sign-in status (HTTP ${res.status}).`;
        return;
      }
      me = await res.json();
    } catch {
      // Network failure / unreachable server — surface it instead of leaving
      // the UI stuck on "Loading…" forever.
      meError = "Couldn't reach the server. Check your connection and try again.";
    }
  }

  async function loadContacts() {
    error = null;
    contacts = null;
    const res = await fetch("/api/contacts");
    if (!res.ok) {
      // A 401 means the BFF tore down the session (e.g. the refresh token expired);
      // re-sync auth state so the UI drops back to the logged-out view.
      if (res.status === 401) {
        await loadMe();
        return;
      }
      error = `Failed to load contacts (HTTP ${res.status}).`;
      return;
    }
    contacts = await res.json();
  }

  async function logout() {
    await fetch("/auth/logout", { method: "POST" });
    contacts = null;
    await loadMe();
  }

  onMount(loadMe);
</script>

<h1>Backend-for-Frontend OAuth2 demo</h1>

{#if me === null}
  {#if meError}
    <p>{meError}</p>
    <button onclick={loadMe}>Retry</button>
  {:else}
    <p>Loading…</p>
  {/if}
{:else if !me.authenticated}
  <p>Not logged in. The OAuth tokens are held by the server — never the browser.</p>
  <!-- Full-page navigation: the BFF starts the OAuth redirect dance. -->
  <a href="/auth/login">Log in</a>
{:else}
  <p>Signed in as <strong>{me.user?.email ?? me.user?.sub}</strong>.</p>
  <button onclick={loadContacts}>Load contacts</button>
  <button onclick={logout}>Log out</button>

  {#if error}<p>{error}</p>{/if}

  {#if contacts}
    <ul>
      {#each contacts as contact (contact.email)}
        <li>{contact.name} — {contact.email}</li>
      {/each}
    </ul>
  {/if}
{/if}
