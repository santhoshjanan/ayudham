<script lang="ts">
  import { LIMITS } from '@pokerji/text-tools';

  let {
    id,
    label,
    value = $bindable(),
    rows = 8,
    max = LIMITS.text,
  }: { id: string; label: string; value: string; rows?: number; max?: number } = $props();
</script>

<!-- Nothing typed here may reach a spelling service, a translator or a browser's saved-form store.
     The field takes one character past the limit, so a longer paste is refused, never cut short. -->
<p class="field">
  <label for={id}>{label}</label>
  <textarea
    {id}
    {rows}
    maxlength={max + 1}
    translate="no"
    spellcheck="false"
    autocomplete="off"
    autocapitalize="off"
    {...{ autocorrect: 'off' }}
    bind:value
  ></textarea>
</p>
