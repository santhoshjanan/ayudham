<script lang="ts">
  import { page } from '$app/state';

  // What a public page says about itself to search engines and link previews.
  // Only for pages that may be indexed; rooms carry a noindex header instead.
  let { title, description }: { title: string; description: string } = $props();
  const url = $derived(`${page.url.origin}${page.url.pathname}`);
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={url} />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="pokerji" />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={url} />
  <meta name="twitter:card" content="summary" />
</svelte:head>
