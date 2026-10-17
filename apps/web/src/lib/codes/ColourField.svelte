<script lang="ts">
  import { untrack } from 'svelte';
  import { explain, parseColour } from '@ayudham/code-maker';

  let {
    id,
    label,
    value = $bindable(),
    onedit,
  }: {
    id: string;
    label: string;
    /** `#rrggbb`. */
    value: string;
    /** Called when the person changes the colour, not when the page does. */
    onedit?: () => void;
  } = $props();

  let typed = $state('');
  let refused = $state(false);
  // A colour set from elsewhere (a theme, Invert) is shown in the hex field too.
  // Only a change of the value itself does this, never typing: a half-typed hex stays as typed.
  $effect.pre(() => {
    const now = value;
    untrack(() => {
      const read = parseColour(typed);
      if (!read.ok || read.value !== now) {
        typed = now;
        refused = false;
      }
    });
  });

  const type = (event: Event) => {
    typed = (event.currentTarget as HTMLInputElement).value;
    const read = parseColour(typed);
    refused = !read.ok || read.value === 'transparent';
    if (read.ok && read.value !== 'transparent' && read.value !== value) {
      value = read.value;
      onedit?.();
    }
  };
  const pick = (event: Event) => {
    value = (event.currentTarget as HTMLInputElement).value.toLowerCase();
    typed = value;
    refused = false;
    onedit?.();
  };
</script>

<!-- One label for the swatch and the hex field: they are two ways to set the same colour. The
     swatch adds the word "picker", so the two are told apart by name. -->
<div class="field colour">
  <span class="label" id="{id}-label">{label}</span>
  <span class="sr-only" id="{id}-picker">picker</span>
  <span class="pair">
    <input
      type="color"
      class="swatch"
      aria-labelledby="{id}-label {id}-picker"
      {value}
      oninput={pick}
    />
    <input
      {id}
      type="text"
      class="hex"
      aria-labelledby="{id}-label"
      maxlength="9"
      spellcheck="false"
      autocomplete="off"
      autocapitalize="off"
      translate="no"
      {...{ autocorrect: 'off' }}
      value={typed}
      oninput={type}
    />
  </span>
  {#if refused}
    <span class="hint" role="status">{explain('bad-colour')}</span>
  {/if}
</div>

<style>
  .colour {
    margin: 0 0 1.1rem;
  }
  .label {
    display: block;
    font-weight: 650;
    margin-bottom: 0.35rem;
  }
  .pair {
    display: flex;
    gap: 0.5rem;
    align-items: stretch;
  }
  /* The browser's own picker, square, bordered as a field. */
  .swatch {
    flex: none;
    width: 2.75rem;
    height: 2.75rem;
    padding: 0.2rem;
    background: var(--surface);
    border: 1.5px solid var(--field-line);
    border-radius: var(--radius);
    cursor: pointer;
  }
  .swatch:hover {
    border-color: var(--ink);
  }
  .swatch::-webkit-color-swatch-wrapper {
    padding: 0;
  }
  .swatch::-webkit-color-swatch {
    border: 0;
    border-radius: calc(var(--radius) - 2px);
  }
  .swatch::-moz-color-swatch {
    border: 0;
    border-radius: calc(var(--radius) - 2px);
  }
  .hex {
    max-width: 10rem;
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  }
  .hint {
    display: block;
    margin-top: 0.3rem;
  }
</style>
