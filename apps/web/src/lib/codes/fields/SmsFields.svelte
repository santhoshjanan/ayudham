<script lang="ts">
  import TextBox from '#lib/ui/TextBox.svelte';
  import TextField from '../TextField.svelte';
  import type { SmsFields } from '../payload.ts';
  import Marker from './Marker.svelte';

  let { fields }: { fields: SmsFields } = $props();
</script>

<TextField id="c-number" label="Number" inputmode="tel" maxlength={40} bind:value={fields.number} />
<TextBox id="c-message" label="Message" rows={3} max={1000} bind:value={fields.message} />
<Marker bind:on={fields.eci} />
