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
    /** What is copied, or a function that works it out at the moment of the press. */
    text: string | (() => string);
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
  // A new value has not been copied yet, whatever the button said about the last one.
  $effect.pre(() => {
    void text;
    copied = false;
  });
  const shown = $derived(copied ? 'Copied' : label);

  const copy = async () => {
    try {
      const value = typeof text === 'function' ? text() : text;
      // Nothing to copy (the answer for what is typed now is empty or a refusal): leave the
      // clipboard as it was rather than empty it or fill it with an older answer.
      if (value === '') return;
      await navigator.clipboard.writeText(value);
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
