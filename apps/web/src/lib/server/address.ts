import type { RequestEvent } from '@sveltejs/kit';

/**
 * The client's address for rate limiting. The adapter throws when its
 * configured address header is missing, as on a request that did not come
 * through the proxy; that case becomes one shared "unknown" client.
 */
export function clientAddress(event: RequestEvent): string {
  try {
    return event.getClientAddress();
  } catch {
    return 'unknown';
  }
}
