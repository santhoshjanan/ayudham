<script lang="ts">
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Privacy · pokerji</title>
</svelte:head>

<header class="band">
  <div class="band-inner">
    <h1>Privacy</h1>
    <p>
      What pokerji stores, for how long, and who can see it. Each promise is followed by how it is
      kept.
    </p>
  </div>
</header>

<main>

  <h2>No accounts</h2>
  <p>
    You never sign up. You type a display name when you join a room. We keep that name, whether
    you are voting or watching, and the times you joined and were last seen in the room.
  </p>
  <p class="how"><b>How:</b> there is no sign-up, email field or login anywhere in the service.</p>

  <h2>What a room stores</h2>
  <ul>
    <li>The room's settings: its deck, its timer length and whether it has a passcode.</li>
    <li>
      For each person who joined: their display name, whether they vote or watch, whether they
      are a moderator, and when they joined and were last seen.
    </li>
    <li>
      For each revealed round: the story title, the time, and which card each named person
      played.
    </li>
  </ul>
  <p>
    Votes in a round that has not been revealed are never written down. They exist only in the
    server's memory until the reveal.
  </p>
  <p class="how">
    <b>How:</b> a round is saved at the moment it is revealed, and not before. Passcodes, the
    secret that keeps you signed in to a room, and the moderator link's secret are stored only in
    scrambled form that cannot be read back. The room's own link code is stored as it is, because
    it is how the room is found.
  </p>

  <h2>How long it is kept</h2>
  <p>
    A room, with everything in it, is deleted {data.retentionDays} days after it was last used.
    "Used" means someone joined, a round was revealed, or its settings were changed.
  </p>
  <p>
    A moderator can delete a single round, all history, or the whole room at any time. Deletion
    is immediate.
  </p>
  <p>
    {#if data.backupRotationDays !== null}
      Deleted data can remain in database backups for up to {data.backupRotationDays} days, until
      those backups are replaced.
    {:else}
      Deleted data can remain in database backups until those backups are replaced.
    {/if}
  </p>
  <p class="how"><b>How:</b> a job runs every hour and removes rooms past that age.</p>

  <h2>Who can see a room</h2>
  <p>
    Anyone who has the room's link, and its passcode if a moderator set one, can join and can
    read the room's history. Treat the link as you would the contents of the room.
  </p>
  <p>
    Nobody, the moderator included, can see how someone voted before the reveal. Before then
    everyone sees only who has voted.
  </p>
  <p class="how">
    <b>How:</b> room links are long random codes that cannot be guessed, and the server does not
    send any vote to any browser until the reveal.
  </p>

  <h2>Removing your name</h2>
  <p>
    On a room's history page you can remove your name from the votes you cast there. The votes
    stay and show as "Anonymous".
  </p>
  <p>
    This reaches the votes you cast since you last joined. If you were removed from a room, or
    signed out because a passcode was set, you come back as a new participant and cannot reach
    your earlier votes; a moderator can delete those rounds for you.
  </p>

  <h2>Cookies and your browser</h2>
  <p>
    We set one cookie for each room you join. It keeps you in that room and does nothing else.
    It cannot be read by scripts and is sent only to this site.
  </p>
  <p>
    Your browser also remembers whether you chose the light or the dark theme, whether you turned
    sound on, and how loud. Those choices stay on your device and are never sent to us. Sound is
    off until you turn it on, and no music is downloaded before that.
  </p>
  <p class="how"><b>How:</b> there are no advertising, analytics or third-party cookies on this site.</p>

  <h2>What we do not collect</h2>
  <ul>
    <li>
      We do not store your IP address. A scrambled form of it, which cannot be turned back into
      the address, is kept for up to an hour to stop abuse such as creating thousands of rooms,
      and is then forgotten.
    </li>
    <li>We do not use analytics, trackers, advertising or fingerprinting.</li>
    <li>
      We do not load anything from other companies' servers: no fonts, scripts, images or
      embeds.
    </li>
    <li>The application does not write room links, names, story titles or votes to its logs.</li>
  </ul>
  <p class="how">
    <b>How:</b> the site instructs your browser to refuse anything not served by this site, so
    even a mistake on our side could not load a tracker.
  </p>
</main>
