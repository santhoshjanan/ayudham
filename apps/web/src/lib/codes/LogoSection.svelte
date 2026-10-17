<script lang="ts">
  import type { Symbology } from '@ayudham/code-maker';
  import NumberField from '#lib/ui/NumberField.svelte';
  import { LOGO_SAID, readLogo } from './logo.ts';
  import { takesLogo, type Maker } from './maker.svelte.ts';

  let { maker, symbology }: { maker: Maker; symbology: Symbology } = $props();

  const roomless = $derived(!takesLogo(symbology.id));
  let problem = $state('');
  let reading = $state(false);

  const choose = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    // The input is emptied at once: the page keeps only the image it read, never the file.
    input.value = '';
    if (!file) return;
    reading = true;
    const read = await readLogo(file);
    reading = false;
    if (!read.ok) {
      problem = LOGO_SAID[read.reason];
      return;
    }
    problem = '';
    maker.setLogo(read.value);
  };

  const PLATES = [
    ['square', 'Square'],
    ['rounded', 'Rounded'],
    ['circle', 'Circle'],
  ] as const;
</script>

<section aria-labelledby="c-logo-heading">
  <h2 id="c-logo-heading">Logo</h2>
  {#if roomless}
    <p class="hint">
      {symbology.id === 'rmqr'
        ? 'Rectangular Micro QR has no room for a logo: it is too short, and a logo on it did not scan.'
        : 'Aztec has no room for a logo: its finder pattern is in the middle, where a logo would go.'}
    </p>
  {:else}
    <p class="choose">
      <input
        id="c-logo"
        class="sr-only"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        onchange={choose}
      />
      <label for="c-logo" class="button-like">Choose image</label>
      {#if maker.logo}
        <button type="button" class="compact" onclick={() => maker.setLogo(null)}>Remove logo</button>
      {/if}
    </p>
    <p class="hint">
      PNG, JPG, WebP or SVG, up to 5 MB. The image stays on this device: it is read here and never
      sent anywhere.
    </p>
    {#if reading}<p role="status">Reading the image…</p>{/if}
    {#if problem}<p role="status">{problem}</p>{/if}
    {#if maker.logo}
      <NumberField
        id="c-logo-size"
        label="Logo size (%)"
        min={10}
        max={40}
        hint="Its plate’s width as a share of the code’s, 10 to 40."
        bind:value={maker.logoShape.size}
      />
      <NumberField
        id="c-logo-padding"
        label="Padding (modules)"
        min={0}
        max={4}
        bind:value={maker.logoShape.padding}
      />
      <p class="group-label" id="c-plate-label">Plate</p>
      <div class="switches" role="group" aria-labelledby="c-plate-label">
        {#each PLATES as [value, name] (value)}
          <button
            type="button"
            class="compact"
            aria-pressed={maker.logoShape.plate === value}
            onclick={() => (maker.logoShape.plate = value)}>{name}</button
          >
        {/each}
      </div>
    {/if}
  {/if}
</section>

<style>
  .choose {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    align-items: center;
    margin: 0 0 0.6rem;
  }
  /* The file input stays a real, focusable input, hidden from sight; the fields' own width and
     height would otherwise outrank the hiding and widen the page. Its label is drawn as a
     compact button. */
  .choose input {
    width: 1px;
    height: 1px;
    min-height: 0;
  }
  .button-like {
    display: inline-flex;
    align-items: center;
    min-height: 2.25rem;
    padding: 0.2rem 0.7rem;
    font-size: 0.95rem;
    font-weight: 650;
    color: var(--ink);
    background: var(--surface);
    border: 1.5px solid var(--ink);
    border-radius: var(--radius);
    cursor: pointer;
  }
  .button-like:hover {
    background: var(--ink);
    color: var(--ground);
  }
  input:focus-visible + .button-like {
    outline: 3px solid var(--focus);
    outline-offset: 2px;
  }
  .hint {
    margin: 0 0 1.1rem;
  }
  .group-label {
    margin: 0 0 0.35rem;
    font-weight: 650;
  }
  button[aria-pressed='true'] {
    background: var(--ink);
    color: var(--ground);
  }
</style>
