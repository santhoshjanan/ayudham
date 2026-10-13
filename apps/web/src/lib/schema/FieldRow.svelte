<script lang="ts">
  import {
    LIMITS,
    valuesOf,
    type Field,
    type Item,
    type ItemPath,
    type Value,
  } from '@pokerji/schema-builder';
  import type { Builder } from './builder.svelte.ts';
  import { fieldId } from './ids.ts';
  import ValueInput from './ValueInput.svelte';
  import { blankFor, specOf, specsFor } from './values.ts';

  let {
    builder,
    at,
    item,
    field,
    depth,
  }: { builder: Builder; at: ItemPath; item: Item; field: Field; depth: number } = $props();

  const values = $derived(valuesOf(item, field.property));
  // A field with no value still shows one control. It is the same element before and after
  // the first keystroke creates the value, so the caret stays where it is.
  const slots = $derived<(Value | undefined)[]>(values.length > 0 ? values : [undefined]);
  const others = $derived(builder.draft.items.some((other) => other.key !== at.key));
  const specs = $derived(specsFor(field, builder.vocabulary, others));
  const firstId = $derived(fieldId(at, field.property, 0));
  const hintId = $derived(`${firstId}-hint`);
  const first = $derived(slots[0] ? specOf(slots[0]) : (specs[0]?.id ?? 'text'));
  // A nested item is named by its own legend, and an Add button by its own words.
  const plain = $derived(!first.startsWith('item:'));
  const full = $derived(values.length >= LIMITS.values);
</script>

<div class="field">
  <div class="head">
    {#if plain}
      <label for={firstId}>{field.label}</label>
    {:else}
      <span class="label">{field.label}</span>
    {/if}
    {#if field.level === 'required'}
      <span class="badge owner">Required</span>
    {:else if field.level === 'recommended'}
      <span class="badge">Recommended</span>
    {/if}
  </div>
  {#if field.hint}
    <p class="hint" id={hintId}>{field.hint}</p>
  {/if}
  {#each slots as value, index (index)}
    <ValueInput
      {builder}
      {at}
      {field}
      {index}
      {value}
      {depth}
      {specs}
      count={values.length}
      describedby={field.hint ? hintId : undefined}
    />
  {/each}
  {#if field.repeats && values.length > 0}
    <button
      type="button"
      class="compact"
      disabled={full}
      onclick={() => builder.addValue(at, field.property, blankFor(specs[0]?.id ?? 'text'))}
      >Add another</button
    >
    {#if full}
      <p class="hint">A property holds at most {LIMITS.values} values.</p>
    {/if}
  {/if}
</div>

<style>
  .field {
    margin-bottom: 1.1rem;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.2rem 0.5rem;
    margin-bottom: 0.3rem;
  }
  /* Inside a nested group the site's fieldset rule would thin and inline the label. */
  .head label,
  .head .label {
    display: inline;
    margin: 0;
    font-weight: 650;
  }
  .field .hint {
    margin: 0 0 0.4rem;
  }
</style>
