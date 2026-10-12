<script lang="ts">
  import type { ClientMessage, RoomSnapshot, ServerMessage } from '@pokerji/protocol';

  let { code }: { code: string } = $props();

  let room = $state<RoomSnapshot | null>(null);
  let status = $state<'connecting' | 'open' | 'reconnecting' | 'removed'>('connecting');
  let notice = $state('');
  let now = $state(Date.now());
  let titleDraft = $state('');

  let socket: WebSocket | null = null;
  // The server's clock minus this browser's, so countdowns agree on every screen.
  let clockOffset = 0;

  const send = (message: ClientMessage) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };

  $effect(() => {
    const path = `/poker/r/${code}/ws`;
    let stopped = false;
    let failures = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${scheme}://${location.host}${path}`);
      socket = ws;
      ws.onopen = () => {
        failures = 0;
        status = 'open';
      };
      ws.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as ServerMessage;
        if (message.type === 'snapshot') {
          room = message.room;
          clockOffset = message.room.serverNow - Date.now();
          notice = '';
        } else if (message.type === 'removed') {
          stopped = true;
          status = 'removed';
        } else if (message.type === 'timerExpired') {
          notice = 'Time is up.';
        }
      };
      ws.onclose = () => {
        if (stopped) return;
        failures += 1;
        // The session is no longer accepted: go back to the join form.
        if (failures > 5) {
          location.reload();
          return;
        }
        status = 'reconnecting';
        retry = setTimeout(connect, Math.min(500 * 2 ** failures, 10_000));
      };
    };

    connect();
    const clock = setInterval(() => {
      now = Date.now() + clockOffset;
    }, 200);

    return () => {
      stopped = true;
      clearTimeout(retry);
      clearInterval(clock);
      socket?.close();
    };
  });

  const count = $derived(
    room?.phase === 'counting' && room.revealAt !== null
      ? Math.max(1, Math.ceil((room.revealAt - now) / 1000))
      : null,
  );
  const cards = $derived(room ? [...room.deck.values, ...room.deck.specials] : []);
  const voters = $derived(room ? room.participants.filter((p) => p.role === 'voter') : []);
  const spectators = $derived(room ? room.participants.filter((p) => p.role === 'spectator') : []);

  const setTitle = (event: SubmitEvent) => {
    event.preventDefault();
    send({ type: 'setTitle', title: titleDraft });
    titleDraft = '';
  };
</script>

{#if status === 'removed'}
  <h1>You were removed from this room</h1>
  <p>Ask the moderator if you think this was a mistake.</p>
{:else if !room}
  <p data-testid="status" role="status">Connecting…</p>
{:else}
  {#if status === 'reconnecting'}
    <p data-testid="status" role="status">Connection lost. Reconnecting…</p>
  {/if}
  {#if notice}
    <p role="status">{notice}</p>
  {/if}

  <h1>{room.title || 'No story yet'}</h1>

  {#if count !== null}
    <p data-testid="countdown" aria-live="assertive">{count}</p>
  {/if}

  {#if room.phase === 'revealed' && room.result}
    <section data-testid="result" aria-live="polite">
      <h2>Result</h2>
      {#if room.result.low === null}
        <p>No estimates were given.</p>
      {:else if room.result.unanimous}
        <p>Unanimous: {room.result.low}</p>
      {:else}
        <p>Low {room.result.low}, High {room.result.high}</p>
      {/if}
      {#if room.result.average !== null}
        <p>Average {Math.round(room.result.average * 10) / 10}</p>
      {/if}
      <ul>
        {#each room.result.distribution as entry (entry.card)}
          <li>{entry.card} × {entry.count}</li>
        {/each}
      </ul>
      {#if room.saveStatus === 'failed'}
        <p role="status">This round is not saved yet. Retrying.</p>
      {/if}
    </section>
  {/if}

  <section>
    <h2>Voters</h2>
    <ul data-testid="participants">
      {#each voters as person (person.id)}
        <li>
          {#if room.phase === 'revealed'}
            {person.name}: {person.vote ?? 'no vote'}
            {#if room.result?.highIds.includes(person.id)}(High){/if}
            {#if room.result?.lowIds.includes(person.id)}(Low){/if}
          {:else}
            {person.name}
            {person.hasVoted ? 'voted' : 'not voted'}
          {/if}
          {#if person.moderator}· moderator{/if}
          {#if !person.present}· away{/if}
        </li>
      {/each}
    </ul>
    {#if spectators.length > 0}
      <h2>Watching</h2>
      <ul>
        {#each spectators as person (person.id)}
          <li>{person.name}{person.moderator ? ' · moderator' : ''}</li>
        {/each}
      </ul>
    {/if}
  </section>

  {#if room.you.role === 'voter'}
    <section>
      <h2>Your hand</h2>
      {#each cards as card (card)}
        <button
          type="button"
          aria-label="Vote {card}"
          aria-pressed={room.you.vote === card}
          disabled={room.phase !== 'voting'}
          onclick={() => send({ type: 'vote', card })}>{card}</button
        >
      {/each}
    </section>
  {:else}
    <p>You are watching.</p>
  {/if}

  {#if room.you.moderator}
    <section>
      <h2>Moderator</h2>
      <form onsubmit={setTitle}>
        <label for="title">Story title</label>
        <input id="title" bind:value={titleDraft} maxlength="200" />
        <button disabled={room.phase !== 'voting'}>Set title</button>
      </form>
      <button
        type="button"
        disabled={room.phase !== 'voting'}
        onclick={() => send({ type: 'reveal' })}>Reveal</button
      >
      <button
        type="button"
        disabled={room.phase === 'counting'}
        onclick={() => send({ type: 'newRound', keepTitle: false })}>New round</button
      >
    </section>
  {/if}
{/if}
