<script lang="ts">
  import TextBox from '#lib/ui/TextBox.svelte';
  import Toggle from '#lib/ui/Toggle.svelte';
  import TextField from '../TextField.svelte';
  import type { EventFields } from '../payload.ts';
  import Marker from './Marker.svelte';

  let { fields }: { fields: EventFields } = $props();

  // A date field takes YYYY-MM-DD and a date-and-time field YYYY-MM-DDTHH:MM: keep what was typed
  // when the event turns all day, or back.
  const allDay = () => {
    fields.allDay = !fields.allDay;
    const shift = (value: string) =>
      value === '' ? '' : fields.allDay ? value.slice(0, 10) : `${value.slice(0, 10)}T09:00`;
    fields.start = shift(fields.start);
    fields.end = shift(fields.end);
  };
</script>

<TextField id="c-title" label="Title" bind:value={fields.title} />
<div class="switches">
  <button type="button" class="compact" aria-pressed={fields.allDay} onclick={allDay}
    >All day</button
  >
  {#if !fields.allDay}
    <Toggle label="Convert to UTC" bind:on={fields.utc} />
  {/if}
</div>
{#if !fields.allDay}
  <p class="hint switch-hint">
    {fields.utc
      ? 'The times are written in UTC from this browser’s time zone, so the event lands at the right moment anywhere.'
      : 'The times are written without a time zone, so they are read as local time wherever the code is scanned.'}
  </p>
{/if}
<TextField
  id="c-start"
  label="Starts"
  type={fields.allDay ? 'date' : 'datetime-local'}
  bind:value={fields.start}
/>
<TextField
  id="c-end"
  label="Ends"
  type={fields.allDay ? 'date' : 'datetime-local'}
  bind:value={fields.end}
/>
<TextField id="c-place" label="Place" bind:value={fields.place} />
<TextBox id="c-description" label="Description" rows={3} max={1000} bind:value={fields.description} />
<Marker bind:on={fields.eci} />

<style>
  button[aria-pressed='true'] {
    background: var(--ink);
    color: var(--ground);
  }
  .switch-hint {
    margin: -0.6rem 0 1.1rem;
  }
</style>
