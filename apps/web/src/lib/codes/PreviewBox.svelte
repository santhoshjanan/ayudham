<script lang="ts">
  import type { Made } from './work.ts';

  let {
    shown,
    label,
    old = false,
    busy = false,
    transparent = false,
  }: {
    /** The last code made. */
    shown: Made | undefined;
    /** What kind of code it is, for its description. */
    label: string;
    /** The code shown is not the one the choices now make. */
    old?: boolean;
    busy?: boolean;
    transparent?: boolean;
  } = $props();

  // The code as an image whose source is its SVG: an SVG shown as an image runs no script and
  // loads nothing, and typed text never becomes part of the page.
  const src = $derived(shown?.src ?? '');
  const alt = $derived.by(() => {
    if (!shown) return '';
    const held = shown.text.replace(/\s+/g, ' ').trim();
    return `${label}: ${held.length > 60 ? `${held.slice(0, 59)}…` : held}`;
  });
</script>

<div class="preview" class:board={transparent && !!shown} data-testid="preview" aria-busy={busy}>
  {#if shown}
    <img {src} {alt} class:old />
  {:else}
    <p class="empty">Your code appears here.</p>
  {/if}
</div>
{#if shown && old}
  <p class="hint">This is the last code that could be made.</p>
{/if}

<style>
  /* A square of fixed size: a new code replaces the old in place, and nothing around it moves. */
  .preview {
    display: grid;
    place-items: center;
    aspect-ratio: 1;
    width: 100%;
    max-width: 36rem;
    padding: 1rem;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }
  /* Transparent is not white: a checkerboard in two tokens shows the difference. */
  .preview.board {
    background-color: var(--surface);
    background-image: conic-gradient(
      var(--line) 25%,
      transparent 0 50%,
      var(--line) 0 75%,
      transparent 0
    );
    background-size: 1.5rem 1.5rem;
  }
  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  /* An old code is drawn as "not now" is: a dashed outline round it. */
  img.old {
    outline: 2px dashed var(--line);
    outline-offset: 0.35rem;
  }
  /* Not there yet: the dashed outline of an empty seat. */
  .empty {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 1rem;
    border: 2px dashed var(--line);
    border-radius: var(--radius);
    color: var(--ink-soft);
    text-align: center;
  }
  .hint {
    margin: 0;
  }
</style>
