<script lang="ts">
  import TextField from '../TextField.svelte';
  import type { PlaceFields } from '../payload.ts';
  import Marker from './Marker.svelte';

  let { fields }: { fields: PlaceFields } = $props();
</script>

<div class="switches" role="group" aria-label="Give the place as">
  <button
    type="button"
    class="compact"
    aria-pressed={fields.by === 'coordinates'}
    onclick={() => (fields.by = 'coordinates')}>Coordinates</button
  >
  <button
    type="button"
    class="compact"
    aria-pressed={fields.by === 'address'}
    onclick={() => (fields.by = 'address')}>An address</button
  >
</div>
{#if fields.by === 'coordinates'}
  <TextField
    id="c-latitude"
    label="Latitude"
    inputmode="decimal"
    maxlength={20}
    hint="Degrees north, −90 to 90; south is negative."
    bind:value={fields.latitude}
  />
  <TextField
    id="c-longitude"
    label="Longitude"
    inputmode="decimal"
    maxlength={20}
    hint="Degrees east, −180 to 180; west is negative."
    bind:value={fields.longitude}
  />
{:else}
  <TextField id="c-address" label="Address" bind:value={fields.address} />
  <p class="field">
    <label for="c-as">Write as</label>
    <select id="c-as" bind:value={fields.as} aria-describedby="c-as-hint">
      <option value="geo">A geo: link</option>
      <option value="openstreetmap">OpenStreetMap</option>
      <option value="apple">Apple Maps</option>
      <option value="google">Google Maps</option>
    </select>
    <span class="hint" id="c-as-hint"
      >A geo: link opens the phone’s own map. This page never looks the address up, and never
      contacts any of these maps.</span
    >
  </p>
{/if}
<Marker bind:on={fields.eci} />

<style>
  button[aria-pressed='true'] {
    background: var(--ink);
    color: var(--ground);
  }
</style>
