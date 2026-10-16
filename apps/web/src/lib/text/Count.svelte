<script lang="ts">
  import { Background } from './background.svelte.ts';
  import Frame from './Frame.svelte';
  import TextBox from '#lib/ui/TextBox.svelte';

  let text = $state('');
  const work = new Background();
  $effect(() => work.ask(text === '' ? undefined : { tool: 'count', text }));
</script>

<Frame
  title="Count"
  blurb="How long the text is, counted five ways."
  rows={work.current?.rows ?? []}
  problem={work.current?.problem}
  exact={() => work.exact()?.rows ?? []}
  busy={work.busy}
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
