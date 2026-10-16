<script lang="ts">
  import TextBox from '#lib/ui/TextBox.svelte';
  import TextField from '../TextField.svelte';
  import type { CardFields } from '../payload.ts';
  import Marker from './Marker.svelte';

  let { fields }: { fields: CardFields } = $props();
</script>

<p class="field">
  <label for="c-format">Format</label>
  <select id="c-format" bind:value={fields.format} aria-describedby="c-format-hint">
    <option value="vcard">vCard</option>
    <option value="mecard">MECARD</option>
  </select>
  <span class="hint" id="c-format-hint"
    >vCard is read everywhere. MECARD is shorter, so the code is smaller, but it keeps fewer
    fields.</span
  >
</p>
<TextField id="c-given" label="Given name" bind:value={fields.given} />
<TextField id="c-family" label="Family name" bind:value={fields.family} />
<TextField id="c-org" label="Organisation" bind:value={fields.organisation} />
{#if fields.format === 'vcard'}
  <TextField id="c-title" label="Job title" bind:value={fields.title} />
{/if}
<TextField id="c-mobile" label="Mobile phone" inputmode="tel" bind:value={fields.mobile} />
<TextField id="c-work" label="Work phone" inputmode="tel" bind:value={fields.work} />
<TextField id="c-email" label="Email" inputmode="email" bind:value={fields.email} />
<TextField id="c-website" label="Website" inputmode="url" bind:value={fields.website} />
<TextField id="c-street" label="Street" bind:value={fields.street} />
<TextField id="c-city" label="City" bind:value={fields.city} />
<TextField id="c-region" label="Region" bind:value={fields.region} />
<TextField id="c-postcode" label="Postcode" bind:value={fields.postcode} />
<TextField id="c-country" label="Country" bind:value={fields.country} />
<TextBox id="c-note" label="Note" rows={3} max={1000} bind:value={fields.note} />
<Marker bind:on={fields.eci} />
