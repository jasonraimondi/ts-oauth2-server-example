<script lang="ts">
  import { page } from "$app/state";
</script>

<h1>Something went wrong</h1>
<p role="alert">{page.status} — {page.error?.message ?? "Unexpected error."}</p>
<a href="/">Back to the demo</a>
