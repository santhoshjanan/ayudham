<script lang="ts">
  import { explain, type Finding } from '@ayudham/code-maker';

  let { findings }: { findings: Finding[] } = $props();

  /** Fixed sentences: nothing typed ever reaches them. */
  const SAID: Record<Finding['code'], string> = {
    'contrast-low':
      'The colours are close in contrast, so some scanners may struggle. Dark on light reads best.',
    'contrast-too-low': explain('contrast-too-low'),
    'light-on-dark': 'This is light on dark. Some readers cannot read a code this way round.',
    'quiet-zone-small':
      'The margin round the code is narrower than its standard asks. Leave space round it wherever it goes.',
    'logo-too-large': explain('logo-too-large'),
    'no-eci':
      'This code cannot say its text is UTF-8, so some readers may show accented or non-Latin letters wrongly.',
    'transparent-measured-as-white':
      'The background is transparent, so its contrast is measured against white. Place it on something light.',
  };

  const stops = $derived(findings.filter((finding) => finding.level === 'refusal').length);
  const checks = $derived(findings.length - stops);
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  // The count is said in words, so the badges are not the only thing that tells them apart.
  const summary = $derived(
    [
      stops > 0 ? `${plural(stops, 'thing stops', 'things stop')} this code being taken away.` : '',
      checks > 0 ? `${plural(checks, 'thing is', 'things are')} worth checking.` : '',
    ]
      .filter(Boolean)
      .join(' '),
  );
</script>

<section class="findings" aria-labelledby="c-findings">
  <h2 id="c-findings">What to check</h2>
  <div aria-live="polite">
    {#if findings.length === 0}
      <p class="hint">Nothing: this code is ready to take away.</p>
    {:else}
      <p class="summary">{summary}</p>
      <ul>
        {#each findings as finding (finding.code)}
          <li data-testid="finding" data-level={finding.level}>
            <span class="badge {finding.level === 'refusal' ? 'owner' : 'quiet'}"
              >{finding.level === 'refusal' ? 'Stops export' : 'Check'}</span
            >
            <span>{SAID[finding.code]}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</section>

<style>
  .findings h2 {
    margin: 0.9rem 0 0.4rem;
    font-size: 1.25rem;
  }
  .summary,
  .hint {
    margin: 0 0 0.4rem;
  }
  /* A ledger: one finding to a ruled line, as the builder's are. */
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    border-top: 1px solid var(--line);
  }
  li {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: baseline;
    gap: 0.6rem;
    padding: 0.6rem 0.2rem;
    border-bottom: 1px solid var(--line);
  }
</style>
