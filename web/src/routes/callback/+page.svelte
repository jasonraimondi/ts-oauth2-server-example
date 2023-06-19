<script lang="ts">
	import { onMount } from 'svelte';
	import { CALLBACK_URL, CLIENT_ID } from '$lib/auth';
	import { httpClient } from '$lib/http_client';
  import { cookieStorageService, sessionStorageService } from "$lib/browser_storage";
  import { goto } from "$app/navigation";
  import type { TokenResponse } from "$lib/types";

	onMount(async () => {
		const url = new URL(window.location.href);
		const code = url.searchParams.get('code');
		const state = url.searchParams.get('state');
		const storedState = sessionStorageService.get('_state');
		sessionStorageService.remove('_state');
		const storedVerifier = sessionStorageService.get('_verifier');
		sessionStorageService.remove('_verifier');

		if (state !== storedState) {
			throw new Error('State mismatch');
		}

		const json = await httpClient
			.url('/api/oauth2/token')
			.post({
				grant_type: 'authorization_code',
				code,
				client_secret: null,
				client_id: CLIENT_ID,
				redirect_uri: CALLBACK_URL,
				code_verifier: storedVerifier
			})
			.json<TokenResponse>();

    cookieStorageService.set('access_token', json.access_token);
    cookieStorageService.set('refresh_token', json.refresh_token);

    await goto("/", { replaceState: true });
	});
</script>

Hi Hi Hiya