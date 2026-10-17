<script lang="ts">
  import { identifier, LIMITS, many, TIMED_IDS, type IdKind } from '@ayudham/text-tools';
  import Frame from './Frame.svelte';
  import NumberField from '#lib/ui/NumberField.svelte';
  import { random } from './random.ts';
  import { say } from './tools.ts';

  const KIND_NAMES: Array<[IdKind, string]> = [
    ['uuid4', 'UUID version 4'],
    ['uuid7', 'UUID version 7'],
    ['ulid', 'ULID'],
    ['short', 'Short id'],
  ];

  let kind = $state<IdKind>('uuid4');
  let count = $state(1);
  let turn = $state(0);

  const made = $derived.by(() => {
    void turn;
    const now = Date.now();
    return many(count, () => identifier(kind, now, random));
  });
  const timed = $derived(TIMED_IDS.includes(kind));
</script>

<Frame
  mode={kind}
  title="Identifier"
  blurb="A random identifier for a record, a file or a request."
  rows={made.ok ? made.value.map((value) => ({ value })) : []}
  problem={made.ok ? undefined : say(made.problem, `How many must be 1 to ${LIMITS.results}.`)}
  keepLast={made.ok || made.problem !== 'no-random'}
  waiting="An identifier appears here."
  again={() => (turn += 1)}
  made={made.ok ? `${made.value.length} made.` : ''}
>
  <p class="field">
    <label for="t-kind">Kind</label>
    <select id="t-kind" bind:value={kind}>
      {#each KIND_NAMES as [value, name] (value)}
        <option {value}>{name}</option>
      {/each}
    </select>
  </p>
  <NumberField id="t-count" label="How many" min={1} max={LIMITS.results} bind:value={count} />
  {#snippet note()}
    {#if timed}
      <p class="hint">
        This kind of identifier contains the time it was made, to the millisecond. Anyone who
        sees it can read that time.
      </p>
    {/if}
  {/snippet}
</Frame>
