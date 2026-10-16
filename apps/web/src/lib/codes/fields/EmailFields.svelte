<script lang="ts">
  import TextBox from '#lib/ui/TextBox.svelte';
  import TextField from '../TextField.svelte';
  import type { EmailFields } from '../payload.ts';
  import Marker from './Marker.svelte';

  let { fields }: { fields: EmailFields } = $props();
</script>

<TextField id="c-to" label="To" inputmode="email" bind:value={fields.to} />
<TextField id="c-subject" label="Subject" bind:value={fields.subject} />
<TextBox id="c-body" label="Message" rows={4} max={2000} bind:value={fields.body} />
<Marker bind:on={fields.eci} />
