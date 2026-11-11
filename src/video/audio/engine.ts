// The Audio Lab's sound path: the film's media element routed through Web Audio, with no dependency.
//
//   element -> input (always two channels) -> five filters -> Late Night compressor
//           -> output matrix (Stereo, Mono or Wide, with the balance folded in) -> limiter -> ceiling -> speakers
//
// The EQ carries no trim (the owner's answer, 2026-11-09): a cut lowers only its band, a boost raises only its band,
// and the limiter and the ceiling guard the boosts.
//
// Routing is one way: once `createMediaElementSource` takes the element, the film is heard only through this
// graph. So the graph is built only on a path where it is proven to carry sound (see `canRoute`), only after
// its context is running, and it is never closed while its element is still on the page.

export const BANDS = [
  { freq: 60, type: 'lowshelf', label: '60 Hz', short: '60' },
  { freq: 250, type: 'peaking', label: '250 Hz', short: '250' },
  { freq: 1000, type: 'peaking', label: '1 kHz', short: '1k' },
  { freq: 4000, type: 'peaking', label: '4 kHz', short: '4k' },
  { freq: 12000, type: 'highshelf', label: '12 kHz', short: '12k' },
] as const;

/** Each band's reach, in dB either way. */
export const GAIN_LIMIT = 12;

export type Gains = readonly [number, number, number, number, number];

export const FLAT: Gains = [0, 0, 0, 0, 0];

export const PRESETS = [
  { value: 'flat', label: 'Flat', gains: FLAT, night: false },
  { value: 'cinema', label: 'Cinema', gains: [5, 1, 0, 2, 3], night: false },
  {
    value: 'dialogue',
    label: 'Dialogue',
    gains: [-6, -2, 3, 4, -2],
    night: false,
  },
  { value: 'music', label: 'Music', gains: [4, -1, -2, 1, 4], night: false },
  {
    value: 'late-night',
    label: 'Late Night',
    gains: [-3, 0, 2, 2, 0],
    night: true,
  },
] as const satisfies readonly {
  value: string;
  label: string;
  gains: Gains;
  night: boolean;
}[];

export type PresetId = (typeof PRESETS)[number]['value'];

export const OUTPUTS = [
  { value: 'stereo', label: 'Stereo' },
  { value: 'mono', label: 'Mono' },
  { value: 'wide', label: 'Wide' },
] as const;

export type OutputMode = (typeof OUTPUTS)[number]['value'];

export interface LabSound {
  gains: Gains;
  night: boolean;
  output: OutputMode;
  /** -1 is all left, 1 all right. */
  balance: number;
}

/** The peaking bands' width (about 1.4 octaves). The shelves use Web Audio's fixed slope. */
const PEAK_Q = 1;

/**
 * Late Night: a compressor that evens loud and quiet, about halving a film's loudness range. Tuned by ear and by
 * measurement on The Only One That Fits and The Rogue Render (design/lightline-record.md, part 3): the node's
 * own makeup gain lifts the quiet parts and leaves the loud ones near Flat's level, so it takes no trim of its own.
 */
const NIGHT = {
  threshold: -34,
  knee: 12,
  ratio: 4,
  attack: 0.005,
  release: 0.3,
} as const;

/** Wide: the side signal raised, the mid left alone, so a mono sum is the film's own, only trimmed. */
const WIDE_SIDE = 2;
const WIDE_TRIM_DB = -0.3;

/** The safety limiter: it holds peaks near -1 dBFS; the ceiling after it never passes 0.97. */
const LIMIT = {
  threshold: -1,
  knee: 0,
  ratio: 20,
  attack: 0.002,
  release: 0.12,
} as const;

/** The pings: a short, quiet sine, about 26 dB under full scale at full volume. */
const PING = {
  freq: 880,
  level: 0.05,
  rise: 0.015,
  hold: 0.2,
  fall: 0.1,
} as const;

/** How quickly a change lands, in seconds (a time constant: settled in about four of these). */
const GLIDE = 0.03;

const dbToGain = (db: number) => 10 ** (db / 20);

/** Identity up to 0.9, then a soft knee that never reaches 0.97: the last word on full scale. */
function ceilingCurve() {
  const curve = new Float32Array(4097);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    const over = Math.abs(x) - 0.9;
    curve[i] = over <= 0 ? x : Math.sign(x) * (0.9 + 0.07 * Math.tanh(over / 0.07));
  }
  return curve;
}

/**
 * Whether this element's sound can go through Web Audio here and still be heard: only where that was measured.
 * Chromium's hls.js path (MediaSource, a `blob:` source) carries sound, measured in Edge for parts 2 and 3.
 * Where the browser plays the stream itself, as Safari and every iOS browser do, routing has a history of
 * silent output; Firefox could not be run on this machine. Both are left out (Chromium names itself in
 * `navigator.userAgentData`, which neither has), so their viewers never see the lab and the film plays as it
 * always did. Widen this only with a measurement.
 */
export function canRoute(media: HTMLMediaElement) {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return false;
  if (typeof MediaSource === 'undefined' || 'GestureEvent' in window) return false;
  const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands;
  if (!brands?.some((entry) => entry.brand === 'Chromium')) return false;
  return media.currentSrc.startsWith('blob:');
}

/** The response, in dB, of a set of filters at `freqs`, summed over the five. */
function responseDb(filters: readonly BiquadFilterNode[], freqs: Float32Array<ArrayBuffer>) {
  const total = new Float32Array(freqs.length);
  const mag = new Float32Array(freqs.length);
  const phase = new Float32Array(freqs.length);
  for (const filter of filters) {
    filter.getFrequencyResponse(freqs, mag, phase);
    for (let i = 0; i < freqs.length; i++) total[i]! += 20 * Math.log10(Math.max(mag[i]!, 1e-6));
  }
  return total;
}

function makeFilters(context: BaseAudioContext) {
  return BANDS.map(
    (band) =>
      new BiquadFilterNode(context, {
        type: band.type,
        frequency: band.freq,
        Q: PEAK_Q,
      })
  );
}

/** Frequencies from 20 Hz to 20 kHz, evenly spaced on a log scale. */
export function logFrequencies(count: number) {
  const freqs = new Float32Array(count);
  for (let i = 0; i < count; i++) freqs[i] = 20 * 1000 ** (i / (count - 1));
  return freqs;
}

const curveFilters = new Map<number, BiquadFilterNode[]>();

/**
 * The curve the five filters draw for `gains`, in dB at `freqs`: their own response, read from a matching set
 * on a silent offline context at the live sample rate (it needs no gesture, touches no sound, and leaves the
 * live filters' glides alone).
 */
export function curveDb(gains: Gains, freqs: Float32Array<ArrayBuffer>, sampleRate = 48000) {
  let filters = curveFilters.get(sampleRate);
  if (!filters) {
    filters = makeFilters(new OfflineAudioContext(1, 1, sampleRate));
    curveFilters.set(sampleRate, filters);
  }
  filters.forEach((filter, i) => (filter.gain.value = gains[i]!));
  return responseDb(filters, freqs);
}

export class LabEngine {
  readonly context: AudioContext;
  private readonly filters: BiquadFilterNode[];
  private readonly night: DynamicsCompressorNode;
  /** The output matrix: left from left, left from right, right from left, right from right. */
  private readonly matrix: {
    ll: GainNode;
    rl: GainNode;
    lr: GainNode;
    rr: GainNode;
  };
  private readonly pings: ChannelMergerNode;
  private readonly limiter: DynamicsCompressorNode;
  /** The meter's taps: before the limiter (a clip shows there) and what reaches the speakers. */
  readonly taps: {
    pre: [AnalyserNode, AnalyserNode];
    post: [AnalyserNode, AnalyserNode];
  };
  private balance: [number, number] = [1, 1];

  constructor(context: AudioContext, media: HTMLMediaElement) {
    this.context = context;
    const source = context.createMediaElementSource(media);

    // Two channels from here on: a mono film is spread to both sides, a wider one folded down.
    const input = new GainNode(context, {
      channelCount: 2,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
    });
    this.filters = makeFilters(context);
    this.night = new DynamicsCompressorNode(context, {
      threshold: 0,
      knee: 0,
      ratio: 1,
    });

    const split = new ChannelSplitterNode(context, { numberOfOutputs: 2 });
    const merge = new ChannelMergerNode(context, { numberOfInputs: 2 });
    this.matrix = {
      ll: new GainNode(context, { gain: 1 }),
      rl: new GainNode(context, { gain: 0 }),
      lr: new GainNode(context, { gain: 0 }),
      rr: new GainNode(context, { gain: 1 }),
    };
    this.pings = new ChannelMergerNode(context, { numberOfInputs: 2 });
    this.limiter = new DynamicsCompressorNode(context, LIMIT);
    // The limiter's built-in makeup gain is undone, so below its threshold it changes nothing.
    const unmakeup = new GainNode(context, { gain: 1 / limiterMakeup() });
    const ceiling = new WaveShaperNode(context, { curve: ceilingCurve() });

    source.connect(input);
    let node: AudioNode = input;
    for (const filter of this.filters) node = node.connect(filter);
    node.connect(this.night).connect(split);
    split.connect(this.matrix.ll, 0).connect(merge, 0, 0);
    split.connect(this.matrix.rl, 1).connect(merge, 0, 0);
    split.connect(this.matrix.lr, 0).connect(merge, 0, 1);
    split.connect(this.matrix.rr, 1).connect(merge, 0, 1);
    merge.connect(this.limiter);
    this.pings.connect(this.limiter);
    this.limiter.connect(unmakeup).connect(ceiling).connect(context.destination);

    const tap = (from: AudioNode) => {
      const sides = new ChannelSplitterNode(context, { numberOfOutputs: 2 });
      from.connect(sides);
      const pair = [0, 1].map((side) => {
        const analyser = new AnalyserNode(context, {
          fftSize: 2048,
          smoothingTimeConstant: 0,
        });
        sides.connect(analyser, side);
        return analyser;
      });
      return pair as [AnalyserNode, AnalyserNode];
    };
    this.taps = { pre: tap(merge), post: tap(ceiling) };
  }

  /** Bring the graph to `sound`, gliding so a change never clicks. */
  set(sound: LabSound) {
    const at = this.context.currentTime;
    // A glide that lands exactly: an end of the balance is silence, not a value approaching it.
    const glide = (param: AudioParam, value: number) => {
      param.cancelScheduledValues(at);
      param.setTargetAtTime(value, at, GLIDE);
      param.setValueAtTime(value, at + GLIDE * 8);
    };

    this.filters.forEach((filter, i) => glide(filter.gain, sound.gains[i]!));
    glide(this.night.threshold, sound.night ? NIGHT.threshold : 0);
    glide(this.night.knee, sound.night ? NIGHT.knee : 0);
    glide(this.night.ratio, sound.night ? NIGHT.ratio : 1);
    this.night.attack.value = NIGHT.attack;
    this.night.release.value = NIGHT.release;

    // Left out = a * left + b * right, right out = b * left + a * right, each side then scaled by the balance.
    let a = 1;
    let b = 0;
    if (sound.output === 'mono') a = b = 0.5;
    if (sound.output === 'wide') {
      const trim = dbToGain(WIDE_TRIM_DB);
      a = (trim * (1 + WIDE_SIDE)) / 2;
      b = (trim * (1 - WIDE_SIDE)) / 2;
    }
    const p = Math.max(-1, Math.min(1, sound.balance));
    this.balance = [p > 0 ? 1 - p : 1, p < 0 ? 1 + p : 1];
    const [left, right] = this.balance;
    glide(this.matrix.ll.gain, a * left);
    glide(this.matrix.rl.gain, b * left);
    glide(this.matrix.lr.gain, b * right);
    glide(this.matrix.rr.gain, a * right);
  }

  /**
   * A short, quiet ping from one side (0 left, 1 right), through the balance, the limiter and the speakers.
   * `volume` is the element's (0 when muted), since the ping does not pass through the element.
   */
  ping(side: 0 | 1, volume: number) {
    const at = this.context.currentTime + 0.01;
    const peak = PING.level * volume * this.balance[side];
    if (peak <= 0) return;
    const tone = new OscillatorNode(this.context, { frequency: PING.freq });
    const envelope = new GainNode(this.context, { gain: 0 });
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(peak, at + PING.rise);
    envelope.gain.setValueAtTime(peak, at + PING.rise + PING.hold);
    envelope.gain.linearRampToValueAtTime(0, at + PING.rise + PING.hold + PING.fall);
    tone.connect(envelope).connect(this.pings, 0, side);
    tone.start(at);
    tone.stop(at + PING.rise + PING.hold + PING.fall + 0.01);
    tone.onended = () => envelope.disconnect();
  }

  close() {
    void this.context.close().catch(() => undefined);
  }
}

/**
 * The makeup gain a DynamicsCompressorNode adds on its own (Web Audio's algorithm): the inverse of what its
 * curve does to a full-scale signal, to the 0.6 power. With a hard knee the curve at 0 dBFS is the threshold
 * plus the rest over the ratio.
 */
function limiterMakeup() {
  const fullRangeDb = LIMIT.threshold + -LIMIT.threshold / LIMIT.ratio;
  return dbToGain(-fullRangeDb * 0.6);
}

const engines = new WeakMap<HTMLMediaElement, LabEngine>();
/** A context made in a gesture and waiting to run; a second start in the same gesture shares it. */
const starting = new WeakMap<HTMLMediaElement, AudioContext>();

/**
 * The element's graph, building it if needed. Call it inside a user gesture: the context is made there so it
 * can start, and the element is routed only once the context runs. Resolves to null when it cannot run; the
 * film then plays as it always did.
 */
export async function startEngine(media: HTMLMediaElement): Promise<LabEngine | null> {
  const known = engines.get(media);
  if (known) {
    if (known.context.state !== 'running') await known.context.resume().catch(() => undefined);
    return known;
  }
  if (!canRoute(media)) return null;

  let context = starting.get(media);
  if (!context) {
    context = new AudioContext();
    starting.set(media, context);
  }
  // Resumed inside this gesture; a context the browser will not start yet waits for the next one.
  if (context.state !== 'running') await context.resume().catch(() => undefined);
  const built = engines.get(media);
  if (built) return built;
  if (context.state !== 'running') return null;
  starting.delete(media);
  if (!media.isConnected) {
    void context.close().catch(() => undefined);
    return null;
  }
  const engine = new LabEngine(context, media);
  engines.set(media, engine);
  return engine;
}

/** The element's graph if it has one; never builds. */
export function engineFor(media: HTMLMediaElement | null | undefined) {
  return media ? (engines.get(media) ?? null) : null;
}

/** Close the element's graph once the element has left the page (a new film, a reload); never before. */
export function releaseEngine(media: HTMLMediaElement) {
  setTimeout(() => {
    if (media.isConnected) return;
    void starting
      .get(media)
      ?.close()
      .catch(() => undefined);
    starting.delete(media);
    engines.get(media)?.close();
    engines.delete(media);
  }, 0);
}
