<script lang="ts">
  import { explain } from '@ayudham/code-maker';
  import type { Maker } from './maker.svelte.ts';
  import type { Output } from './work.ts';

  let { maker, disabled }: { maker: Maker; disabled: boolean } = $props();

  const FILES: [Exclude<Output, 'preview'>, string, string][] = [
    ['png', 'PNG', 'image/png'],
    ['jpg', 'JPG', 'image/jpeg'],
    ['svg', 'SVG', 'image/svg+xml'],
    ['pdf', 'PDF', 'application/pdf'],
    ['zip', 'All as ZIP', 'application/zip'],
  ];
  let making = $state<Output | null>(null);
  let said = $state('');
  let refused = $state('');

  /** Makes the file for every choice as it is now, and hands it to the browser to save. */
  const save = async (output: Exclude<Output, 'preview'>, label: string, type: string) => {
    making = output;
    said = '';
    refused = '';
    const made = await maker.exact(output);
    making = null;
    if (!made?.ok || !made.file || !made.name) {
      refused = made && !made.ok ? explain(made.problem) : `The ${label} could not be made.`;
      return;
    }
    // A link to the file in this tab's memory, pressed, and forgotten a minute later: some
    // browsers lose a download whose address is taken back before they have started saving it.
    const address = URL.createObjectURL(new Blob([made.file as BlobPart], { type }));
    const link = document.createElement('a');
    link.href = address;
    link.download = made.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(address), 60_000);
    said = `${label} ready.`;
  };
</script>

<div class="downloads" role="group" aria-label="Download">
  {#each FILES as [output, label, type] (output)}
    <button
      type="button"
      class="compact"
      disabled={disabled || making !== null}
      onclick={() => save(output, label, type)}>{making === output ? 'Making…' : label}</button
    >
  {/each}
</div>
<span class="sr-only" role="status">{said}</span>
{#if refused}<p role="status">{refused}</p>{/if}

<style>
  [role='status'] {
    margin: 0;
  }
  .downloads {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
</style>
