<script lang="ts">
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

  /** Makes the file for every choice as it is now, and hands it to the browser to save. */
  const save = async (output: Exclude<Output, 'preview'>, label: string, type: string) => {
    making = output;
    said = '';
    const made = await maker.exact(output);
    making = null;
    if (!made?.ok || !made.file || !made.name) {
      said = `The ${label} could not be made.`;
      return;
    }
    // A link to the file in this tab's memory, pressed and then forgotten at once.
    const address = URL.createObjectURL(new Blob([made.file as BlobPart], { type }));
    const link = document.createElement('a');
    link.href = address;
    link.download = made.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(address), 0);
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

<style>
  .downloads {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
</style>
