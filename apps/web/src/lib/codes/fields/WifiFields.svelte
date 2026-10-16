<script lang="ts">
  import Toggle from '#lib/ui/Toggle.svelte';
  import TextField from '../TextField.svelte';
  import type { WifiFields } from '../payload.ts';
  import Marker from './Marker.svelte';

  let { fields }: { fields: WifiFields } = $props();
</script>

<TextField id="c-ssid" label="Network name" maxlength={64} bind:value={fields.ssid} />
<p class="field">
  <label for="c-security">Security</label>
  <select id="c-security" bind:value={fields.security}>
    <option value="wpa">WPA, WPA2 or WPA3</option>
    <option value="wep">WEP</option>
    <option value="none">None</option>
  </select>
</p>
{#if fields.security !== 'none'}
  <TextField
    id="c-password"
    label="Password"
    maxlength={128}
    hint="Kept exactly, spaces included."
    bind:value={fields.password}
  />
{/if}
<div class="switches">
  <Toggle label="Hidden network" bind:on={fields.hidden} />
</div>
<Marker bind:on={fields.eci} />
