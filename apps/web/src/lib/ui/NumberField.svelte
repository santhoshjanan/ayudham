<script lang="ts">
  let {
    id,
    label,
    min,
    max,
    value = $bindable(),
    hint,
  }: {
    id: string;
    label: string;
    min: number;
    max: number;
    value: number | null;
    /** Said under the field in place of its range. */
    hint?: string;
  } = $props();
</script>

<p class="field">
  <label for={id}>{label}</label>
  <input
    {id}
    type="number"
    inputmode="numeric"
    {min}
    {max}
    step="1"
    spellcheck="false"
    autocomplete="off"
    autocapitalize="off"
    autocorrect="off"
    translate="no"
    aria-describedby="{id}-hint"
    bind:value
  />
  <span class="hint" id="{id}-hint"
    >{hint ?? `${min.toLocaleString('en')} to ${max.toLocaleString('en')}`}</span
  >
</p>
