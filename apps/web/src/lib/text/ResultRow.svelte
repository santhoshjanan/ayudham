<script lang="ts">
  import CopyButton from '#lib/ui/CopyButton.svelte';
  import type { Row } from './tools.ts';

  let {
    row,
    copy,
    disabled = false,
    about,
    onfail,
  }: {
    row: Row;
    copy?: string | (() => string);
    disabled?: boolean;
    about: string;
    onfail: () => void;
  } = $props();
</script>

<li data-testid="result">
  <div class="what">
    {#if row.name}<span class="name">{row.name}</span>{/if}
    <span class="value">{row.value}</span>
  </div>
  {#if !row.plain}
    <CopyButton text={copy ?? row.value} label="Copy" {about} compact {disabled} {onfail} />
  {/if}
</li>

<style>
  /* One result to a ruled line, as a finding is in the builder. */
  li {
    display: flex;
    gap: 0.75rem;
    align-items: start;
    justify-content: space-between;
    padding: 0.6rem 0;
    border-bottom: 1px solid var(--line);
    /* A row out of view is not laid out until it scrolls in: twelve rows of 100,000 characters
       would otherwise be set in type on every keystroke. */
    content-visibility: auto;
    contain-intrinsic-size: auto 3rem;
  }
  .what {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
  }
  .name {
    font-size: 0.95rem;
    color: var(--ink-soft);
  }
  /* The code block's type. A value wraps anywhere: nothing is cut short, nothing scrolls sideways. */
  .value {
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 0.875rem;
    line-height: 1.55;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  li :global(button) {
    flex: none;
  }
</style>
