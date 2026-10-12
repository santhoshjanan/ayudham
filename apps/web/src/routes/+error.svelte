<script lang="ts">
  import { page } from '$app/state';
</script>

<svelte:head>
  <title>{page.status} · pokerji</title>
</svelte:head>

<header class="band">
  <div class="band-inner">
    <h1>{page.status === 404 ? 'There is nothing here' : 'That did not work'}</h1>
    <p>{page.error?.message ?? 'Something went wrong. Please try again.'}</p>
  </div>
</header>

<main>
  <p><a class="button" href="/poker">Start a room</a></p>
</main>
