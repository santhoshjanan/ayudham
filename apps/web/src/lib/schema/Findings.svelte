<script lang="ts">
  import { findingWords, type Finding } from '@pokerji/schema-builder';
  import type { Builder } from './builder.svelte.ts';

  let { builder, onreveal }: { builder: Builder; onreveal: (finding: Finding) => void } = $props();

  const rows = $derived(
    builder.findings.map((finding) => ({ finding, ...findingWords(builder.draft, finding) })),
  );
  const count = (kind: Finding['kind']) =>
    builder.findings.filter((finding) => finding.kind === kind).length;
  const required = $derived(count('missing-required'));
  const recommended = $derived(count('missing-recommended'));
  const other = $derived(builder.findings.length - required - recommended);
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  // The count is said in words, so the badges are not the only thing that tells them apart.
  const summary = $derived(
    [
      required > 0 ? `${plural(required, 'required field is', 'required fields are')} empty.` : '',
      recommended > 0
        ? `${plural(recommended, 'recommended field is', 'recommended fields are')} empty.`
        : '',
      other > 0 ? `${plural(other, 'value needs', 'values need')} checking.` : '',
    ]
      .filter(Boolean)
      .join(' '),
  );
  const tag = (finding: Finding) =>
    finding.kind === 'missing-required'
      ? { word: 'Required', style: 'owner' }
      : finding.kind === 'missing-recommended'
        ? { word: 'Recommended', style: '' }
        : { word: 'Check', style: 'quiet' };
</script>

<section class="findings" aria-labelledby="findings-heading">
  <h2 id="findings-heading">What to check</h2>
  {#if builder.draft.items.length === 0}
    <p class="hint">Nothing to check yet.</p>
  {:else if rows.length === 0}
    <p class="hint">Nothing is missing, and every value is in the form it should be.</p>
  {:else}
    <p class="summary">{summary}</p>
    <ul>
      {#each rows as row, index (index)}
        <li>
          <button type="button" onclick={() => onreveal(row.finding)}>
            <span class="badge {tag(row.finding).style}">{tag(row.finding).word}</span>
            <span class="text">{row.text}</span>
            <span class="where">{row.where}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .findings h2 {
    margin: 0.9rem 0 0.4rem;
    font-size: 1.25rem;
  }
  .summary,
  .findings .hint {
    margin: 0 0 0.4rem;
  }
  /* A ledger: one finding to a ruled line, as the home page's promises are. */
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    border-top: 1px solid var(--line);
  }
  li {
    border-bottom: 1px solid var(--line);
  }
  li button {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: baseline;
    gap: 0.1rem 0.6rem;
    width: 100%;
    padding: 0.6rem 0.2rem;
    text-align: left;
    background: none;
    border: 0;
    border-radius: 0;
    font-weight: 400;
  }
  li button:hover:not(:disabled) {
    background: none;
    color: inherit;
  }
  li button:hover .text {
    text-decoration: underline;
    text-decoration-thickness: 0.09em;
    text-underline-offset: 0.2em;
  }
  .where {
    grid-column: 2;
    font-size: 0.95rem;
    color: var(--ink-soft);
    overflow-wrap: anywhere;
  }
</style>
