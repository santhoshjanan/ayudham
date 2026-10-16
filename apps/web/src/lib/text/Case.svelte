<script lang="ts">
  import { Background } from './background.svelte.ts';
  import Frame from './Frame.svelte';
  import TextBox from '#lib/ui/TextBox.svelte';

  let text = $state('');
  // Twelve forms of 100,000 characters take a while; the worker works them out beside the page.
  const work = new Background();
  $effect(() => work.ask(text === '' ? undefined : { tool: 'case', text }));
</script>

<Frame
  title="Case"
  blurb="The same words in twelve forms. Each line is converted on its own."
  rows={work.current?.rows ?? []}
  problem={work.current?.problem}
  exact={() => work.exact()?.rows ?? []}
  busy={work.busy}
  waiting="The twelve forms appear here as you type."
>
  <TextBox id="t-text" label="Text" bind:value={text} />
</Frame>
