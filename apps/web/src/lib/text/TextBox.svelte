<script lang="ts">
  import { LIMITS } from '@pokerji/text-tools';

  let {
    id,
    label,
    value = $bindable(),
    rows = 8,
  }: { id: string; label: string; value: string; rows?: number } = $props();
</script>

<!-- Nothing typed here may reach a spelling service or a browser's saved-form store. -->
<p class="field">
  <label for={id}>{label}</label>
  <textarea
    {id}
    {rows}
    maxlength={LIMITS.text}
    spellcheck="false"
    autocomplete="off"
    autocapitalize="off"
    {...{ autocorrect: 'off' }}
    bind:value
  ></textarea>
</p>
