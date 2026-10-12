<script lang="ts">
  import type { PageProps } from './$types';
  import Room from './Room.svelte';

  let { data, form }: PageProps = $props();
</script>

<svelte:head>
  <title>Planning poker · pokerji</title>
</svelte:head>

{#if data.joined}
  <main class="bleed">
    <!-- Keyed, so moving to another room starts from a clean state. -->
    {#key data.code}
      <Room code={data.code} retentionDays={data.retentionDays} />
    {/key}
  
  </main>
{:else}
  <main>
    <h1>Join the room</h1>
    {#if form?.message}
      <p role="alert">{form.message}</p>
    {/if}
    <form method="POST" action="?/join">
      <p>
        <label for="name">Your name</label>
        <input id="name" name="name" required maxlength="30" autocomplete="nickname" />
      </p>
      <fieldset>
        <legend>Take part as</legend>
        <label><input type="radio" name="role" value="voter" checked /> Voter</label>
        <label><input type="radio" name="role" value="spectator" /> Spectator</label>
      </fieldset>
      <p>
        <label for="passcode">Passcode, if the room has one</label>
        <input id="passcode" name="passcode" type="password" maxlength="64" autocomplete="off" />
      </p>
      <p>
        Votes are recorded under the name you enter and kept for {data.retentionDays} days after the room
        was last used.
      </p>
      <button>Join</button>
    </form>
  
  </main>
{/if}
