<script lang="ts">
  let {
    text,
    label,
    primary = false,
    disabled = false,
    onfail,
  }: {
    text: string;
    label: string;
    /** The page's one next step. */
    primary?: boolean;
    disabled?: boolean;
    /** Called when the browser refuses the clipboard. */
    onfail?: () => void;
  } = $props();
  let copied = $state(false);

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

<button type="button" class:primary {disabled} onclick={copy}>{copied ? 'Copied' : label}</button>
<span class="sr-only" role="status">{copied ? 'Copied' : ''}</span>
