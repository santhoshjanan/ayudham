<script lang="ts">
  let {
    text,
    label,
    about,
    primary = false,
    compact = false,
    disabled = false,
    onfail,
  }: {
    text: string;
    label: string;
    /** What this button copies, when the page has several: added to its name for screen readers. */
    about?: string;
    /** The page's one next step. */
    primary?: boolean;
    /** The size of a control that repeats. */
    compact?: boolean;
    disabled?: boolean;
    /** Called when the browser refuses the clipboard. */
    onfail?: () => void;
  } = $props();
  let copied = $state(false);
  const shown = $derived(copied ? 'Copied' : label);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => (copied = false), 2_000);
    } catch {
      // The text is on the page to select by hand.
      onfail?.();
    }
  };
</script>

<button
  type="button"
  class:primary
  class:compact
  {disabled}
  aria-label={about ? `${shown} ${about}` : undefined}
  onclick={copy}>{shown}</button
>
<span class="sr-only" role="status">{copied ? 'Copied' : ''}</span>
