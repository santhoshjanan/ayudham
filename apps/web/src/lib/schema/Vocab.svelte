<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Vocabulary } from '@ayudham/schema-builder';
  import type { Builder } from './builder.svelte.ts';

  // Shows what needs the vocabulary once it is here; says so while it is not.
  let { builder, children }: { builder: Builder; children: Snippet<[Vocabulary]> } = $props();
</script>

{#if builder.vocabulary}
  {@render children(builder.vocabulary)}
{:else if builder.loading === 'failed'}
  <p role="status">
    The Schema.org vocabulary could not be loaded, so types and properties cannot be searched.
    The guided forms still work.
    <button type="button" class="compact" onclick={() => builder.loadVocabulary()}>Try again</button>
  </p>
{:else}
  <p class="hint" role="status">Loading the vocabulary…</p>
{/if}
