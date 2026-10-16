<script lang="ts">
  import { surprise, THEMES, explain, type Symbology, type ThemeId } from '@pokerji/code-maker';
  import NumberField from '#lib/ui/NumberField.svelte';
  import Toggle from '#lib/ui/Toggle.svelte';
  import ColourField from './ColourField.svelte';
  import type { Design } from './maker.svelte.ts';
  import ThemeChips from './ThemeChips.svelte';

  let { design, symbology }: { design: Design; symbology: Symbology } = $props();

  const styled = $derived(symbology.family !== 'drawn');
  const cornered = $derived(symbology.family === 'qr');
  let problem = $state('');

  /** A colour changed by hand: the theme no longer describes the code. */
  const edited = () => (design.theme = null);

  const choose = (id: ThemeId) => {
    const theme = THEMES[id];
    const paint = theme.paint;
    design.fill = paint.type;
    if (paint.type === 'solid') design.foreground = paint.colour;
    else if (paint.type === 'linear') {
      design.foreground = paint.from;
      design.second = paint.to;
      design.angle = paint.angle;
    } else {
      design.foreground = paint.inner;
      design.second = paint.outer;
    }
    design.background = theme.background;
    design.transparent = false;
    design.corners = null;
    design.theme = id;
    problem = '';
  };

  // The browser's cryptographic source: every palette equally likely, and none weaker than the
  // contrast warning.
  const random = (count: number) => crypto.getRandomValues(new Uint8Array(count));
  const draw = () => {
    const drawn = surprise(random);
    if (!drawn.ok) {
      problem = explain(drawn.problem);
      return;
    }
    const { background, paint } = drawn.value;
    design.fill = paint.type;
    if (paint.type === 'linear') {
      design.foreground = paint.from;
      design.second = paint.to;
      design.angle = paint.angle;
    } else if (paint.type === 'radial') {
      design.foreground = paint.inner;
      design.second = paint.outer;
    } else design.foreground = paint.colour;
    design.background = background;
    design.transparent = false;
    design.corners = null;
    design.theme = null;
    problem = '';
  };

  const invert = () => {
    [design.foreground, design.background] = [design.background, design.foreground];
    design.transparent = false;
    design.fill = 'solid';
    design.theme = null;
  };

  const DOTS = [
    ['square', 'Square'],
    ['rounded', 'Rounded'],
    ['circle', 'Circle'],
    ['diamond', 'Diamond'],
    ['connected', 'Connected'],
    ['vertical', 'Vertical bars'],
    ['horizontal', 'Horizontal bars'],
  ] as const;
  const RINGS = [
    ['square', 'Square'],
    ['rounded', 'Rounded'],
    ['circle', 'Circle'],
    ['leaf', 'Leaf'],
  ] as const;
  // No diamond: it covers too little of the eye for a finder pattern's proportions, and the
  // decoding tests could not read it.
  const EYES = [
    ['square', 'Square'],
    ['rounded', 'Rounded'],
    ['circle', 'Circle'],
  ] as const;

  const quietMax = $derived(Math.max(10, symbology.quietZone));
</script>

<section aria-labelledby="c-look">
  <h2 id="c-look">Look</h2>
  {#if styled}
    <ThemeChips chosen={design.theme} onchoose={choose} onsurprise={draw} />
    {#if problem}<p role="status">{problem}</p>{/if}
  {/if}

  <ColourField id="c-foreground" label="Foreground" bind:value={design.foreground} onedit={edited} />
  {#if styled}
    <p class="field">
      <label for="c-fill">Fill</label>
      <select id="c-fill" bind:value={design.fill} onchange={edited}>
        <option value="solid">Solid</option>
        <option value="linear">Linear gradient</option>
        <option value="radial">Radial gradient</option>
      </select>
    </p>
    {#if design.fill !== 'solid'}
      <ColourField id="c-second" label="Second colour" bind:value={design.second} onedit={edited} />
    {/if}
    {#if design.fill === 'linear'}
      <NumberField id="c-angle" label="Angle (degrees)" min={0} max={359} bind:value={design.angle} />
    {/if}
  {/if}
  <ColourField id="c-background" label="Background" bind:value={design.background} onedit={edited} />
  <div class="switches">
    <Toggle label="Transparent" bind:on={design.transparent} />
    <button type="button" class="compact" onclick={invert}>Invert</button>
    {#if cornered}
      <Toggle
        label="Corner colour"
        bind:on={
          () => design.corners !== null,
          (on) => (design.corners = on ? (design.corners ?? '#0e6f8c') : null)
        }
      />
    {/if}
  </div>
  {#if cornered && design.corners !== null}
    <ColourField id="c-corners" label="Corners" bind:value={design.corners} onedit={edited} />
  {/if}

  {#if styled}
    <p class="group-label" id="c-dots-label">Dots</p>
    <div class="switches" role="group" aria-labelledby="c-dots-label">
      {#each DOTS as [value, name] (value)}
        <button
          type="button"
          class="compact"
          aria-pressed={design.dots === value}
          onclick={() => (design.dots = value)}>{name}</button
        >
      {/each}
    </div>
    {#if cornered}
      <p class="group-label" id="c-rings-label">Corner rings</p>
      <div class="switches" role="group" aria-labelledby="c-rings-label">
        {#each RINGS as [value, name] (value)}
          <button
            type="button"
            class="compact"
            aria-pressed={design.ring === value}
            onclick={() => (design.ring = value)}>{name}</button
          >
        {/each}
      </div>
      <p class="group-label" id="c-eyes-label">Corner eyes</p>
      <div class="switches" role="group" aria-labelledby="c-eyes-label">
        {#each EYES as [value, name] (value)}
          <button
            type="button"
            class="compact"
            aria-pressed={design.eye === value}
            onclick={() => (design.eye = value)}>{name}</button
          >
        {/each}
      </div>
    {/if}
  {:else}
    <p class="hint drawn">
      Bar and stacked codes take colours and a quiet zone; shapes apply to square codes.
    </p>
  {/if}

  <NumberField
    id="c-quiet"
    label="Quiet zone (modules)"
    min={0}
    max={quietMax}
    hint="The clear margin round the code. Its standard asks for at least {symbology.quietZone}."
    bind:value={
      () => design.quietZones[symbology.id] ?? symbology.quietZone,
      (zone) => (design.quietZones[symbology.id] = zone)
    }
  />
</section>

<style>
  .group-label {
    margin: 0 0 0.35rem;
    font-weight: 650;
  }
  .drawn {
    margin: 0 0 1.1rem;
  }
  button[aria-pressed='true'] {
    background: var(--ink);
    color: var(--ground);
  }
</style>
