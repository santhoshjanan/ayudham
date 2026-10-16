<script lang="ts">
  import type { Symbology } from '@pokerji/code-maker';
  import NumberField from '#lib/ui/NumberField.svelte';
  import Toggle from '#lib/ui/Toggle.svelte';

  let {
    symbology,
    chosen,
  }: {
    symbology: Symbology;
    /** This symbology's options, kept for the visit. Automatic is null. */
    chosen: Record<string, string | number | boolean | null>;
  } = $props();

  const range = (min: number, max: number) =>
    `${min.toLocaleString('en')} to ${max.toLocaleString('en')}`;
</script>

<section aria-labelledby="c-options">
  <h2 id="c-options">Options</h2>
  {#if symbology.options.length === 0}
    <p class="hint">This code has no options.</p>
  {/if}
  {#each symbology.options as spec (spec.key)}
    {#if spec.kind === 'choice'}
      <p class="field">
        <label for="c-option-{spec.key}">{spec.label}</label>
        <select id="c-option-{spec.key}" bind:value={chosen[spec.key]}>
          {#each spec.values as value (value)}
            <option {value}>{value === 'auto' ? 'Automatic' : value}</option>
          {/each}
        </select>
      </p>
    {:else if spec.kind === 'integer'}
      <NumberField
        id="c-option-{spec.key}"
        label={spec.label}
        min={spec.min}
        max={spec.max}
        hint={spec.default === 'auto'
          ? `Leave empty for automatic, or ${range(spec.min, spec.max)}.`
          : undefined}
        bind:value={chosen[spec.key] as number | null}
      />
    {/if}
  {/each}
  {#if symbology.options.some((spec) => spec.kind === 'boolean')}
    <div class="switches">
      {#each symbology.options as spec (spec.key)}
        {#if spec.kind === 'boolean'}
          <Toggle label={spec.label} bind:on={chosen[spec.key] as boolean} />
        {/if}
      {/each}
    </div>
  {/if}
</section>
