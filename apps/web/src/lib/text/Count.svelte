<script lang="ts">
  import { count, explain } from '@pokerji/text-tools';
  import Frame from './Frame.svelte';
  import TextBox from './TextBox.svelte';

  let text = $state('');
  const made = $derived(count(text));
  const said = (value: number): string => value.toLocaleString('en');
</script>

<Frame
  title="Count"
  blurb="How long the text is, counted five ways."
  rows={made.ok && text !== ''
    ? [
        { name: 'Characters', value: said(made.value.characters), plain: true },
        { name: 'Without white space', value: said(made.value.solid), plain: true },
        { name: 'Words', value: said(made.value.words), plain: true },
        { name: 'Lines', value: said(made.value.lines), plain: true },
        { name: 'Bytes', value: said(made.value.bytes), plain: true },
      ]
    : []}
  problem={made.ok ? undefined : explain(made.problem)}
  waiting="The counts appear here as you type."
>
  <TextBox id="t-text" label="Text" bind:value={text} />
  {#snippet note()}
    <p class="hint">
      A character is what a reader sees as one: an emoji or an accented letter counts once. Bytes
      are counted as UTF-8.
    </p>
  {/snippet}
</Frame>
