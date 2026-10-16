/** Every bound in the package. The page's fields carry the same numbers. */
export const LIMITS = {
  /** Characters of typed text: the most any symbology here can hold (QR, digits only). */
  text: 7089,
  logoBytes: 5_000_000,
  logoPixels: 4096,
  /** Pixels on a side of a PNG or JPG export. */
  exportPixels: 10_000,
  quietZoneMax: 10,
  printMm: { min: 10, max: 1000 },
  dpi: [300, 600],
  /** Draws a sampler makes before it gives up on its source. */
  redraws: 1000,
} as const;
