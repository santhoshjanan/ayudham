<script lang="ts">
  import { LIMITS } from '@pokerji/code-maker';
  import NumberField from '#lib/ui/NumberField.svelte';
  import type { Sizing } from './maker.svelte.ts';

  let {
    sizing,
    modules,
  }: {
    sizing: Sizing;
    /** The code's width in modules, quiet zone included, once there is a code. */
    modules: number | undefined;
  } = $props();

  // A printer cannot make a module much smaller than a quarter of a millimetre reliably.
  const SMALLEST_MM = 0.25;
  const moduleMm = $derived(
    sizing.by === 'print' && modules && Number(sizing.mm) > 0 ? Number(sizing.mm) / modules : null,
  );
</script>

<section aria-labelledby="c-size">
  <h2 id="c-size">Size</h2>
  <div class="switches" role="group" aria-label="Size by">
    <button
      type="button"
      class="compact"
      aria-pressed={sizing.by === 'pixels'}
      onclick={() => (sizing.by = 'pixels')}>Pixels</button
    >
    <button
      type="button"
      class="compact"
      aria-pressed={sizing.by === 'print'}
      onclick={() => (sizing.by = 'print')}>Print size</button
    >
  </div>
  {#if sizing.by === 'pixels'}
    <NumberField
      id="c-pixels"
      label="Width (pixels)"
      min={1}
      max={LIMITS.exportPixels}
      bind:value={sizing.pixels}
    />
  {:else}
    <NumberField
      id="c-mm"
      label="Width (mm)"
      min={LIMITS.printMm.min}
      max={LIMITS.printMm.max}
      bind:value={sizing.mm}
    />
    <p class="field">
      <label for="c-dpi">Resolution</label>
      <select id="c-dpi" bind:value={sizing.dpi}>
        <option value={300}>300 dpi</option>
        <option value={600}>600 dpi</option>
      </select>
    </p>
    {#if moduleMm !== null && moduleMm < SMALLEST_MM}
      <p role="status">
        At this width each module would be {moduleMm.toFixed(2)} mm, smaller than 0.25 mm, which most
        printers cannot make cleanly. Make it wider, or the code smaller.
      </p>
    {/if}
  {/if}
  <p class="field">
    <label for="c-page">PDF page</label>
    <select id="c-page" bind:value={sizing.page}>
      <option value="fit">The code’s own size</option>
      <option value="a4">A4, centred</option>
      <option value="letter">US Letter, centred</option>
    </select>
  </p>
</section>

<style>
  button[aria-pressed='true'] {
    background: var(--ink);
    color: var(--ground);
  }
  [role='status'] {
    margin: 0 0 1.1rem;
  }
</style>
