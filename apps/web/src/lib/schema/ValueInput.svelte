<script lang="ts">
  import {
    itemTitle,
    LIMITS,
    nestedDefinition,
    typeLabel,
    type Field,
    type ItemPath,
    type TextKind,
    type Value,
  } from '@pokerji/schema-builder';
  import type { Builder } from './builder.svelte.ts';
  import { fieldId } from './ids.ts';
  import ItemFields from './ItemFields.svelte';
  import { blankFor, convert, specLabel, specOf, type SpecOption } from './values.ts';

  let {
    builder,
    at,
    field,
    index,
    value,
    depth,
    specs,
    count,
    describedby,
  }: {
    builder: Builder;
    at: ItemPath;
    field: Field;
    index: number;
    /** Nothing yet, for the one empty control a field with no values shows. */
    value: Value | undefined;
    depth: number;
    specs: SpecOption[];
    /** How many values the property has. */
    count: number;
    describedby: string | undefined;
  } = $props();

  // Properties whose text runs to sentences.
  const LONG = ['description', 'text', 'reviewBody', 'articleBody'];
  const PLACEHOLDERS: Partial<Record<TextKind, string>> = {
    url: 'https://',
    date: 'YYYY-MM-DD',
    dateTime: 'YYYY-MM-DDTHH:MM:SS+00:00',
    time: 'HH:MM',
  };

  const id = $derived(fieldId(at, field.property, index));
  const step = $derived({ property: field.property, index });
  const spec = $derived(value ? specOf(value) : (specs[0]?.id ?? 'text'));
  // A value keeps its own kind on offer even if the field would not offer it now.
  const options = $derived(
    specs.some((option) => option.id === spec) ? specs : [...specs, { id: spec, label: specLabel(spec) }],
  );
  const name = $derived(count > 1 ? `${field.label} ${index + 1}` : field.label);
  // The first control is named by the field's label element; the rest name themselves.
  const label = $derived(index === 0 ? undefined : name);
  const text = $derived(value && 'text' in value ? value.text : '');
  const textKind = $derived<TextKind>(value && 'text' in value ? value.kind : (spec as TextKind));
  const others = $derived(builder.draft.items.filter((other) => other.key !== at.key));

  const write = (next: Value) => {
    if (value === undefined) builder.addValue(at, field.property, next);
    else builder.setValue(at, step, next);
  };
  const tick = (on: boolean) => {
    if (on) write({ kind: 'boolean', on: true });
    else if (value !== undefined) builder.removeValue(at, step);
  };
  const choiceLabel = (choice: string) => typeLabel(choice.slice(choice.lastIndexOf('/') + 1));
</script>

<div class="value">
  {#if options.length > 1}
    <select
      class="kind"
      aria-label="Kind of value for {name}"
      value={spec}
      onchange={(event) => write(convert(value, event.currentTarget.value))}
    >
      {#each options as option (option.id)}
        <option value={option.id}>{option.label}</option>
      {/each}
    </select>
  {/if}

  {#if spec.startsWith('item:')}
    {#if value?.kind === 'item'}
      <fieldset class="nested">
        <legend>{typeLabel(value.item.type)}</legend>
        <ItemFields
          {builder}
          at={{ key: at.key, steps: [...at.steps, step] }}
          item={value.item}
          definition={nestedDefinition(field, value.item.type)}
          depth={depth + 1}
        />
      </fieldset>
    {:else}
      <button type="button" {id} disabled={depth >= LIMITS.depth} onclick={() => write(blankFor(spec))}
        >Add {field.label.toLowerCase()}</button
      >
      {#if depth >= LIMITS.depth}
        <p class="hint">Items can be nested {LIMITS.depth} deep at most.</p>
      {/if}
    {/if}
  {:else if spec === 'reference'}
    <select
      {id}
      aria-label={label}
      aria-describedby={describedby}
      value={value?.kind === 'reference' ? value.key : ''}
      onchange={(event) => write({ kind: 'reference', key: event.currentTarget.value })}
    >
      <option value="">Choose an item</option>
      {#each others as other (other.key)}
        <option value={other.key}>{itemTitle(other)}</option>
      {/each}
    </select>
  {:else if spec === 'boolean'}
    <input
      type="checkbox"
      {id}
      aria-label={label}
      aria-describedby={describedby}
      checked={value?.kind === 'boolean' && value.on}
      onchange={(event) => tick(event.currentTarget.checked)}
    />
  {:else if field.choices}
    <select
      {id}
      aria-label={label}
      aria-describedby={describedby}
      value={text}
      onchange={(event) => write({ kind: textKind, text: event.currentTarget.value })}
    >
      <option value="">Not set</option>
      {#each field.choices as choice (choice)}
        <option value={choice}>{choiceLabel(choice)}</option>
      {/each}
    </select>
  {:else if spec === 'text' && LONG.includes(field.property)}
    <textarea
      {id}
      aria-label={label}
      aria-describedby={describedby}
      maxlength={LIMITS.text}
      value={text}
      oninput={(event) => write({ kind: textKind, text: event.currentTarget.value })}
    ></textarea>
  {:else}
    <input
      {id}
      type="text"
      aria-label={label}
      aria-describedby={describedby}
      autocomplete="off"
      spellcheck={textKind === 'text'}
      inputmode={textKind === 'number' ? 'decimal' : textKind === 'url' ? 'url' : 'text'}
      placeholder={PLACEHOLDERS[textKind]}
      maxlength={LIMITS.text}
      value={text}
      oninput={(event) => write({ kind: textKind, text: event.currentTarget.value })}
    />
  {/if}

  {#if value !== undefined && (count > 1 || field.repeats || value.kind === 'item' || value.kind === 'reference')}
    <div class="actions">
      {#if count > 1}
        <button
          type="button"
          class="compact"
          aria-label="Move {name} up"
          disabled={index === 0}
          onclick={() => builder.moveValue(at, step, -1)}>Up</button
        >
        <button
          type="button"
          class="compact"
          aria-label="Move {name} down"
          disabled={index === count - 1}
          onclick={() => builder.moveValue(at, step, 1)}>Down</button
        >
      {/if}
      <button
        type="button"
        class="compact danger"
        aria-label="Remove {name}"
        onclick={() => builder.removeValue(at, step)}>Remove</button
      >
    </div>
  {/if}
</div>

<style>
  .value {
    display: grid;
    gap: 0.4rem;
    margin-bottom: 0.6rem;
  }
  /* An Add button is as wide as its words, like the other small controls. */
  .value > button {
    justify-self: start;
  }
  .kind {
    width: auto;
    justify-self: start;
    min-height: 2.25rem;
    padding-block: 0.2rem;
    font-size: 0.95rem;
  }
  /* An item inside an item: stepped in and bounded by a line. Not a panel in a panel. */
  .nested {
    margin: 0;
    padding: 0.9rem 1rem 0.4rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    min-width: 0;
  }
  .nested legend {
    padding-inline: 0.4rem;
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 1.25rem;
    line-height: 1.05;
  }
  @media (max-width: 40rem) {
    .nested {
      padding: 0.7rem 0.6rem 0.2rem;
    }
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
</style>
