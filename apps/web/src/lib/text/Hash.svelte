<script lang="ts">
  import { checkText, explain, toHex, utf8 } from '@pokerji/text-tools';
  import Frame from './Frame.svelte';
  import TextBox from '#lib/ui/TextBox.svelte';
  import type { Row } from './tools.ts';

  const ALGORITHMS = ['SHA-256', 'SHA-384', 'SHA-512'] as const;

  // Hashing is the browser's own, and some browsers offer it only on a secure page.
  const can = typeof crypto !== 'undefined' && crypto.subtle !== undefined;

  let text = $state('');
  let failed = $state(false);
  // New sums are on their way; the ones shown belong to older text and are not offered to copy.
  let pending = $state(false);
  let rows = $state.raw<Row[]>([]);
  const checked = $derived(checkText(text));

  $effect(() => {
    const value = text;
    // The last sums stay on screen until the new ones arrive; they go only when there is no text.
    if (!can || value === '' || !checked.ok) {
      rows = [];
      failed = false;
      pending = false;
      return;
    }
    pending = true;
    // Hashing takes a moment; an answer to text that has since changed is thrown away.
    let stale = false;
    const data = utf8(value) as Uint8Array<ArrayBuffer>;
    void Promise.all(
      ALGORITHMS.map(async (name) => ({
        name,
        value: toHex(new Uint8Array(await crypto.subtle.digest(name, data))),
      })),
    ).then(
      (sums) => {
        if (stale) return;
        rows = sums;
        failed = false;
        pending = false;
      },
      () => {
        if (stale) return;
        rows = [];
        failed = true;
        pending = false;
      },
    );
    return () => {
      stale = true;
    };
  });

  const problem = $derived(
    !can || failed
      ? 'This browser cannot make hashes on this page.'
      : checked.ok
        ? undefined
        : explain(checked.problem),
  );
</script>

<Frame
  title="Hash"
  blurb="The SHA-2 sums of the text exactly as typed, as UTF-8, in hex."
  {rows}
  {problem}
  busy={pending}
  waiting="The three sums appear here as you type."
>
  <TextBox id="t-text" label="Text" bind:value={text} />
  {#snippet note()}
    <p class="hint">
      Every character counts, a line ending included. These hashes check that text has not
      changed; they are not a way to store passwords.
    </p>
  {/snippet}
</Frame>
