<script lang="ts">
  let { label, on = $bindable() }: { label: string; on: boolean } = $props();
</script>

<button type="button" class="compact" aria-pressed={on} onclick={() => (on = !on)}>{label}</button>

<style>
  /* On is the inverted fill, as the builder's Script tag and Raw JSON are. */
  button[aria-pressed='true'] {
    background: var(--ink);
    color: var(--ground);
  }
</style>
