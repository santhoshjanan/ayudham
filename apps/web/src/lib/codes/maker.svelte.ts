import {
  SYMBOLOGIES,
  type Bwip,
  type ExportSize,
  type DotShape,
  type Eye,
  type Paint,
  type Ring,
  type ThemeId,
} from '@pokerji/code-maker';
import { OTHER_GROUPS, QR_KINDS, symbologyOf, type KindId } from './kinds.ts';
import type { LogoImage } from './logo.ts';
import { blankFields, payloadFor } from './payload.ts';
import { answer, type Answer, type Job, type Look, type Made, type Output } from './work.ts';

type Reply = { id: number; answer?: Answer; failed?: true };

/** bwip-js on the page, loaded only when there is no worker to load it. */
let local: Promise<Bwip> | undefined;
const loadHere = (): Promise<Bwip> =>
  (local ??= import('bwip-js/generic').then(
    (module) => ((module as { default?: Bwip }).default ?? module) as Bwip,
  ));

async function here(job: Job): Promise<Answer> {
  try {
    return await answer(job, await loadHere());
  } catch {
    return { ok: false, problem: 'not-encodable' };
  }
}

/** The one worker for the page: not started until a code is made; null where there is none. */
let worker: Worker | null | undefined;
const waiting = new Map<number, { job: Job; resolve: (reply: Answer) => void }>();
let sent = 0;

function connect(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<Reply>) => {
      const asked = waiting.get(event.data.id);
      waiting.delete(event.data.id);
      if (!asked) return;
      // One job the worker could not finish is worked out here; the worker keeps the rest.
      if (event.data.failed || !event.data.answer) void here(asked.job).then(asked.resolve);
      else asked.resolve(event.data.answer);
    };
    worker.onerror = giveUp;
    worker.onmessageerror = giveUp;
  } catch {
    worker = null;
  }
  return worker;
}

/** The worker failed or never loaded: finish what it held here, and do all later work here too. */
function giveUp(): void {
  worker?.terminate();
  worker = null;
  const held = [...waiting.values()];
  waiting.clear();
  for (const { job, resolve } of held) void here(job).then(resolve);
}

function work(job: Job): Promise<Answer> {
  const to = connect();
  if (!to) return here(job);
  return new Promise((resolve) => {
    sent += 1;
    const id = sent;
    waiting.set(id, { job, resolve });
    try {
      to.postMessage({ id, job });
    } catch {
      // A worker that cannot be handed a job is no longer trusted with any.
      waiting.delete(id);
      giveUp();
      void here(job).then(resolve);
    }
  });
}

/** How the code looks, as the Look section sets it out: every colour a hex string. */
export type Design = {
  fill: 'solid' | 'linear' | 'radial';
  foreground: string;
  /** A gradient's second colour. */
  second: string;
  angle: number;
  background: string;
  transparent: boolean;
  /** The corners' own colour, or null for the foreground's. */
  corners: string | null;
  /** The theme last chosen, while its colours are untouched. */
  theme: ThemeId | null;
  dots: DotShape;
  ring: Ring;
  eye: Eye;
  /** Each code's own quiet zone in modules, by symbology; missing is its standard minimum. */
  quietZones: Record<string, number | null>;
};

export const DEFAULT_DESIGN: Design = {
  fill: 'solid',
  foreground: '#111417',
  second: '#0e6f8c',
  angle: 45,
  background: '#ffffff',
  transparent: false,
  corners: null,
  theme: null,
  dots: 'square',
  ring: 'square',
  eye: 'square',
  quietZones: {},
};

/** The paint a design's colours make. */
export function paintOf(design: Design): Paint {
  if (design.fill === 'linear')
    return { type: 'linear', from: design.foreground, to: design.second, angle: design.angle };
  if (design.fill === 'radial')
    return { type: 'radial', inner: design.foreground, outer: design.second };
  return { type: 'solid', colour: design.foreground };
}

/**
 * Only codes drawn here from their grid can carry a logo. Aztec's finder is in its middle, and
 * rectangular Micro QR is too short: a logo on it did not decode.
 */
export const takesLogo = (id: string): boolean =>
  symbologyOf(id).family !== 'drawn' && !id.startsWith('aztec') && id !== 'rmqr';

const NOTHING = new Uint8Array(0);

/**
 * The logo a job carries. The preview takes the small copy alone, so a key press never copies a
 * full-size image to the worker; a file takes the full image.
 */
const logoFor = (logo: LogoImage | null, output: Output): LogoImage | null =>
  logo && output === 'preview'
    ? { width: logo.width, height: logo.height, rgba: NOTHING, png: logo.small, small: NOTHING }
    : logo;

/** How a logo sits on the code. */
export type LogoShape = { size: number; padding: number; plate: 'square' | 'rounded' | 'circle' };

export function lookOf(
  design: Design,
  logo: LogoImage | null = null,
  shape: LogoShape = { size: 20, padding: 1, plate: 'square' },
  id = 'qr',
): Look {
  return {
    dots: design.dots,
    ring: design.ring,
    eye: design.eye,
    foreground: paintOf(design),
    background: design.transparent ? null : design.background,
    matte: design.background,
    corners: design.corners ? { type: 'solid', colour: design.corners } : null,
    theme: design.theme,
    quietZone: design.quietZones[id] ?? null,
    logo: logo
      ? {
          width: logo.width,
          height: logo.height,
          rgba: logo.rgba,
          png: logo.png,
          share: (Number(shape.size) || 0) / 100,
          padding: Number(shape.padding) || 0,
          plate: shape.plate,
        }
      : null,
  };
}

/** How large an export is, as the Size section sets it out. */
export type Sizing = {
  by: 'pixels' | 'print';
  pixels: number | null;
  mm: number | null;
  dpi: 300 | 600;
  page: 'fit' | 'a4' | 'letter';
};

export const sizeOf = (sizing: Sizing): ExportSize =>
  sizing.by === 'print'
    ? { kind: 'print', widthMm: Number(sizing.mm), dpi: Number(sizing.dpi) as 300 | 600 }
    : { kind: 'pixels', width: Number(sizing.pixels) };

/** The time, as a file name takes it, read from the page's clock at the press. */
function now() {
  const at = new Date();
  return {
    year: at.getFullYear(),
    month: at.getMonth() + 1,
    day: at.getDate(),
    hour: at.getHours(),
    minute: at.getMinutes(),
    second: at.getSeconds(),
  };
}

type OptionValue = string | number | boolean | null;

/** Each symbology's options as first offered: its catalogue defaults, automatic as null. */
const defaultOptions = (): Record<string, Record<string, OptionValue>> =>
  Object.fromEntries(
    SYMBOLOGIES.map((entry) => [
      entry.id,
      Object.fromEntries(
        entry.options.map((option) => [
          option.key,
          option.default === 'auto' ? null : option.default,
        ]),
      ),
    ]),
  );

/** The options as the encoder takes them: automatic left out, a choice as the catalogue's own value. */
function chosenOptions(kind: KindId, chosen: Record<string, OptionValue>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const spec of symbologyOf(kind).options) {
    const value = chosen[spec.key];
    if (value === null || value === undefined || value === '' || value === 'auto') continue;
    out[spec.key] =
      spec.kind === 'choice'
        ? (spec.values.find((entry) => String(entry) === String(value)) ?? value)
        : value;
  }
  return out;
}

const ALL_KINDS: KindId[] = [
  ...QR_KINDS.map((kind) => kind.id),
  ...OTHER_GROUPS.flatMap((group) => group.ids),
];

/**
 * Every choice on the page, and the code they make. Each kind keeps its own fields for the visit,
 * so switching kind never carries one kind's text into another's code. Only the latest request is
 * worked on: while one is being made, further changes replace the next instead of queueing, and
 * the last code stays on screen until the new one arrives.
 */
export class Maker {
  kind = $state<KindId>('qr-link');
  fields = $state<Record<string, Record<string, unknown>>>(
    Object.fromEntries(ALL_KINDS.map((kind) => [kind, blankFields(kind)])),
  );
  design = $state<Design>({ ...DEFAULT_DESIGN, quietZones: {} });
  options = $state(defaultOptions());
  /** The image read from the person's file, kept only in this tab's memory. */
  logo = $state.raw<LogoImage | null>(null);
  logoShape = $state<LogoShape>({ size: 20, padding: 1, plate: 'square' });
  sizing = $state<Sizing>({ by: 'pixels', pixels: 1024, mm: 50, dpi: 300, page: 'fit' });
  /** Options the person set themselves, as `id.key`: a logo never overrides them. */
  #fixed = new Set<string>();

  /** Marks an option as the person's own choice. */
  fix(id: string, key: string): void {
    this.#fixed.add(`${id}.${key}`);
  }

  /**
   * Sets or removes the logo. A new logo raises error correction to its highest, so the code can
   * recover what the logo covers, unless the person chose a level themselves.
   */
  setLogo(image: LogoImage | null): void {
    this.logo = image;
    if (!image) return;
    for (const id of ['qr', 'micro-qr', 'rmqr']) {
      const spec = symbologyOf(id).options.find((option) => option.key === 'eclevel');
      if (!spec || spec.kind !== 'choice' || this.#fixed.has(`${id}.eclevel`)) continue;
      const highest = spec.values.at(-1);
      if (highest !== undefined) this.options[id]!.eclevel = highest;
    }
  }
  /** The answer for the latest request: a code, or why there is none. */
  current = $state.raw<Answer | undefined>(undefined);
  /** The last code made, kept on screen beneath a refusal. */
  shown = $state.raw<Made | undefined>(undefined);
  busy = $state(false);
  #latest: Job | undefined;
  #asked = 0;
  #answered = 0;
  #running = false;

  /** The job for every choice as it is now, or the reason there is none. */
  job(output: Output): Job | Exclude<Answer, Made> | undefined {
    const payload = payloadFor(this.kind, $state.snapshot(this.fields[this.kind]) ?? {});
    if (!payload.ok) return payload.problem === 'empty' ? undefined : payload;
    return {
      request: {
        ...payload.value,
        options: chosenOptions(this.kind, $state.snapshot(this.options[payload.value.id]) ?? {}),
      },
      look: lookOf(
        $state.snapshot(this.design) as Design,
        takesLogo(payload.value.id) ? logoFor(this.logo, output) : null,
        $state.snapshot(this.logoShape) as LogoShape,
        payload.value.id,
      ),
      output,
    };
  }

  #show(reply: Answer | undefined): void {
    this.current = reply;
    if (reply?.ok) this.shown = reply;
    else if (!reply) this.shown = undefined;
  }

  /** Asks for the code every choice makes now. Reads them all, so an effect re-asks on any change. */
  ask(): void {
    const job = this.job('preview');
    this.#asked += 1;
    if (!job || !('request' in job)) {
      this.#latest = undefined;
      this.#answered = this.#asked;
      this.#show(job);
      this.busy = false;
      return;
    }
    this.#latest = job;
    this.busy = true;
    if (!this.#running) void this.#run();
  }

  async #run(): Promise<void> {
    this.#running = true;
    try {
      while (this.#answered < this.#asked && this.#latest) {
        const asked = this.#asked;
        const reply = await work(this.#latest);
        if (asked === this.#asked && this.#answered < asked) {
          this.#show(reply);
          this.#answered = asked;
          this.busy = false;
        }
      }
    } finally {
      this.#running = false;
    }
  }

  /** A file for every choice as it is now, never for an older request. */
  async exact(output: Output, size?: ExportSize): Promise<Answer | undefined> {
    const job = this.job(output);
    if (!job || !('request' in job)) return job;
    const sizing = $state.snapshot(this.sizing) as Sizing;
    return work({
      ...job,
      size: size ?? sizeOf(sizing),
      page: sizing.page,
      names: { kind: this.kind, at: now() },
    });
  }
}
