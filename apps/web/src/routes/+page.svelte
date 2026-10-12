<script lang="ts">
  import DemoRow from '#lib/ui/DemoRow.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>pokerji</title>
</svelte:head>

<header class="band wide">
  <div class="band-inner split">
    <div>
      <h1>Small tools for teams.</h1>
      <p>No accounts. No trackers. Open one, share the link, get on with the meeting.</p>
    </div>
    <DemoRow />
  </div>
</header>

<main class="wide">
  <ul class="programme">
    <li>
      <div>
        <h2>Planning poker</h2>
        <p>
          Estimate stories together. Everyone scores in secret, every card turns in the same
          instant, and the highest and lowest explain first.
        </p>
      </div>
      <a class="button" href="/poker">Start a room</a>
    </li>
  </ul>

  <section>
    <h2>How it stays private</h2>
    <dl class="claims">
      <div>
        <dt>Nothing to sign up for</dt>
        <dd>There is no account, email field or login anywhere. You type a display name.</dd>
      </div>
      <div>
        <dt>Nothing from anyone else</dt>
        <dd>
          Your browser is told to refuse anything this site did not serve itself, so no tracker
          can load.
        </dd>
      </div>
      <div>
        <dt>Gone after {data.retentionDays} days</dt>
        <dd>
          A room and everything in it is deleted {data.retentionDays} days after it was last used,
          or at once when its owner says so.
        </dd>
      </div>
    </dl>
    <p><a href="/privacy">Read exactly what is stored</a></p>
  </section>
</main>
