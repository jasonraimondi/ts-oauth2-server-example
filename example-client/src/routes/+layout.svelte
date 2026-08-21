<script lang="ts">
  import "../app.css";

  import type { LayoutProps } from "./$types";

  let { children }: LayoutProps = $props();
</script>

<main>
  <!-- Every client screen is one card; the brand row inside it belongs to the
       page, because the identity chip is page state. -->
  <div class="shell">
    {@render children()}
  </div>
</main>
