<script lang="ts">
  import { explain, slug } from '@pokerji/text-tools';
  import Frame from './Frame.svelte';
  import TextBox from './TextBox.svelte';

  let text = $state('');
  const made = $derived(slug(text));
  const value = $derived(made.ok ? made.value : '');
  // A line with nothing a slug can keep comes out empty; the page says so.
  const emptied = $derived(text.trim() !== '' && value.split('\n').some((line) => line === ''));
</script>

<Frame
  title="Slug"
  blurb="A name safe for a web address: lowercase letters and digits joined by hyphens."
  rows={value.replaceAll('\n', '') !== '' ? [{ value }] : []}
  problem={made.ok ? undefined : explain(made.problem)}
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
