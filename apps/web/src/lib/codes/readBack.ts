/** What the browser's own reader made of the code. */
export type ReadBack = 'matched' | 'different' | 'unavailable';

/** The browser's reader's name for each format the test decoder names. */
const FORMATS: Record<string, string> = {
  QRCode: 'qr_code',
  DataMatrix: 'data_matrix',
  Aztec: 'aztec',
  PDF417: 'pdf417',
  EAN13: 'ean_13',
  EAN8: 'ean_8',
  UPCE: 'upc_e',
  Code128: 'code_128',
  Code39: 'code_39',
  Code93: 'code_93',
  ITF: 'itf',
  Codabar: 'codabar',
};

type Detector = {
  detect(source: ImageBitmapSource): Promise<{ rawValue: string; format: string }[]>;
};
type DetectorClass = {
  new (options?: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
};

/**
 * Reads the code back with the browser's built-in reader (`BarcodeDetector`), where there is one
 * and it reads this format, and says whether it read what was meant. Nothing is sent anywhere: the
 * reader is part of the browser. Where there is no reader, it says so rather than guess.
 */
export async function readBack(
  png: Uint8Array,
  matches: (read: string) => boolean,
  decoderFormat: string | null,
): Promise<ReadBack> {
  const found = (globalThis as unknown as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
  const format = decoderFormat ? FORMATS[decoderFormat] : undefined;
  if (!found || !format) return 'unavailable';
  try {
    if (!(await found.getSupportedFormats()).includes(format)) return 'unavailable';
    const bitmap = await createImageBitmap(new Blob([png as BlobPart], { type: 'image/png' }));
    const read = await new found({ formats: [format] }).detect(bitmap);
    bitmap.close?.();
    return read.some((code) => matches(code.rawValue)) ? 'matched' : 'different';
  } catch {
    return 'unavailable';
  }
}
