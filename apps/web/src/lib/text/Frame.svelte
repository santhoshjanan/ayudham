<script lang="ts">
  import { tick, type Snippet } from 'svelte';
  import CopyButton from '#lib/ui/CopyButton.svelte';
  import ResultRow from './ResultRow.svelte';
  import { joined, type Row } from './tools.ts';

  let {
    title,
    blurb,
    rows,
    keepLast = true,
    mode,
    exact,
    busy = false,
    problem,
    strength,
    waiting,
    again,
    retry,
    made,
    children,
    note,
  }: {
    title: string;
    blurb: string;
    rows: Row[];
    /** Keep results only for an invalid option, never a failed random source. */
    keepLast?: boolean;
    /** The tool's current kind or mode. Results made under another are never kept. */
    mode?: string;
    /** The rows for what is typed now, worked out at once if they are still on their way. */
    exact?: () => Row[];
    /** A newer answer is being worked out; the rows shown are the last one's. */
    busy?: boolean;
    /** Why there is no result, in a sentence. */
    problem?: string;
    /** Bits, where the tool has a strength to state. */
    strength?: number;
    /** What the rail says before there is a result. */
    waiting: string;
    /** A generator passes this, which makes Generate again the next step. */
    again?: () => void;
    /** Offered beside a problem that trying again might cure. */
    retry?: () => void;
    /** Said once to a screen reader when a generator makes its results. */
    made?: string;
    /** The tool's options. */
    children: Snippet;
    /** Something the person should know about these results. */
    note?: Snippet;
  } = $props();

  let copyRefused = $state(false);
  const refused = () => (copyRefused = true);

  // A generator keeps its last good results while an option is outside its limits.
  // They are kept only for the mode they were made in: dice rolls are never offered as picks.
  let last = $state.raw<{ mode: string | undefined; rows: Row[] }>({ mode: undefined, rows: [] });
  $effect.pre(() => {
    if (rows.length > 0) last = { mode, rows };
    else if (!keepLast) last = { mode, rows: [] };
  });
  const shown = $derived(
    rows.length > 0 || !again || !keepLast ? rows : last.mode === mode ? last.rows : [],
  );

  // What a screen reader hears. Emptied and set again on Generate again, so the same words
  // ("1 made.") are announced each time, not only when the count changes.
  let said = $state('');
  $effect.pre(() => {
    said = made ?? '';
  });
  const generate = async () => {
    again?.();
    said = '';
    await tick();
    said = made ?? '';
  };
  const about = (row: Row, index: number): string => row.name ?? `result ${index + 1}`;
  // Copy takes the answer for what is typed now, never a row still showing the last answer.
  const all = $derived(exact ? () => joined(exact()) : joined(shown));
  const one = (row: Row, index: number): string | (() => string) =>
    exact ? () => exact()[index]?.value ?? row.value : row.value;
</script>

<div class="floor">
  <section class="options" aria-labelledby="tool-heading">
    <h2 id="tool-heading">{title}</h2>
    <p class="hint">{blurb}</p>
    {@render children()}
  </section>

  <!-- Results are not offered to a browser's translator, which may send page text away. -->
  <aside class="rail" aria-label="Results" translate="no" aria-busy={busy}>
    <div class="next">
      {#if again}
        <button type="button" class="primary" onclick={generate}>Generate again</button>
      {:else}
        <CopyButton
          text={all}
          label={shown.length > 1 ? 'Copy all' : 'Copy'}
          primary
          disabled={shown.length === 0}
          onfail={refused}
        />
      {/if}
    </div>
    {#if strength !== undefined}
      <p class="strength">Strength: <b>{strength.toLocaleString('en')} bits</b></p>
    {/if}
    {#if copyRefused}
      <p role="status">Copying was refused. Select the text below and copy it by hand.</p>
    {/if}
    {#if problem}
      <p role="status">{problem}</p>
      {#if retry}
        <p class="retry"><button type="button" onclick={retry}>Try again</button></p>
      {/if}
    {/if}
    {#if shown.length > 0}
      <ul>
        {#each shown as row, index (index)}
          <ResultRow {row} copy={one(row, index)} about={about(row, index)} onfail={refused} />
        {/each}
      </ul>
      {#if again && shown.length > 1}
        <p class="all"><CopyButton text={all} label="Copy all" onfail={refused} /></p>
      {/if}
    {:else if !problem}
      <p class="empty">{waiting}</p>
    {/if}
    {@render note?.()}
    <span class="sr-only" role="status" data-testid="made">{said}</span>
  </aside>
</div>

<style>
  /* The floor: the options, and the results' rail on one edge, as in the builder. */
  .floor {
    display: grid;
    gap: 2rem;
    padding: clamp(1.5rem, 4vw, 2.5rem) clamp(1rem, 6vw, 5rem) clamp(1.5rem, 4vw, 3rem);
    align-items: start;
    grid-template-columns: minmax(0, 1fr);
  }
  @media (min-width: 64rem) {
    .floor {
      grid-template-columns: minmax(0, 40rem) minmax(22rem, 36rem);
      gap: 2.5rem;
    }
  }
  .options {
    min-width: 0;
  }
  .options h2 {
    margin-top: 0;
  }
  .options > .hint {
    margin-bottom: 1.4rem;
  }

  /* The rail: the results, staying in view while the options scroll. */
  .rail {
    display: grid;
    gap: 0.6rem;
    padding: 1.1rem;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    min-width: 0;
  }
  @media (min-width: 64rem) {
    .rail {
      position: sticky;
      top: 1rem;
      max-height: calc(100dvh - 2rem);
      overflow-y: auto;
    }
  }
  .next {
    display: grid;
  }
  @media (min-width: 64rem) {
    .next {
      position: sticky;
      top: 0;
      z-index: 1;
      background: var(--surface);
    }
  }
  /* The rail's first control is the next thing to do, set as the room's Reveal is. */
  .next :global(button.primary) {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 1.5rem;
    letter-spacing: 0.03em;
    min-height: 3.5rem;
  }
  .strength,
  .retry,
  .all {
    margin: 0;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    border-top: 1px solid var(--line);
  }
  .all {
    margin-top: 0.4rem;
  }
  /* Not there yet: the dashed outline of an empty seat. */
  .empty {
    margin: 0;
    padding: 1.5rem 1rem;
    border: 2px dashed var(--line);
    border-radius: var(--radius);
    color: var(--ink-soft);
  }
  .rail :global(.hint) {
    margin: 0.2rem 0 0;
  }
</style>
