<script lang="ts">
  import { page } from '$app/state';
</script>

<svelte:head>
  <title>{page.status} · pokerji</title>
</svelte:head>

<header class="band">
  <div class="band-inner">
    <h1>
      {page.status === 404
        ? 'There is nothing here'
        : page.status === 403
          ? 'This page is not for you'
          : 'That did not work'}
    </h1>
    {#if page.status === 404}
      <p>
        This page does not exist. If you followed a room link, the room may have been deleted, or
        part of the link may be missing.
      </p>
    {:else if page.status === 403}
      <p>{page.error?.message ?? 'You are not allowed to open this page.'}</p>
    {:else}
      <p>Something went wrong on our side. Please try again in a moment.</p>
    {/if}
  </div>
</header>

<main>
  <p><a class="button" href="/poker">Start a room</a></p>
</main>
