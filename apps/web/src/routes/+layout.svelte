<script lang="ts">
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();
</script>

{@render children()}

<style>
  :global(.app) {
    display: contents;
  }
</style>
