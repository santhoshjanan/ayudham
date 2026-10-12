// Sound for the room: the music during a countdown, the beep at its end and the
// ticks of the reveal count. Off until a person turns it on. The choice and the
// volume are kept in this browser's local storage and are never sent anywhere.
// No audio file is requested, and no audio device is opened, while sound is off.
import { MUSIC_TRACK_IDS } from '@pokerji/protocol';

const SOUND_KEY = 'pj-sound';
const VOLUME_KEY = 'pj-volume';

export const sound = $state({ on: false, volume: 0.6 });

type Music = {
  id: string;
  element: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  fading: boolean;
  done?: ReturnType<typeof setTimeout>;
};

let context: AudioContext | null = null;
let master: GainNode | null = null;
let music: Music | null = null;
let loaded = false;

const remember = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private browsing: the choice lasts for this page only.
  }
};

/** The audio device, opened on first use. Null when the browser has none or refuses. */
const output = (): { context: AudioContext; master: GainNode } | null => {
  if (!sound.on) return null;
  // After a reload sound may be on before the person has touched the page. Browsers
  // hold audio back until they do, and notes asked for meanwhile would queue up and
  // all play at the first click. So until then nothing is asked for at all; the room
  // asks again several times a second, and the music starts once the page is touched.
  if (navigator.userActivation?.hasBeenActive === false) return null;
  try {
    if (!context || !master) {
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = sound.volume;
      master.connect(context.destination);
    }
    // Browsers keep audio suspended until the person has interacted with the page.
    if (context.state === 'suspended') void context.resume().catch(() => undefined);
    return { context, master };
  } catch {
    return null;
  }
};

/** Reads the saved choice. Browser only; safe to call more than once. */
export function loadSound(): void {
  if (loaded) return;
  loaded = true;
  try {
    sound.on = localStorage.getItem(SOUND_KEY) === '1';
    const volume = Number(localStorage.getItem(VOLUME_KEY));
    if (localStorage.getItem(VOLUME_KEY) !== null && volume >= 0 && volume <= 1) {
      sound.volume = volume;
    }
  } catch {
    // No storage: sound stays off until turned on.
  }
}

export function setSound(on: boolean): void {
  sound.on = on;
  remember(SOUND_KEY, on ? '1' : '0');
  if (on) {
    tick();
    return;
  }
  stopMusic();
  // Off means the audio device is closed, not merely quiet.
  void context?.close().catch(() => undefined);
  context = null;
  master = null;
}

export function setVolume(volume: number): void {
  if (!(volume >= 0 && volume <= 1)) return;
  sound.volume = volume;
  remember(VOLUME_KEY, String(volume));
  if (context && master) master.gain.setTargetAtTime(volume, context.currentTime, 0.02);
}

/** Starts a bundled track from its beginning and loops it. Does nothing if it is already playing. */
export function startMusic(id: string): void {
  if (music?.id === id && !music.fading) return;
  // Only ids from the bundled list ever become a URL.
  if (!MUSIC_TRACK_IDS.includes(id)) return;
  const out = output();
  if (!out) return;
  stopMusic();
  try {
    const element = new Audio(`/audio/${id}.mp3`);
    element.loop = true;
    const source = out.context.createMediaElementSource(element);
    const gain = out.context.createGain();
    gain.gain.value = 0.85;
    source.connect(gain).connect(out.master);
    music = { id, element, source, gain, fading: false };
    // A blocked or failed start is silence; the countdown itself is unaffected.
    void element.play().catch(() => undefined);
  } catch {
    music = null;
  }
}

/** Fades the music to silence over the given time, then stops it. */
export function fadeMusic(milliseconds: number): void {
  if (!music || music.fading || !context) return;
  const current = music;
  current.fading = true;
  const at = context.currentTime;
  current.gain.gain.setValueAtTime(current.gain.gain.value, at);
  current.gain.gain.linearRampToValueAtTime(0, at + milliseconds / 1000);
  current.done = setTimeout(() => {
    if (music === current) stopMusic();
  }, milliseconds + 60);
}

export function stopMusic(): void {
  if (!music) return;
  clearTimeout(music.done);
  music.element.pause();
  // Dropping the source ends the download of a track that was barely played.
  music.element.removeAttribute('src');
  music.element.load();
  music.source.disconnect();
  music.gain.disconnect();
  music = null;
}

/** One sine note with a soft edge, so it does not click. */
const note = (
  out: { context: AudioContext; master: GainNode },
  { at, length, pitch, level }: { at: number; length: number; pitch: number; level: number },
) => {
  const oscillator = out.context.createOscillator();
  const gain = out.context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = pitch;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(level, at + 0.006);
  gain.gain.setValueAtTime(level, at + length - 0.012);
  gain.gain.linearRampToValueAtTime(0, at + length);
  oscillator.connect(gain).connect(out.master);
  oscillator.start(at);
  oscillator.stop(at + length + 0.02);
};

/** Time is up: a telegraph key, three short and one long. */
export function beep(): void {
  const out = output();
  if (!out) return;
  const unit = 0.07;
  let at = out.context.currentTime + 0.03;
  for (const units of [1, 1, 1, 3]) {
    note(out, { at, length: unit * units, pitch: 740, level: 0.5 });
    at += unit * (units + 1);
  }
}

/** A soft tick for one beat of the reveal count. */
export function tick(): void {
  const out = output();
  if (!out) return;
  note(out, { at: out.context.currentTime + 0.01, length: 0.045, pitch: 980, level: 0.22 });
}
