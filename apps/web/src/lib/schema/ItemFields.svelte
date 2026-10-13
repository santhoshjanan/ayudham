<script lang="ts">
  import {
    fieldsFor,
    type Definition,
    type Field,
    type Item,
    type ItemPath,
  } from '@pokerji/schema-builder';
  import type { Builder } from './builder.svelte.ts';
  import FieldRow from './FieldRow.svelte';

  let {
    builder,
    at,
    item,
    definition,
    depth,
  }: {
    builder: Builder;
    at: ItemPath;
    item: Item;
    /** The guided form in force here, if there is one. */
    definition: Definition | undefined;
    /** 1 for a top-level item. */
    depth: number;
  } = $props();

  const fields = $derived(fieldsFor(item, definition, builder.vocabulary));
  const guided = $derived(new Set((definition?.fields ?? []).map((field) => field.property)));
  const level = (wanted: Field['level']) =>
    fields.filter((field) => guided.has(field.property) && field.level === wanted);
  const added = $derived(fields.filter((field) => !guided.has(field.property)));
  // Required, then recommended, then whatever was added from the vocabulary.
  const main = $derived([...level('required'), ...level('recommended'), ...added]);
  // A field stays in its group whether or not it has a value, so typing never moves it.
  const more = $derived(level('optional'));
  const moreHeld = $derived(
    more.some((field) => item.properties.some((property) => property.name === field.property)),
  );
</script>

{#each main as field (field.property)}
  <FieldRow {builder} {at} {item} {field} {depth} />
{/each}

{#if more.length > 0}
  <details class="more" open={moreHeld}>
    <summary>More fields</summary>
    {#each more as field (field.property)}
      <FieldRow {builder} {at} {item} {field} {depth} />
    {/each}
  </details>
{/if}

<style>
  .more {
    margin-bottom: 0.9rem;
    border-top: 1px solid var(--line);
    padding-top: 0.6rem;
  }
  .more summary {
    cursor: pointer;
    font-weight: 650;
    margin-bottom: 0.9rem;
  }
</style>
