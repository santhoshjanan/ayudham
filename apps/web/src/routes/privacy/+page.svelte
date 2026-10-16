<script lang="ts">
  import Seo from '#lib/ui/Seo.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<Seo
  title="Privacy · pokerji planning poker"
  description="Exactly what pokerji stores, for how long and who can see it. No accounts, no analytics, no third parties. Unused rooms are deleted after {data.retentionDays} days."
/>

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
    <li>
      The room's settings: its deck, its timer length, its music choice and whether it has a
      passcode.
    </li>
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
    A moderator can delete a single round or all history at any time, and the room's owner can
    delete the whole room. Deletion takes effect at once. A room keeps its newest 1,000 rounds;
    older ones are deleted as new ones are saved.
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
    signed out because a passcode was set or because you had not visited, you come back as a new participant and cannot reach
    your earlier votes; a moderator can delete those rounds for you.
  </p>

  <h2>Cookies and your browser</h2>
  <p>
    We set one cookie for each room you join. It keeps you in that room and does nothing else.
    It cannot be read by scripts and is sent only to this site. If you do not open the room for
    {data.retentionDays} days you are signed out of it. The room's owner can come back with the
    moderator link. Your past votes keep your name.
  </p>
  <p>
    Your browser also remembers whether you chose the light or the dark theme, whether you turned
    sound on, and how loud. Those choices stay on your device and are never sent to us. Sound is
    off until you turn it on, and no music is downloaded before that. When it is on and a room
    plays music, your browser asks this site for the music file, as it does for any page.
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
      To keep the service running we may count totals for the whole service, such as how many
      rooms are open or how many messages were sent. These totals do not identify any room
      or any person.
    </li>
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
  <h2>The schema markup builder</h2>
  <p>
    The builder at <a href="/schema">/schema</a> runs in your browser. What you type into it is
    never sent to this site: there is no form, no upload and no account behind it.
  </p>
  <p>
    Your draft is kept in your browser’s own storage, on your device, so that a reload does not
    lose it. It stays there until you press Clear or clear your browser’s data. Anyone who uses
    the same browser profile can see it.
  </p>
  <p>
    The builder links to Google’s Rich Results Test and to the Schema.org validator. Nothing is
    sent to either unless you go there and paste your markup yourself.
  </p>
  <p class="how">
    <b>How:</b> the page makes no request that carries your text. The only thing it fetches after
    it has loaded is the list of Schema.org types, a file served by this site. The draft is one
    entry in your browser’s local storage, named <code class="inline">pj-schema-draft</code>.
  </p>
  <h2>The text tools</h2>
  <p>
    The generators and converters at <a href="/text">/text</a> run in your browser. What you
    type into them and what they make stay there: nothing is sent to this site and nothing is
    kept. There is no account, no draft and no saved setting. Close the tab and it is gone.
  </p>
  <p>
    A value you copy is on your device’s clipboard, like anything else you copy, for as long as
    your device keeps it. Clipboard history, clipboard managers and syncing between devices can
    keep it longer or copy it elsewhere; that is your device’s doing, not this site’s. The
    address of the page says which tool is open and nothing more.
  </p>
  <p>
    Passphrases are made from the EFF long word list, by the Electronic Frontier Foundation,
    under the Creative Commons Attribution 3.0 United States licence. The file is served by this
    site; nothing is fetched from anyone else.
  </p>
  <p class="how">
    <b>How:</b> the page makes no request that carries what you typed or made. After it has
    loaded it fetches two files from this site and nothing else: the word list, only when you
    open the passphrase tool, which it checks against a checksum built into the page before
    using a word; and the script that converts long text beside the page, so typing never
    waits, only when you first use a converter. Your text goes to that script inside your
    browser and comes back; it is never sent over the network. The tools are
    not drawn on the server at all, so the server never makes a password. Every random choice
    comes from your browser’s cryptographic random source.
  </p>
  <h2>Barcodes and QR codes</h2>
  <p>
    The code maker at <a href="/codes">/codes</a> makes every code in your browser. What you type
    into it, the colours and options you choose and the codes it makes stay there: none of it
    reaches this site or anyone else, and nothing is kept. There is no account, no draft and no
    saved style. Close the tab and it is gone.
  </p>
  <p>
    A logo you choose is read on your device and never leaves it. The page reads the image with
    your browser’s own image decoder, makes a smaller copy in the tab’s memory, and draws the
    code with that; the file itself is not kept. A code you copy is on your device’s clipboard,
    and a file you download is wherever your browser saves it, for as long as you keep them.
    The address of the page says which kind of code is open and nothing more.
  </p>
  <p>
    Codes are encoded by bwip-js, by Mark Warren, and files are packed by fflate, by Arjun
    Barrett, both under the MIT licence. Both are part of this site’s own files; nothing is
    fetched from anyone else.
  </p>
  <p class="how">
    <b>How:</b> the page makes no request that carries what you typed, chose or added. After it
    has loaded it fetches one file from this site, and only when you make your first code: the
    script that makes codes beside the page, so typing never waits, with bwip-js inside it.
    Your text goes to that script inside your browser and comes back as a picture; it is never
    sent over the network. The maker is not drawn on the server at all, so the server never
    makes a code. Where your browser has its own barcode reader, the page reads the code back
    with it, inside the browser. Surprise me draws its colours from your browser’s cryptographic
    random source.
  </p>
</main>

<style>
  /* A name in a sentence: the site's code style without its block layout. */
  .inline {
    display: inline;
    padding: 0.05rem 0.3rem;
  }
</style>
