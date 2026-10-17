<script lang="ts">
  import { LIMITS, type Symbology } from '@ayudham/code-maker';
  import TextBox from '#lib/ui/TextBox.svelte';
  import Toggle from '#lib/ui/Toggle.svelte';
  import type { TextFields } from '../payload.ts';

  let { fields, symbology }: { fields: TextFields; symbology: Symbology } = $props();
  const unicode = $derived(symbology.capability === 'eci' || symbology.capability === 'utf8');
</script>

<TextBox id="c-text" label="Text" rows={4} max={LIMITS.text} bind:value={fields.text} />
<details class="options">
  <summary>Text options</summary>
  <div class="switches">
    <Toggle label="Read escapes" bind:on={fields.escapes} />
    <Toggle label="Trim spaces" bind:on={fields.trim} />
    {#if symbology.capability === 'eci'}
      <Toggle label="UTF-8 marker" bind:on={fields.eci} />
    {/if}
  </div>
  <p class="hint">
    Read escapes turns <code>\n</code>, <code>\r</code>, <code>\t</code>, <code>\\</code>,
    <code>\xHH</code> and <code>\u{'{'}…{'}'}</code> into the characters they name. Trim spaces removes
    space at both ends.
    {#if symbology.capability === 'eci'}
      The UTF-8 marker tells readers that accented and non-Latin text is UTF-8.
    {:else if unicode}
      This code cannot carry a UTF-8 marker, so some readers may show accented or non-Latin
      letters wrongly.
    {/if}
  </p>
  <p class="field">
    <label for="c-newline">Line endings</label>
    <select id="c-newline" bind:value={fields.newline}>
      <option value="lf">LF (most readers)</option>
      <option value="crlf">CRLF (Windows)</option>
    </select>
  </p>
</details>

<style>
  .options {
    margin-bottom: 1.1rem;
    border-top: 1px solid var(--line);
    padding-top: 0.6rem;
  }
  .options summary {
    cursor: pointer;
    font-weight: 650;
    margin-bottom: 0.9rem;
  }
  .options .hint {
    margin: 0 0 1.1rem;
  }
</style>
