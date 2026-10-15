import type { RandomSource } from '@pokerji/text-tools';

/**
 * The browser's cryptographic random source, and the only one this page uses. Where a browser
 * has none this throws, which the package answers with a refusal: there is no fallback.
 */
export const random: RandomSource = (count) => crypto.getRandomValues(new Uint8Array(count));
