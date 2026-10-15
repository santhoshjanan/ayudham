<script lang="ts">
  import type { Encoding } from '@pokerji/text-tools';
  import { Background } from './background.svelte.ts';
  import Frame from './Frame.svelte';
  import TextBox from './TextBox.svelte';

  const FORM_NAMES: Array<[Encoding, string]> = [
    ['base64', 'Base64'],
    ['base64url', 'Base64URL'],
    ['hex', 'Hex'],
    ['url', 'URL'],
    ['entities', 'HTML entities'],
  ];

  let decoding = $state(false);
  let form = $state<Encoding>('base64');
  let text = $state('');

  const work = new Background();
  $effect(() => work.ask(text === '' ? undefined : { tool: 'encode', text, form, decoding }));
</script>

<Frame
  title="Encode and decode"
  blurb="Text to and from Base64, hex, URL encoding and HTML entities, as UTF-8."
  rows={work.current?.rows ?? []}
  problem={work.current?.problem}
  exact={() => work.exact()?.rows ?? []}
  busy={work.busy}
  waiting="The result appears here as you type."
>
  <div class="switches" role="group" aria-label="Direction">
    <button
      type="button"
      class="compact"
      aria-pressed={!decoding}
      onclick={() => (decoding = false)}>Encode</button
    >
    <button type="button" class="compact" aria-pressed={decoding} onclick={() => (decoding = true)}
      >Decode</button
    >
  </div>
  <p class="field">
    <label for="t-form">Form</label>
    <select id="t-form" bind:value={form}>
      {#each FORM_NAMES as [value, name] (value)}
        <option {value}>{name}</option>
      {/each}
    </select>
  </p>
  <TextBox id="t-text" label="Text" bind:value={text} />
  {#snippet note()}
    {#if work.current?.binary}
      <p class="hint">These bytes are not text, so they are shown as hex.</p>
    {/if}
  {/snippet}
</Frame>

<style>
  button[aria-pressed='true'] {
    background: var(--ink);
    color: var(--ground);
  }
</style>
