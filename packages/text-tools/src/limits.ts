/** Every bound in the package. The page's fields carry the same numbers. */
export const LIMITS = {
  passwordMin: 8,
  /** Characters in one generated password or string. */
  length: 256,
  /** Bytes in one generated hex or Base64 string. */
  bytes: 128,
  /** Results made at once. */
  results: 100,
  wordsMin: 3,
  wordsMax: 12,
  pinMin: 4,
  pinMax: 12,
  /** A number's bounds lie between minus this and this. */
  bound: 1_000_000_000_000_000,
  sidesMin: 2,
  sidesMax: 1_000,
  alphabetMin: 2,
  alphabetMax: 256,
  /** Characters of typed text in any one box. */
  text: 100_000,
  /** Draws a sampler makes before it gives up on its source. */
  redraws: 1_000,
} as const;
