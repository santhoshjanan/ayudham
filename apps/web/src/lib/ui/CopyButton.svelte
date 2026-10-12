<script lang="ts">
  let { text, label }: { text: string; label: string } = $props();
  let copied = $state(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => (copied = false), 2_000);
    } catch {
      // The text is on the page to select by hand.
    }
  };
</script>

<button type="button" onclick={copy}>{copied ? 'Copied' : label}</button>
