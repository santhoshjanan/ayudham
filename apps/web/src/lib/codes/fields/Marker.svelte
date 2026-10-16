<script lang="ts">
  import Toggle from '#lib/ui/Toggle.svelte';

  let { on = $bindable() }: { on: boolean } = $props();
</script>

<!-- Structured codes are read by phone camera apps that expect plain UTF-8, so the marker is off
     unless the person turns it on. -->
<div class="switches">
  <Toggle label="UTF-8 marker" bind:on />
</div>
<p class="hint marker">
  Marks accented and non-Latin text as UTF-8. Leave it off unless a reader shows such letters
  wrongly.
</p>

<style>
  .marker {
    margin: -0.6rem 0 1.1rem;
  }
</style>
