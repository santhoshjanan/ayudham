<script lang="ts">
  import { refreshAll } from '$app/navigation';
  import {
    CLOSE_TOO_MANY_CONNECTIONS,
    type ClientMessage,
    type RoomSnapshot,
    type ServerMessage,
  } from '@pokerji/protocol';

  let { code, retentionDays }: { code: string; retentionDays: number } = $props();

  type Status = 'connecting' | 'open' | 'reconnecting' | 'removed' | 'full' | 'replaced';
  type Person = RoomSnapshot['participants'][number];

  let room = $state<RoomSnapshot | null>(null);
  let status = $state<Status>('connecting');
  let notice = $state('');
  let now = $state(Date.now());
  let titleDraft = $state('');

  let socket: WebSocket | null = null;
  // The server's clock minus this browser's, so countdowns agree on every screen.
  let clockOffset = 0;

  const live = $derived(status === 'open');

  const send = (message: ClientMessage): boolean => {
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  };

  $effect(() => {
    const path = `/poker/r/${code}/ws`;
    // Set when the server has told us not to come back: retrying would be pointless or harmful.
    let finished = false;
    let failures = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const finish = (reason: Status) => {
      finished = true;
      status = reason;
    };

    const connect = () => {
      const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${scheme}://${location.host}${path}`);
      socket = ws;
      ws.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as ServerMessage;
        if (message.type === 'snapshot') {
          // Only a snapshot proves the connection works; an accepted socket can still be closed at once.
          failures = 0;
          status = 'open';
          // A new round, a running timer or a reveal makes any earlier notice stale.
          const next = message.room;
          if (!room || next.round !== room.round || next.timer.endsAt !== null) notice = '';
          if (next.phase !== 'voting') notice = '';
          // The title box empties only once the room shows what was typed.
          if (titleDraft.trim() !== '' && next.title === titleDraft.trim()) titleDraft = '';
          room = message.room;
          clockOffset = message.room.serverNow - Date.now();
        } else if (message.type === 'removed') {
          finish('removed');
        } else if (message.type === 'error' && message.code === 'room_full') {
          finish('full');
        } else if (message.type === 'timerExpired') {
          notice = 'Time is up.';
        } else if (message.type === 'error') {
          // Without this a refused action would simply do nothing.
          notice =
            message.code === 'rate_limited'
              ? 'You are sending too fast. Wait a moment and try again.'
              : 'That was not accepted. Check it and try again.';
        }
      };
      ws.onclose = (event) => {
        if (finished) return;
        if (event.code === CLOSE_TOO_MANY_CONNECTIONS) {
          finish('replaced');
          return;
        }
        failures += 1;
        status = 'reconnecting';
        // Keep trying for as long as it takes, more slowly each time. Every third
        // failure, ask the server whether this session still exists: if it does
        // not, the page data changes and the join form replaces this component.
        // If the server cannot be reached the check simply fails and we carry on.
        if (failures % 3 === 0) refreshAll().catch(() => undefined);
        retry = setTimeout(connect, Math.min(500 * 2 ** Math.min(failures, 5), 15_000));
      };
    };

    connect();
    const clock = setInterval(() => {
      now = Date.now() + clockOffset;
    }, 200);

    return () => {
      finished = true;
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
  const timerText = $derived.by(() => {
    if (!room || room.timer.seconds === null) return null;
    if (room.timer.endsAt === null) return `Timer: ${room.timer.seconds} seconds, not running`;
    const left = Math.max(0, Math.ceil((room.timer.endsAt - now) / 1000));
    const minutes = Math.floor(left / 60);
    const seconds = String(left % 60).padStart(2, '0');
    return `Timer: ${minutes}:${seconds} remaining`;
  });
  const cards = $derived(room ? [...room.deck.values, ...room.deck.specials] : []);
  const voters = $derived(room ? room.participants.filter((p) => p.role === 'voter') : []);
  const spectators = $derived(room ? room.participants.filter((p) => p.role === 'spectator') : []);

  /** Everything shown after a voter's name, as one string so its spacing is exact. */
  const labelFor = (person: Person): string => {
    if (!room) return '';
    const parts: string[] = [];
    if (room.phase === 'revealed') {
      parts.push(`: ${person.vote ?? 'no vote'}`);
      if (room.result?.highIds.includes(person.id)) parts.push(' (High)');
      if (room.result?.lowIds.includes(person.id)) parts.push(' (Low)');
    } else {
      parts.push(person.hasVoted ? ' voted' : ' not voted');
    }
    if (person.owner) parts.push(' · owner');
    else if (person.moderator) parts.push(' · moderator');
    if (!person.present) parts.push(' · away');
    return parts.join('');
  };

  /** A moderator may act on anyone who is not themselves and not a moderator. */
  const canManage = (person: Person): boolean =>
    room !== null && room.you.moderator && person.id !== room.you.id && !person.moderator;

  const setTitle = (event: SubmitEvent) => {
    event.preventDefault();
    send({ type: 'setTitle', title: titleDraft });
  };
</script>

{#snippet manage(person: Person)}
  {#if room && canManage(person)}
    <button
      type="button"
      disabled={!live}
      onclick={() => send({ type: 'promote', participantId: person.id })}
      >Make {person.name} a moderator</button
    >
    <button
      type="button"
      disabled={!live || room.phase === 'counting'}
      onclick={() => send({ type: 'removeParticipant', participantId: person.id })}
      >Remove {person.name}</button
    >
  {/if}
{/snippet}

{#if status === 'removed'}
  <h1>You are no longer in this room</h1>
  <p>
    A moderator removed you, or set a passcode. <a href="/poker/r/{code}" data-sveltekit-reload
      >Join again</a
    > with the room link, and the passcode if there is one.
  </p>
{:else if status === 'full'}
  <h1>This room is full</h1>
  <p>A room holds 50 people. Try again when someone has left.</p>
{:else if status === 'replaced'}
  <h1>This room is open in too many tabs</h1>
  <p>You have it open in more than four places. Close one, then reload this page.</p>
{:else if !room}
  <p data-testid="status" role="status">Connecting…</p>
{:else}
  <nav aria-label="Room">
    <a href="/poker/r/{code}/history">History</a>
    {#if room.you.moderator}
      <a href="/poker/r/{code}/settings">Settings</a>
    {/if}
  </nav>

  {#if status === 'reconnecting'}
    <p data-testid="status" role="status">Connection lost. Reconnecting…</p>
  {/if}
  {#if notice}
    <p role="status">{notice}</p>
  {/if}

  <h1>{room.title || 'No story yet'}</h1>

  {#if timerText !== null}
    <p data-testid="timer">{timerText}</p>
  {/if}

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
          <!-- The name has its own element, so a name can never be mistaken for a label. -->
          <b>{person.name}</b><span>{labelFor(person)}</span>
          {@render manage(person)}
        </li>
      {/each}
    </ul>
    {#if spectators.length > 0}
      <h2>Watching</h2>
      <ul>
        {#each spectators as person (person.id)}
          <li>
            <b>{person.name}</b><span>{person.owner ? ' · owner' : person.moderator ? ' · moderator' : ''}</span>
            {@render manage(person)}
          </li>
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
          disabled={!live || room.phase !== 'voting'}
          onclick={() => send({ type: 'vote', card })}>{card}</button
        >
      {/each}
      <p>
        <button
          type="button"
          disabled={!live || room.phase === 'counting'}
          onclick={() => send({ type: 'setRole', role: 'spectator' })}>Watch instead</button
        >
      </p>
    </section>
  {:else}
    <p>You are watching.</p>
    <p>
      <button
        type="button"
        disabled={!live || room.phase === 'counting'}
        onclick={() => send({ type: 'setRole', role: 'voter' })}>Vote instead</button
      >
    </p>
  {/if}

  {#if room.you.moderator}
    <section>
      <h2>Moderator</h2>
      <form onsubmit={setTitle}>
        <label for="title">Story title</label>
        <input id="title" bind:value={titleDraft} maxlength="200" />
        <button disabled={!live || room.phase !== 'voting'}>Set title</button>
      </form>
      <button
        type="button"
        disabled={!live || room.phase !== 'voting'}
        onclick={() => send({ type: 'reveal' })}>Reveal</button
      >
      <button
        type="button"
        disabled={!live || room.phase === 'counting'}
        onclick={() => send({ type: 'newRound', keepTitle: true })}>Vote again</button
      >
      <button
        type="button"
        disabled={!live || room.phase === 'counting'}
        onclick={() => send({ type: 'newRound', keepTitle: false })}>New round</button
      >
      {#if room.timer.seconds !== null}
        {#if room.timer.endsAt === null}
          <button
            type="button"
            disabled={!live || room.phase !== 'voting'}
            onclick={() => send({ type: 'startTimer' })}>Start timer</button
          >
        {:else}
          <button type="button" disabled={!live} onclick={() => send({ type: 'stopTimer' })}
            >Stop timer</button
          >
        {/if}
      {/if}
    </section>
  {/if}

  <p>
    Votes are recorded under your name and kept for {retentionDays} days after the room was last used.
  </p>
{/if}
