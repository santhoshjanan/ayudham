<script lang="ts">
  import { Background } from './background.svelte.ts';
  import Frame from './Frame.svelte';
  import TextBox from './TextBox.svelte';

  let text = $state('');
  const work = new Background();
  $effect(() => work.ask(text === '' ? undefined : { tool: 'slug', text }));
  // A line with nothing a slug can keep comes out empty; the page says so.
  const emptied = $derived(work.current?.emptied === true);
</script>

<Frame
  title="Slug"
  blurb="A name safe for a web address: lowercase letters and digits joined by hyphens."
  rows={work.current?.rows ?? []}
  problem={work.current?.problem}
  exact={() => work.exact()?.rows ?? []}
  busy={work.busy}
  waiting="The slug appears here as you type."
>
  <TextBox id="t-text" label="Text" bind:value={text} />
  {#snippet note()}
    {#if emptied}
      <p class="hint">
        Lines with no letters or digits a slug can keep come out empty. Accents are removed;
        other alphabets have no plain form.
      </p>
    {/if}
  {/snippet}
</Frame>
