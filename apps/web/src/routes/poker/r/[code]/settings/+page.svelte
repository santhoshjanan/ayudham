<script lang="ts">
  import { BUILT_IN_DECKS } from '@pokerji/protocol';
  import { page } from '$app/state';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  const decks = Object.entries(BUILT_IN_DECKS);
  // The select starts at the saved deck and is then the user's to change.
  // svelte-ignore state_referenced_locally
  let deckId = $state(data.deckId);
</script>

<svelte:head>
  <title>Room settings · pokerji</title>
</svelte:head>

<header class="band">
  <div class="band-inner">
    <a class="back" href="/poker/r/{data.code}">Back to the room</a>
    <h1>Room settings</h1>
  </div>
</header>

<main>

  {#if form && 'notice' in form}
    <p role="status">{form.notice}</p>
  {/if}
  {#if form && 'message' in form}
    <p role="alert">{form.message}</p>
  {/if}

  {#if form && 'recoveryToken' in form && form.recoveryToken}
    <p>Save this link now. It is shown only once, and the previous link no longer works.</p>
    <p>
      <code data-testid="recovery-link"
        >{page.url.origin}/poker/r/{data.code}/recover#m={form.recoveryToken}</code
      >
    </p>
  {/if}

  <section>
    <h2>Deck and timer</h2>
    <form method="POST" action="?/settings">
      <p>
        <label for="deck">Deck</label>
        <select id="deck" name="deck" bind:value={deckId}>
          {#each decks as [id, deck] (id)}
            <option value={id}>{deck.name}: {deck.deck.values.join(', ')}</option>
          {/each}
          <option value="custom">Custom</option>
        </select>
      </p>
      <div class="custom" class:inactive={deckId !== 'custom'}>
        <p>
          <label for="values">Value cards</label>
          <input id="values" name="values" value={data.values} />
        </p>
        <p class="hint">
          Used when the deck above is set to Custom. Lowest first, separated by commas or spaces,
          up to 4 characters each.
        </p>
        <p>
          <label for="specials">Special cards</label>
          <input id="specials" name="specials" value={data.specials} />
        </p>
        <p>Cards that are not estimates, such as ? for "not sure". They are left out of results.</p>
      </div>
      <p>
        <label for="timer">Timer in seconds</label>
        <input
          id="timer"
          name="timer"
          type="number"
          min="10"
          max="600"
          value={data.timerSeconds ?? ''}
        />
      </p>
      <p>Leave the timer empty for no timer. The deck can only change between rounds.</p>
      <button>Save settings</button>
    </form>
  </section>

  <section>
    <h2>Passcode</h2>
    <p>
      {data.hasPasscode
        ? 'This room has a passcode. People need it, as well as the link, to join.'
        : 'This room has no passcode. Anyone with the link can join.'}
    </p>
    <form method="POST" action="?/passcode">
      <p>
        <label for="passcode">New passcode</label>
        <input
          id="passcode"
          name="passcode"
          type="password"
          maxlength="64"
          autocomplete="new-password"
        />
      </p>
      <p>
        8 to 64 characters. Setting or changing it signs out everyone except moderators; they
        rejoin with the new passcode.
      </p>
      <button>Set passcode</button>
    </form>
    {#if data.hasPasscode}
      <form method="POST" action="?/removePasscode">
        <button>Remove passcode</button>
      </form>
    {/if}
  </section>

  {#if data.owner}
    <div class="owner-only">
    <section>
      <h2>Moderators</h2>
      {#if data.coModerators.length === 0}
        <p>You are the only moderator. You can make someone a moderator from the room.</p>
      {:else}
        <p>
          These people can run rounds and change settings and the passcode. Only you, as the
          owner, can take those rights away.
        </p>
        <ul>
          {#each data.coModerators as person (person.id)}
            <li>
              <b>{person.name}</b>
              <form method="POST" action="?/demote">
                <input type="hidden" name="session" value={person.id} />
                <button>Remove moderator rights from {person.name}</button>
              </form>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
    <section>
      <h2>Moderator link</h2>
      <p>
        The moderator link makes whoever opens it the owner of this room, so you can take the room
          with you to another browser. Making a new one stops the old link working. Keep it private.
      </p>
      <form method="POST" action="?/recovery">
        <button>Make a new moderator link</button>
      </form>
    </section>

    <section>
      <h2>Delete this room</h2>
      <p>
        This removes the room, everyone in it and all of its history, now. It cannot be undone.
      </p>
      <form method="POST" action="?/delete">
        <p>
          <label for="confirm">Type DELETE to confirm</label>
          <input id="confirm" name="confirm" autocomplete="off" />
        </p>
        <button>Delete this room</button>
      </form>
    </section>
    </div>
  {:else}
    <section>
      <h2>Owner's settings</h2>
      <p>
        Only the owner of this room can make a new moderator link or delete the room. The owner is
        whoever created the room, or whoever last used its moderator link.
      </p>
    </section>
  {/if}
</main>
