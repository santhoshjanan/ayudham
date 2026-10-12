<script lang="ts">
  import { refreshAll } from '$app/navigation';
  import {
    CLOSE_TOO_MANY_CONNECTIONS,
    REVEAL_COUNT_MS,
    type ClientMessage,
    type RoomSnapshot,
    type ServerMessage,
  } from '@pokerji/protocol';
  import { cssVar } from '#lib/ui/cssVar.ts';
  import { roomBar } from '#lib/ui/roomBar.svelte.ts';

  let { code, retentionDays }: { code: string; retentionDays: number } = $props();

  type Status = 'connecting' | 'open' | 'reconnecting' | 'removed' | 'full' | 'replaced';
  type Person = RoomSnapshot['participants'][number];

  let room = $state<RoomSnapshot | null>(null);
  let status = $state<Status>('connecting');
  let notice = $state('');
  let now = $state(Date.now());
  let titleDraft = $state('');
  // A removal or promotion waiting for the moderator to confirm it.
  let pending = $state<{ kind: 'remove' | 'promote'; person: Person } | null>(null);
  let dialog = $state<HTMLDialogElement>();
  // The per-person controls stay out of the row until the moderator asks for them.
  let managing = $state(false);
  // At wide widths the moderator's controls are a rail beside the row. Below
  // that they are a compact bar above the hand, with the rest behind "More".
  let wide = $state(true);
  let moreOpen = $state(false);

  $effect(() => {
    const query = matchMedia('(min-width: 64rem)');
    const follow = () => {
      wide = query.matches;
      if (wide) moreOpen = false;
    };
    follow();
    query.addEventListener('change', follow);
    return () => query.removeEventListener('change', follow);
  });

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
          const handedOver = room?.you.owner === true && !next.you.owner;
          if (!handedOver) {
            if (!room || next.round !== room.round || next.timer.endsAt !== null) notice = '';
            if (next.phase !== 'voting') notice = '';
          }
          if (room?.you.owner && !next.you.owner) {
            notice =
              'Someone used the moderator link and is now the owner. You are still a moderator.';
          }
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

  // The site bar shows this room's link, pages and who you are. Browser only.
  $effect(() => {
    roomBar.room = room
      ? { code, name: room.you.name, owner: room.you.owner, moderator: room.you.moderator }
      : null;
    return () => {
      roomBar.room = null;
    };
  });

  // The confirmation dialog follows `pending`.
  $effect(() => {
    if (!dialog) return;
    if (pending && !dialog.open) dialog.showModal();
    if (!pending && dialog.open) dialog.close();
  });

  // The count is 3, 2, 1 and never more: this page's clock ticks every 200 ms,
  // so without the cap the first instant could round up to 4.
  const COUNT_FROM = REVEAL_COUNT_MS / 1000;
  const count = $derived(
    room?.phase === 'counting' && room.revealAt !== null
      ? Math.min(COUNT_FROM, Math.max(1, Math.ceil((room.revealAt - now) / 1000)))
      : null,
  );
  const secondsLeft = $derived(
    room && room.timer.endsAt !== null
      ? Math.max(0, Math.ceil((room.timer.endsAt - now) / 1000))
      : null,
  );
  const asClock = (total: number) =>
    `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  /** The exact words tests and screen readers get for the timer. */
  const timerText = $derived.by(() => {
    if (!room || room.timer.seconds === null) return null;
    if (secondsLeft === null) return `Timer: ${room.timer.seconds} seconds, not running`;
    return `Timer: ${asClock(secondsLeft)} remaining`;
  });
  const cards = $derived(room ? [...room.deck.values, ...room.deck.specials] : []);
  const voters = $derived(room ? room.participants.filter((p) => p.role === 'voter') : []);
  const spectators = $derived(room ? room.participants.filter((p) => p.role === 'spectator') : []);
  // Cards step down in size as the row grows, so fifty people still fit.
  const rowSize = $derived(voters.length <= 8 ? 'large' : voters.length <= 18 ? 'medium' : 'small');
  const mostVotes = $derived(
    room?.result ? Math.max(1, ...room.result.distribution.map((entry) => entry.count)) : 1,
  );

  /** Everything said after a voter's name, as one string so its spacing is exact. */
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

  /** Who holds the low and the high card, for the stage: "Mo", "Mo and Ann", "Mo, Ann and 2 more". */
  const namesOf = (ids: readonly string[]): string => {
    const names = (room?.participants ?? []).filter((p) => ids.includes(p.id)).map((p) => p.name);
    if (names.length <= 2) return names.join(' and ');
    return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
  };

  const cardState = (person: Person): 'up' | 'down' | 'empty' => {
    if (room?.phase === 'revealed') return person.vote !== null ? 'up' : 'empty';
    return person.hasVoted ? 'down' : 'empty';
  };
  const flagFor = (person: Person): 'High' | 'Low' | null => {
    if (room?.phase !== 'revealed' || !room.result) return null;
    if (room.result.highIds.includes(person.id)) return 'High';
    if (room.result.lowIds.includes(person.id)) return 'Low';
    return null;
  };

  /** A moderator may act on anyone who is not themselves and not a moderator. */
  const canManage = (person: Person): boolean =>
    room !== null && room.you.moderator && person.id !== room.you.id && !person.moderator;

  const anyoneToManage = $derived(room ? room.participants.some((p) => canManage(p)) : false);

  const setTitle = (event: SubmitEvent) => {
    event.preventDefault();
    send({ type: 'setTitle', title: titleDraft });
  };

  const confirmPending = () => {
    if (!pending) return;
    send(
      pending.kind === 'remove'
        ? { type: 'removeParticipant', participantId: pending.person.id }
        : { type: 'promote', participantId: pending.person.id },
    );
    pending = null;
  };
</script>

{#snippet badge(person: Person | RoomSnapshot['you'])}
  {#if person.owner}
    <span class="badge owner">Owner</span>
  {:else if person.moderator}
    <span class="badge">Moderator</span>
  {/if}
{/snippet}

{#snippet face(card: string)}
  {#if card === '☕'}
    <!-- The break card: a drawn cup, not an emoji, so it matches the numerals. -->
    <svg class="cup" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Zm12 1.5h1.5a2.5 2.5 0 0 1 0 5H16M7 3.5v2.5M10 3.5v2.5M13 3.5v2.5"
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  {:else}
    {card}
  {/if}
{/snippet}

{#snippet reveal()}
  <button
    type="button"
    class="reveal"
    class:primary={room?.phase !== 'revealed'}
    disabled={!live || !room || room.phase !== 'voting'}
    onclick={() => send({ type: 'reveal' })}>Reveal</button
  >
{/snippet}

{#snippet newRound()}
  <button
    type="button"
    class:primary={room?.phase === 'revealed'}
    disabled={!live || !room || room.phase === 'counting'}
    onclick={() => send({ type: 'newRound', keepTitle: false })}>New round</button
  >
{/snippet}

{#snippet otherControls(withNewRound: boolean)}
  {#if room}
    <div class="pair">
      <button
        type="button"
        disabled={!live || room.phase === 'counting'}
        onclick={() => send({ type: 'newRound', keepTitle: true })}>Vote again</button
      >
      {#if withNewRound}{@render newRound()}{/if}
    </div>
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
    {#if anyoneToManage}
      <button type="button" aria-pressed={managing} onclick={() => (managing = !managing)}
        >{managing ? 'Done managing' : 'Manage people'}</button
      >
    {/if}
    <form class="titleform" onsubmit={setTitle}>
      <label for="title">Story title</label>
      <input id="title" bind:value={titleDraft} maxlength="200" autocomplete="off" />
      <button disabled={!live || room.phase !== 'voting'}>Set title</button>
    </form>
  {/if}
{/snippet}

{#snippet manage(person: Person)}
  {#if room && managing && canManage(person)}
    <span class="manage">
      <button
        type="button"
        disabled={!live}
        aria-label="Make {person.name} a moderator"
        onclick={() => (pending = { kind: 'promote', person })}>Make moderator</button
      >
      <button
        type="button"
        class="danger"
        disabled={!live || room.phase === 'counting'}
        aria-label="Remove {person.name}"
        onclick={() => (pending = { kind: 'remove', person })}>Remove</button
      >
    </span>
  {/if}
{/snippet}

{#if status === 'removed'}
  <div class="aside-page">
    <h1>You are no longer in this room</h1>
    <p>
      A moderator removed you, or set a passcode. <a href="/poker/r/{code}" data-sveltekit-reload
        >Join again</a
      > with the room link, and the passcode if there is one.
    </p>
  </div>
{:else if status === 'full'}
  <div class="aside-page">
    <h1>This room is full</h1>
    <p>A room holds 50 people. Try again when someone has left.</p>
  </div>
{:else if status === 'replaced'}
  <div class="aside-page">
    <h1>This room is open in too many tabs</h1>
    <p>You have it open in more than four places. Close one, then reload this page.</p>
  </div>
{:else if !room}
  <div class="aside-page">
    <p data-testid="status" role="status">Connecting…</p>
  </div>
{:else}
  <div
    class="room"
    class:voter={room.you.role === 'voter'}
    class:barred={room.you.moderator && !wide}
  >
    {#if status === 'reconnecting'}
      <p class="banner" data-testid="status" role="status">Connection lost. Reconnecting…</p>
    {/if}

    <header class="stage">
      <div class="stage-inner">
        {#if timerText !== null}
          <p data-testid="timer" class="sr-only">{timerText}</p>
          <p class="clock" class:running={secondsLeft !== null} aria-hidden="true">
            {asClock(secondsLeft ?? room.timer.seconds ?? 0)}
          </p>
        {/if}

        <h1 class="title" class:unset={!room.title} class:long={room.title.length > 70}>
          {room.title || 'No story yet'}
        </h1>

        {#if notice}
          <p class="notice" role="status">{notice}</p>
        {/if}

        <!-- Always present, so the stage is the same height before and after the reveal
             and nothing below it moves when the cards turn. -->
        <div class="result-slot">
          {#if room.phase === 'revealed' && room.result}
            <section class="result" data-testid="result" aria-live="polite">
              <h2 class="sr-only">Result</h2>
              {#if room.result.low === null}
                <p class="verdict">No estimates were given.</p>
              {:else if room.result.unanimous}
                <p class="verdict">Unanimous: {room.result.low}</p>
              {:else}
                <p class="verdict">Low {room.result.low}, High {room.result.high}</p>
              {/if}
              {#if room.result.average !== null}
                <p class="average">Average {Math.round(room.result.average * 10) / 10}</p>
              {/if}
              {#if room.result.lowIds.length > 0}
                <!-- Who speaks first. -->
                <p class="who">
                  <span>Low: <b>{namesOf(room.result.lowIds)}</b></span>
                  <span>High: <b>{namesOf(room.result.highIds)}</b></span>
                </p>
              {/if}
              {#if room.saveStatus === 'failed'}
                <p class="unsaved" role="status">This round is not saved yet. Retrying.</p>
              {/if}
            </section>
          {/if}
        </div>
      </div>

      {#if count !== null}
        <!-- Re-created each second, so the beat plays again for every number. -->
        {#key count}
          <p class="count" data-testid="countdown" aria-live="assertive">{count}</p>
        {/key}
      {/if}
    </header>

    <div class="floor">
      <div class="panel">
        <section aria-labelledby="voters-heading">
          <h2 id="voters-heading" class="sr-only">Voters</h2>
          {#if voters.length === 0}
            <p class="empty">Nobody is voting yet.</p>
          {/if}
          <ul class="row" data-testid="participants" data-size={rowSize}>
            {#each voters as person (person.id)}
              {@const state = cardState(person)}
              {@const flag = flagFor(person)}
              <li class="judge" class:away={!person.present}>
                <!-- What a screen reader hears: the name, then the state, as words. -->
                <span class="sr-only"><b>{person.name}</b>{labelFor(person)}</span>
                <span class="visual" aria-hidden="true">
                  <span class="flag" class:on={flag !== null}>{flag ?? ''}</span>
                  <span class="card" data-state={state}>
                    <span class="card-inner">
                      <span class="back"></span>
                      <span class="face"
                        >{#if room.phase === 'revealed' && person.vote !== null}{@render face(
                            person.vote,
                          )}{/if}</span
                      >
                    </span>
                  </span>
                  <span class="name">{person.name}</span>
                  {@render badge(person)}
                  {#if !person.present}<span class="badge quiet">Away</span>{/if}
                </span>
                {@render manage(person)}
              </li>
            {/each}
          </ul>
        </section>

        {#if room.phase === 'revealed' && room.result && room.result.distribution.length > 0}
          <section class="tally" aria-labelledby="tally-heading">
            <h2 id="tally-heading">Votes by card</h2>
            <ul>
              {#each room.result.distribution as entry (entry.card)}
                <li>
                  <span class="tally-card">{@render face(entry.card)}</span>
                  <span class="tally-track"
                    ><span
                      class="tally-bar"
                      use:cssVar={{ '--share': `${(entry.count / mostVotes) * 100}%` }}
                    ></span></span
                  >
                  <span class="tally-count">× {entry.count}</span>
                </li>
              {/each}
            </ul>
          </section>
        {/if}

        {#if spectators.length > 0}
          <section class="watching">
            <h2>Watching</h2>
            <ul>
              {#each spectators as person (person.id)}
                <li>
                  <b>{person.name}</b><span class="sr-only"
                    >{person.owner ? ' · owner' : person.moderator ? ' · moderator' : ''}</span
                  >
                  <span aria-hidden="true">{@render badge(person)}</span>
                  {@render manage(person)}
                </li>
              {/each}
            </ul>
          </section>
        {/if}

        {#if room.you.role === 'voter'}
          <p class="spectating">
            You are voting.
            <button
              type="button"
              class="switch"
              disabled={!live || room.phase === 'counting'}
              onclick={() => send({ type: 'setRole', role: 'spectator' })}>Watch instead</button
            >
          </p>
        {/if}
        {#if room.you.role === 'spectator'}
          <p class="spectating">You are watching.</p>
          <p>
            <button
              type="button"
              disabled={!live || room.phase === 'counting'}
              onclick={() => send({ type: 'setRole', role: 'voter' })}>Vote instead</button
            >
          </p>
        {/if}

        <p class="recording">
          Votes are recorded under your name and kept for {retentionDays} days after the room was last
          used.
        </p>
      </div>

      {#if room.you.moderator && wide}
        <aside class="rail" aria-labelledby="moderator-heading">
          <h2 id="moderator-heading">Moderator</h2>
          <!-- The large slot always holds the next thing to do. -->
          {#if room.phase === 'revealed'}
            {@render newRound()}
          {:else}
            {@render reveal()}
          {/if}
          {@render otherControls(room.phase !== 'revealed')}
        </aside>
      {/if}
    </div>

    {#if room.you.role === 'voter' || (room.you.moderator && !wide)}
      <div class="dock">
        {#if room.you.moderator && !wide}
          <section class="modbar" aria-labelledby="moderator-bar-heading">
            <h2 id="moderator-bar-heading" class="sr-only">Moderator</h2>
            {#if moreOpen}
              <!-- After a reveal, New round is the bar's main button, so it is not repeated here. -->
              <div class="sheet">{@render otherControls(room.phase !== 'revealed')}</div>
            {/if}
            <div class="modbar-row">
              {#if room.phase === 'revealed'}
                {@render newRound()}
              {:else}
                {@render reveal()}
              {/if}
              <button
                type="button"
                aria-expanded={moreOpen}
                onclick={() => (moreOpen = !moreOpen)}>{moreOpen ? 'Close' : 'More'}</button
              >
            </div>
          </section>
        {/if}
        {#if room.you.role === 'voter'}
          <section class="hand" aria-labelledby="hand-heading">
            <h2 id="hand-heading" class="sr-only">Your hand</h2>
            <div class="hand-cards">
              {#each cards as card (card)}
                <button
                  type="button"
                  class="hand-card"
                  aria-label="Vote {card}"
                  aria-pressed={room.you.vote === card}
                  disabled={!live || room.phase !== 'voting'}
                  onclick={() => send({ type: 'vote', card })}>{@render face(card)}</button
                >
              {/each}
            </div>
          </section>
        {/if}
      </div>
    {/if}
  </div>

  <dialog bind:this={dialog} onclose={() => (pending = null)} aria-labelledby="confirm-heading">
    {#if pending}
      {#if pending.kind === 'remove'}
        <h2 id="confirm-heading">Remove {pending.person.name} from the room?</h2>
        <p>
          They are signed out now. Anyone with the room link can join again, unless the room has a
          passcode.
        </p>
        <p><a href="/poker/r/{code}/settings">Set a passcode in settings</a></p>
      {:else}
        <h2 id="confirm-heading">Make {pending.person.name} a moderator?</h2>
        <p>
          They will be able to run rounds, change settings and the passcode, and remove people.
          Only the owner can take these rights away again, from settings.
        </p>
      {/if}
      <div class="dialog-actions">
        <button type="button" onclick={() => (pending = null)}>Cancel</button>
        <button
          type="button"
          class={pending.kind === 'remove' ? 'danger' : 'primary'}
          onclick={confirmPending}
          >{pending.kind === 'remove' ? 'Yes, remove' : 'Yes, make moderator'}</button
        >
      </div>
    {/if}
  </dialog>
{/if}

<style>
  .aside-page {
    width: min(100% - 2.5rem, 40rem);
    margin-inline: auto;
    padding-block: 3rem;
  }
  .aside-page h1 {
    margin-bottom: 1rem;
  }

  .room {
    display: flex;
    flex-direction: column;
    min-height: calc(100dvh - 3.5rem);
  }
  /* Room for the dock, which is fixed to the bottom edge. */
  .room {
    padding-bottom: calc(var(--pad-hand, 0rem) + var(--pad-bar, 0rem));
  }
  .room.voter {
    --pad-hand: 8.5rem;
  }
  .room.barred {
    --pad-bar: 5rem;
  }

  .banner {
    margin: 0;
    border-radius: 0;
    border-width: 0 0 1px;
    text-align: center;
    background: var(--action);
    color: var(--action-ink);
    font-weight: 650;
  }

  /* ---- The stage: one field of pool aqua, full-bleed ---- */
  .stage {
    position: relative;
    isolation: isolate;
    background-color: var(--stage);
    /* Pool tiles, a shade lighter than the water. */
    background-image:
      linear-gradient(rgb(255 255 255 / 0.07) 1px, transparent 1px),
      linear-gradient(90deg, rgb(255 255 255 / 0.07) 1px, transparent 1px);
    background-size: var(--tile) var(--tile);
    color: var(--stage-ink);
    min-height: clamp(15rem, 40dvh, 26rem);
    display: grid;
    align-items: end;
    overflow: hidden;
  }
  .stage-inner {
    padding: clamp(1.5rem, 4vw, 3rem) clamp(1rem, 6vw, 5rem);
    display: grid;
    gap: 0.9rem;
  }
  .title {
    font-size: clamp(2.5rem, 1.25rem + 5.2vw, 5.5rem);
    font-weight: 900;
    line-height: 0.98;
    max-width: 20ch;
    overflow-wrap: anywhere;
  }
  .title.long {
    font-size: clamp(1.6rem, 1.1rem + 1.9vw, 2.6rem);
    line-height: 1.08;
    max-width: 48ch;
    font-weight: 800;
  }
  .title.unset {
    color: var(--stage-ink-soft);
    font-weight: 600;
  }
  .clock {
    position: absolute;
    top: clamp(0.75rem, 2.5vw, 1.5rem);
    right: clamp(1rem, 6vw, 5rem);
    margin: 0;
    font-family: var(--font-display);
    font-weight: 800;
    font-size: clamp(1.75rem, 1.2rem + 2vw, 3rem);
    line-height: 1;
    color: var(--stage-ink-soft);
  }
  .clock.running {
    color: var(--stage-ink);
  }
  .notice {
    justify-self: start;
    margin: 0;
    background: var(--action);
    border-color: var(--action);
    color: var(--action-ink);
    font-weight: 650;
  }
  /* Reserved at every width, so nothing below the stage moves when the cards turn. */
  .result-slot {
    min-height: 4.25rem;
  }
  @media (min-width: 40rem) {
    .result-slot {
      min-height: 5.25rem;
    }
  }
  .who {
    flex-basis: 100%;
    display: flex;
    flex-wrap: wrap;
    gap: 0.1rem 1.5rem;
    font-size: 1.1rem;
    color: var(--stage-ink-soft);
  }
  .who b {
    color: var(--stage-ink);
  }
  .result {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem 1.5rem;
  }
  .result p {
    margin: 0;
  }
  .verdict {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: clamp(1.75rem, 1.2rem + 2.2vw, 3rem);
    line-height: 1;
  }
  .average {
    font-size: 1.15rem;
    color: var(--stage-ink-soft);
  }
  .unsaved {
    flex-basis: 100%;
    justify-self: start;
    background: transparent;
    border-color: var(--stage-ink-soft);
    color: var(--stage-ink);
  }

  /* The count-in takes the whole stage: one number, one beat a second, hard cuts. */
  .count {
    position: absolute;
    inset: 0;
    z-index: 2;
    margin: 0;
    display: grid;
    place-items: center;
    background: var(--stage-deep);
    font-family: var(--font-display);
    font-weight: 900;
    font-size: clamp(9rem, 34dvh, 20rem);
    line-height: 1;
    animation: beat 1s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .count::after {
    content: '';
    position: absolute;
    left: 0;
    bottom: 0;
    height: 0.5rem;
    width: 100%;
    background: var(--action);
    transform-origin: left;
    animation: sweep 1s linear both;
  }
  @keyframes beat {
    from {
      transform: scale(1.22);
    }
    to {
      transform: scale(1);
    }
  }
  @keyframes sweep {
    from {
      transform: scaleX(0);
    }
    to {
      transform: scaleX(1);
    }
  }

  /* ---- The floor: the row, and the moderator's rail on one edge ---- */
  .floor {
    flex: 1;
    display: grid;
    gap: 2rem;
    padding: clamp(1.5rem, 4vw, 3rem) clamp(1rem, 6vw, 5rem);
    align-items: start;
  }
  @media (min-width: 64rem) {
    .floor:has(.rail) {
      grid-template-columns: minmax(0, 1fr) 18.5rem;
    }
  }
  .panel {
    min-width: 0;
  }
  .panel h2 {
    font-size: 1.25rem;
    margin-top: 2.5rem;
    margin-bottom: 0.75rem;
  }
  .empty {
    color: var(--ink-soft);
  }

  .row {
    --card-w: 5.5rem;
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 1.5rem 1.25rem;
  }
  .row[data-size='medium'] {
    --card-w: 4.25rem;
    gap: 1.25rem 1rem;
  }
  .row[data-size='small'] {
    --card-w: 3.25rem;
    gap: 1rem 0.75rem;
  }
  .judge {
    width: calc(var(--card-w) + 1.25rem);
    display: grid;
    justify-items: center;
    align-content: start;
    gap: 0.35rem;
  }
  .judge.away .card,
  .judge.away .name {
    opacity: 0.5;
  }
  .visual {
    display: grid;
    justify-items: center;
    align-content: start;
    gap: 0.3rem;
    width: 100%;
  }
  .cup {
    width: 0.9em;
    height: 0.9em;
  }

  /* Red is reserved for this: who is highest and lowest. Always with the word. */
  .flag {
    height: 1.35rem;
    padding: 0 0.5rem;
    border-radius: 3px;
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 0.95rem;
    line-height: 1.35rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    visibility: hidden;
  }
  .flag.on {
    visibility: visible;
    background: var(--flag);
    color: var(--flag-ink);
  }

  /* A scorecard. Face down while voting; every card turns in the same instant. */
  .card {
    width: var(--card-w);
    aspect-ratio: 5 / 7;
    perspective: 40rem;
  }
  .card-inner {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    transform-style: preserve-3d;
    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .card[data-state='up'] .card-inner {
    transform: rotateY(180deg);
  }
  .back,
  .face {
    position: absolute;
    inset: 0;
    border-radius: var(--radius);
    backface-visibility: hidden;
  }
  .back {
    background-color: var(--card-back);
    background-image:
      linear-gradient(rgb(255 255 255 / 0.12) 1px, transparent 1px),
      linear-gradient(90deg, rgb(255 255 255 / 0.12) 1px, transparent 1px);
    background-size: 0.6rem 0.6rem;
    border: 3px solid var(--card);
    box-shadow: var(--shadow);
  }
  .face {
    transform: rotateY(180deg);
    display: grid;
    place-items: center;
    background: var(--card);
    color: var(--card-ink);
    border: 1.5px solid var(--card-edge);
    box-shadow: var(--shadow);
    font-family: var(--font-display);
    font-weight: 900;
    font-size: calc(var(--card-w) * 0.52);
    line-height: 1;
  }
  /* Nobody has put a card here yet: an outline where it will go. */
  .card[data-state='empty'] .back {
    background: transparent;
    border: 2px dashed var(--line);
    box-shadow: none;
  }

  .name {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.95rem;
    font-weight: 650;
  }
  .row[data-size='small'] .name {
    font-size: 0.8rem;
  }

  .manage {
    display: grid;
    gap: 0.25rem;
    justify-items: center;
  }
  .manage button {
    min-height: 1.9rem;
    padding: 0.1rem 0.5rem;
    border-width: 1px;
    font-size: 0.78rem;
    white-space: nowrap;
  }

  /* ---- Tally ---- */
  .tally ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.4rem;
    max-width: 30rem;
  }
  .tally li {
    display: grid;
    grid-template-columns: 3rem 1fr 3rem;
    align-items: center;
    gap: 0.75rem;
  }
  .tally-card {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 1.4rem;
    line-height: 1;
    text-align: right;
  }
  .tally-track {
    display: block;
    height: 0.9rem;
    background: var(--line);
    border-radius: 2px;
  }
  .tally-bar {
    display: block;
    height: 100%;
    width: var(--share, 0%);
    background: var(--stage);
    border-radius: 2px;
  }
  .tally-count {
    color: var(--ink-soft);
  }

  .watching ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.5rem;
  }
  .watching li {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }
  .watching .manage {
    grid-auto-flow: column;
  }
  .spectating {
    margin-top: 2rem;
    font-weight: 650;
  }
  .switch {
    margin-left: 0.5rem;
    min-height: 2.25rem;
    padding: 0.2rem 0.75rem;
    border-width: 1px;
    font-size: 0.9rem;
  }
  .recording {
    margin-top: 2.5rem;
    max-width: 60ch;
    font-size: 0.9rem;
    color: var(--ink-soft);
  }

  /* ---- Moderator rail: every control on one edge ---- */
  .rail {
    display: grid;
    gap: 0.6rem;
    padding: 1.1rem;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }
  .rail h2 {
    margin: 0 0 0.2rem;
    font-size: 1.25rem;
  }
  /* The rail's first control is the next thing to do: Reveal, then New round. */
  .reveal,
  .rail > button:first-of-type {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 1.5rem;
    letter-spacing: 0.03em;
    min-height: 3.5rem;
  }
  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.6rem;
  }
  .pair button {
    padding-inline: 0.4rem;
    white-space: nowrap;
  }
  /* With "New round" in the bar, "Vote again" has the row to itself. */
  .pair:has(> :only-child) {
    grid-template-columns: 1fr;
  }
  .rail button[aria-pressed='true'] {
    background: var(--ink);
    color: var(--ground);
  }
  .titleform {
    display: grid;
    gap: 0.4rem;
    margin-top: 0.6rem;
    padding-top: 0.9rem;
    border-top: 1px solid var(--line);
  }
  .titleform label {
    margin: 0;
  }
  /* Reveal is the one primary action here; setting the title is not. */
  .titleform button {
    background: var(--surface);
    color: var(--ink);
    border-color: var(--ink);
  }
  .titleform button:hover:not(:disabled) {
    background: var(--ink);
    color: var(--ground);
  }

  /* ---- The dock: fixed to the bottom edge, under the thumb ---- */
  .dock {
    position: fixed;
    z-index: 5;
    inset: auto 0 0 0;
    background: var(--surface);
    border-top: 1px solid var(--line);
    box-shadow: 0 -6px 18px rgb(17 20 23 / 0.1);
    padding-bottom: env(safe-area-inset-bottom);
  }
  .hand {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem clamp(1rem, 6vw, 5rem);
  }

  /* The moderator's bar on narrow screens: Reveal always in reach, the rest behind "More". */
  .modbar {
    padding: 0.6rem clamp(1rem, 6vw, 5rem) 0.2rem;
    border-bottom: 1px solid var(--line);
  }
  .modbar-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.6rem;
  }
  .modbar-row > :first-child {
    min-height: 3rem;
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 1.35rem;
    letter-spacing: 0.03em;
  }
  .sheet {
    display: grid;
    gap: 0.6rem;
    padding-bottom: 0.75rem;
    max-height: 50dvh;
    overflow-y: auto;
  }
  .sheet .titleform {
    margin-top: 0.2rem;
  }
  .hand-cards {
    display: flex;
    gap: 0.5rem;
    overflow-x: auto;
    padding: 0.6rem 0.4rem 0.35rem;
    scroll-padding-inline: 0.4rem;
    scrollbar-width: thin;
    flex: 1;
  }
  .hand-card {
    flex: none;
    width: 3.4rem;
    aspect-ratio: 5 / 7;
    padding: 0;
    background: var(--card);
    color: var(--card-ink);
    border: 1.5px solid var(--card-edge);
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 1.7rem;
    line-height: 1;
    box-shadow: var(--shadow);
    transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  }
  /* A card you cannot play now stays a card: white, with its numeral receded. */
  .hand-card:disabled {
    background: var(--card);
    color: #94a1a6;
    border: 1.5px solid var(--card-edge);
    box-shadow: none;
  }
  .hand-card:hover:not(:disabled) {
    background: var(--card);
    color: var(--card-ink);
    transform: translateY(-0.3rem);
  }
  /* The card you played: lifted, and marked with the action colour. */
  .hand-card[aria-pressed='true'] {
    transform: translateY(-0.5rem);
    border-color: var(--action-ink);
    box-shadow:
      0 0 0 3px var(--action),
      var(--shadow);
  }


  @media (max-width: 40rem) {
    .stage {
      min-height: clamp(10rem, 26dvh, 15rem);
    }
    /* The stage is shorter here, so the numeral is sized to fit it whole, beat included. */
    .count {
      font-size: clamp(5rem, 16dvh, 8.5rem);
    }
    .row {
      --card-w: 4.25rem;
      gap: 1.1rem 0.6rem;
    }
    .row[data-size='small'] {
      --card-w: 3rem;
    }
    .hand {
      gap: 0.6rem;
      padding-block: 0.5rem;
    }
  }

  /* ---- Confirmation ---- */
  dialog {
    width: min(100% - 2rem, 28rem);
    padding: 1.5rem;
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }
  dialog::backdrop {
    background: rgb(17 20 23 / 0.55);
  }
  dialog h2 {
    margin: 0 0 0.75rem;
    font-size: 1.5rem;
  }
  .dialog-actions {
    display: flex;
    justify-content: end;
    gap: 0.6rem;
    margin-top: 1.25rem;
  }
</style>
