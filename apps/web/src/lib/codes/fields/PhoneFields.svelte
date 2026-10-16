<script lang="ts">
  import TextField from '../TextField.svelte';
  import type { PhoneFields } from '../payload.ts';

  let { fields }: { fields: PhoneFields } = $props();
</script>

<TextField
  id="c-number"
  label="Number"
  inputmode="tel"
  maxlength={40}
  hint="With the country code, such as +44, to work from anywhere."
  bind:value={fields.number}
/>
