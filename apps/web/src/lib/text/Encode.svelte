<script lang="ts">
  import { decode, encode, explain, type Encoding } from '@pokerji/text-tools';
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

  type Made = { value: string; binary: boolean } | { problem: string } | undefined;

  const made = $derived.by((): Made => {
    if (text === '') return undefined;
    if (decoding) {
      const read = decode(text, form);
      return read.ok
        ? { value: read.value.text, binary: read.value.binary }
        : { problem: explain(read.problem) };
    }
    const written = encode(text, form);
    return written.ok
      ? { value: written.value, binary: false }
      : { problem: explain(written.problem) };
  });
</script>

<Frame
  title="Encode and decode"
  blurb="Text to and from Base64, hex, URL encoding and HTML entities, as UTF-8."
  rows={made && 'value' in made && made.value !== '' ? [{ value: made.value }] : []}
  problem={made && 'problem' in made ? made.problem : undefined}
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
    {#if made && 'value' in made && made.binary}
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
