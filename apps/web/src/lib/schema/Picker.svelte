<script lang="ts">
  let {
    id,
    label,
    search,
    describe,
    onpick,
  }: {
    id: string;
    label: string;
    search: (query: string) => string[];
    /** A line about a result, shown under its name. */
    describe?: (name: string) => string;
    onpick: (name: string) => void;
  } = $props();

  let query = $state('');
  const results = $derived(search(query));
</script>

<div class="picker">
  <label for={id}>{label}</label>
  <input {id} type="search" autocomplete="off" spellcheck="false" bind:value={query} />
  <ul class="results">
    {#each results as name (name)}
      <li>
        <button type="button" onclick={() => onpick(name)}>
          <b>{name}</b>
          {#if describe && describe(name)}
            <span>{describe(name)}</span>
          {/if}
        </button>
      </li>
    {:else}
      <li class="hint">Nothing matches.</li>
    {/each}
  </ul>
</div>

<style>
  .picker {
    margin-bottom: 1.1rem;
  }
  /* Results sit in the page beneath the field: a ruled list, nothing floating. */
  .results {
    list-style: none;
    margin: 0.4rem 0 0;
    padding: 0;
    max-height: 22rem;
    overflow-y: auto;
    border-top: 1px solid var(--line);
  }
  .results li {
    border-bottom: 1px solid var(--line);
  }
  .results li.hint {
    padding: 0.6rem 0;
  }
  .results button {
    display: grid;
    gap: 0.1rem;
    width: 100%;
    min-height: 2.75rem;
    padding: 0.5rem 0.6rem;
    text-align: left;
    background: none;
    border: 0;
    border-radius: 0;
    font-weight: 400;
  }
  .results button:hover:not(:disabled) {
    background: var(--ink);
    color: var(--ground);
  }
  .results b {
    font-weight: 650;
  }
  .results span {
    font-size: 0.95rem;
    color: var(--ink-soft);
  }
  .results button:hover span {
    color: inherit;
  }
</style>
