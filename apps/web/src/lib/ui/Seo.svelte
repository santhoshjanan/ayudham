<script lang="ts">
  import { page } from '$app/state';

  // What a public page says about itself to search engines and link previews.
  // Only for pages that may be indexed; rooms carry a noindex header instead.
  let { title, description }: { title: string; description: string } = $props();
  const url = $derived(`${page.url.origin}${page.url.pathname}`);
  // 1200 by 630, the size link previews expect. Previews need its full address.
  const image = $derived(`${page.url.origin}/og.jpg`);
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={url} />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="ayudham.app" />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={url} />
  <meta property="og:image" content={image} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta
    property="og:image:alt"
    content="ayudham.app: planning poker without the sign-up. Five scorecards showing 3, 5, 5, 8 and 13, the lowest and highest flagged."
  />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content={image} />
</svelte:head>
