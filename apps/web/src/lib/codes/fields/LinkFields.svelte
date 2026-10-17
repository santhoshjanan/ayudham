<script lang="ts">
  import { suggestHttps } from '@ayudham/code-maker';
  import type { LinkFields } from '../payload.ts';
  import Marker from './Marker.svelte';

  let { fields }: { fields: LinkFields } = $props();
  const suggestion = $derived(suggestHttps(fields.address));
</script>

<p class="field">
  <label for="c-address">Address</label>
  <input
    id="c-address"
    type="text"
    inputmode="url"
    maxlength="2048"
    spellcheck="false"
    autocomplete="off"
    autocapitalize="off"
    translate="no"
    {...{ autocorrect: 'off' }}
    bind:value={fields.address}
  />
  {#if suggestion}
    <span class="hint">
      This has no <code>https://</code>, so phones may not open it as a link.
      <button type="button" class="compact" onclick={() => (fields.address = suggestion)}
        >Add https://</button
      >
    </span>
  {/if}
</p>
<Marker bind:on={fields.eci} />
