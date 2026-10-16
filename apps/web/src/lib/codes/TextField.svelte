<script lang="ts">
  let {
    id,
    label,
    value = $bindable(),
    type = 'text',
    inputmode,
    maxlength = 500,
    hint,
  }: {
    id: string;
    label: string;
    value: string;
    type?: 'text' | 'datetime-local' | 'date';
    inputmode?: 'text' | 'url' | 'email' | 'tel' | 'decimal';
    maxlength?: number;
    hint?: string;
  } = $props();
</script>

<!-- Nothing typed here may reach a spelling service, a translator or a browser's saved-form store. -->
<p class="field">
  <label for={id}>{label}</label>
  <input
    {id}
    {type}
    {inputmode}
    {maxlength}
    spellcheck="false"
    autocomplete="off"
    autocapitalize="off"
    translate="no"
    {...{ autocorrect: 'off' }}
    aria-describedby={hint ? `${id}-hint` : undefined}
    bind:value
  />
  {#if hint}<span class="hint" id="{id}-hint">{hint}</span>{/if}
</p>
