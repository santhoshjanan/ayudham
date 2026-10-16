<script lang="ts">
  import { symbology } from '@pokerji/code-maker';
  import { isQrKind, OTHER_GROUPS, QR_KINDS, type KindId } from './kinds.ts';

  let { kind = $bindable() }: { kind: KindId } = $props();

  /** A plain click opens the kind here; a click meant for a new tab or window leaves this one alone. */
  const choose = (event: MouseEvent, id: KindId) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    kind = id;
  };
  // The select names a place too, so it changes the fragment as a link would.
  const pick = (event: Event) => {
    const id = (event.currentTarget as HTMLSelectElement).value;
    if (id) location.hash = id;
  };
</script>

<div class="picker">
  <nav aria-label="QR code kinds">
    <h2>QR code</h2>
    <ul>
      {#each QR_KINDS as entry (entry.id)}
        <li>
          <a
            href="#{entry.id}"
            onclick={(event) => choose(event, entry.id)}
            aria-current={entry.id === kind ? 'true' : undefined}>{entry.label}</a
          >
        </li>
      {/each}
    </ul>
  </nav>
  <p class="field other">
    <label for="c-other">Other codes</label>
    <select id="c-other" value={isQrKind(kind) ? '' : kind} onchange={pick}>
      <option value="">Choose a code</option>
      {#each OTHER_GROUPS as group (group.label)}
        <optgroup label={group.label}>
          {#each group.ids as id (id)}
            <option value={id}>{symbology(id)?.label}</option>
          {/each}
        </optgroup>
      {/each}
    </select>
  </p>
</div>

<style>
  .picker {
    display: grid;
    gap: 1.1rem;
    padding: clamp(1.5rem, 4vw, 2.5rem) clamp(1rem, 6vw, 5rem) 0;
  }
  h2 {
    margin: 0 0 0.6rem;
    font-size: 1.25rem;
  }
  ul {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  /* A link drawn as the system's compact button, as the text tools' row is. */
  a {
    display: inline-flex;
    align-items: center;
    min-height: 2.25rem;
    padding: 0.2rem 0.7rem;
    font-size: 0.95rem;
    font-weight: 650;
    text-decoration: none;
    color: var(--ink);
    background: var(--surface);
    border: 1.5px solid var(--ink);
    border-radius: var(--radius);
  }
  a:hover,
  a[aria-current='true'] {
    background: var(--ink);
    color: var(--ground);
  }
  .other {
    margin: 0;
  }
  .other label {
    display: block;
  }
  .other select {
    max-width: 22rem;
  }
</style>
