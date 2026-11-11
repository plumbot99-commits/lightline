/** @jsxImportSource react */

import { useContainer } from '@videojs/react';
import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  canRoute,
  engineFor,
  FLAT,
  GAIN_LIMIT,
  type Gains,
  type LabEngine,
  type LabSound,
  type OutputMode,
  OUTPUTS,
  type PresetId,
  PRESETS,
  releaseEngine,
  startEngine,
} from './engine';
import { filmVideo } from '../shared/film-video';

/**
 * The Audio Lab's state: the preset (or the viewer's own curve), the output and the balance, and the graph that
 * carries them. Nothing touches the film's sound until a gesture in the player asks for it: opening the lab,
 * choosing in it, or, when the viewer's settings are not Flat, Stereo and centered, the first press in the
 * player (so a stored preset is heard, not only shown). Until then the element plays as it always has.
 */
export type LabPreset = PresetId | 'custom';

export interface LabSettings {
  preset: LabPreset;
  gains: Gains;
  output: OutputMode;
  balance: number;
}

export interface AudioChange {
  preset: LabPreset;
  output: OutputMode;
}

const STORE_KEY = 'lightline:audio';

const DEFAULTS: LabSettings = {
  preset: 'flat',
  gains: FLAT,
  output: 'stereo',
  balance: 0,
};

const presetGains = (preset: PresetId) => PRESETS.find((p) => p.value === preset)!.gains;

const clampGain = (db: number) => Math.max(-GAIN_LIMIT, Math.min(GAIN_LIMIT, Math.round(db * 2) / 2));

/** The viewer's stored preset and output, behind try/catch: storage can be blocked, and then the defaults hold. */
function stored(): LabSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') as Partial<LabSettings> | null;
    if (!raw) return DEFAULTS;
    const output = OUTPUTS.find((o) => o.value === raw.output)?.value ?? 'stereo';
    if (raw.preset === 'custom' && Array.isArray(raw.gains) && raw.gains.length === 5)
      return {
        ...DEFAULTS,
        preset: 'custom',
        gains: raw.gains.map((g) => clampGain(Number(g) || 0)) as unknown as Gains,
        output,
      };
    const preset = PRESETS.find((p) => p.value === raw.preset)?.value ?? 'flat';
    return { ...DEFAULTS, preset, gains: presetGains(preset), output };
  } catch {
    return DEFAULTS;
  }
}

function store(settings: LabSettings) {
  try {
    const { preset, gains, output } = settings;
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify(preset === 'custom' ? { preset, gains, output } : { preset, output })
    );
  } catch {
    // The choice still holds for this visit.
  }
}

export function soundOf(settings: LabSettings): LabSound {
  const night = settings.preset !== 'custom' && PRESETS.find((p) => p.value === settings.preset)!.night;
  return {
    gains: settings.gains,
    night,
    output: settings.output,
    balance: settings.balance,
  };
}

const isDefault = (s: LabSettings) => s.preset === 'flat' && s.output === 'stereo' && s.balance === 0;

/** The bar gives the lab its own button from this container width up; below it the lab is a row in Settings. */
const WIDE_FROM_REM = 30;

export interface AudioLab {
  /** The film plays on a path the lab is proven on (see `canRoute`); otherwise the lab is not offered. */
  available: boolean;
  /** The container is narrow: the lab opens from Settings instead of the bar. */
  narrow: boolean;
  settings: LabSettings;
  engine: LabEngine | null;
  media: HTMLMediaElement | null;
  container: HTMLElement | null;
  setPreset: (preset: PresetId) => void;
  /** Set a band, or step it from where it is (so quick key presses never read a stale value). */
  setGain: (band: number, db: number | ((now: number) => number)) => void;
  setOutput: (output: OutputMode) => void;
  setBalance: (balance: number) => void;
  /** Build the graph if it is not built; call from a user gesture. */
  start: () => void;
  open: boolean;
  /** Open the lab from `opener` (the bar button, or Settings' button when narrow), or close it. */
  setOpen: (open: boolean, opener?: HTMLElement | null) => void;
  opener: RefObject<HTMLElement | null>;
}

const LabContext = createContext<AudioLab | null>(null);

export function useAudioLab() {
  const lab = useContext(LabContext);
  if (!lab) throw new Error('useAudioLab must be used inside the Lightline skin.');
  return lab;
}

export interface AudioLabHostProps {
  /** A preset the host sets (the workbench's `eq`); a change from the host replaces the viewer's. */
  audioPreset?: PresetId;
  /** An output the host sets (the workbench's `spatial`). */
  audioOutput?: OutputMode;
  /** Called when the viewer changes the preset or the output in the lab. */
  onAudioChange?: (change: AudioChange) => void;
}

export function AudioLabProvider({
  audioPreset,
  audioOutput,
  onAudioChange,
  children,
}: AudioLabHostProps & { children: ReactNode }) {
  const container = useContainer() as HTMLElement | null;
  const [settings, setSettings] = useState<LabSettings>(() => {
    const own = stored();
    const preset = audioPreset ?? own.preset;
    return {
      ...own,
      preset,
      gains: preset === 'custom' ? own.gains : presetGains(preset),
      output: audioOutput ?? own.output,
    };
  });
  const [media, setMedia] = useState<HTMLMediaElement | null>(null);
  const [available, setAvailable] = useState(false);
  const [engine, setEngine] = useState<LabEngine | null>(null);
  const [narrow, setNarrow] = useState(false);
  const [open, setOpenState] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const reported = useRef(onAudioChange);
  reported.current = onAudioChange;

  // The element, and whether its path is one the lab is proven on: known once the source is chosen.
  useEffect(() => {
    if (!container) return;
    const video = filmVideo(container);
    if (!video) return;
    setMedia(video);
    setEngine(engineFor(video));
    const check = () => setAvailable(canRoute(video) || engineFor(video) !== null);
    check();
    const events = ['loadstart', 'loadedmetadata', 'emptied', 'canplay'];
    events.forEach((type) => video.addEventListener(type, check));
    return () => {
      events.forEach((type) => video.removeEventListener(type, check));
      releaseEngine(video);
    };
  }, [container]);

  // The container's width decides where the lab opens from.
  useEffect(() => {
    if (!container) return;
    const measure = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      setNarrow(container.getBoundingClientRect().width < WIDE_FROM_REM * rem);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [container]);

  const start = useCallback(() => {
    if (!media || !(engineFor(media) || canRoute(media))) return;
    void startEngine(media).then((built) => {
      if (built) setEngine(built);
    });
  }, [media]);

  // A first press in the player starts the graph when the viewer's settings would change the sound.
  const wanted = !isDefault(settings);
  useEffect(() => {
    if (!container || !wanted || engine || !available) return;
    const go = () => start();
    container.addEventListener('pointerdown', go, true);
    container.addEventListener('keydown', go, true);
    return () => {
      container.removeEventListener('pointerdown', go, true);
      container.removeEventListener('keydown', go, true);
    };
  }, [container, wanted, engine, available, start]);

  useEffect(() => {
    engine?.set(soundOf(settings));
  }, [engine, settings]);

  // The host's picks: applied when they change, after the first render took them as the starting point.
  const host = useRef({ audioPreset, audioOutput });
  useEffect(() => {
    const last = host.current;
    host.current = { audioPreset, audioOutput };
    setSettings((s) => {
      let next = s;
      if (audioPreset && audioPreset !== last.audioPreset && audioPreset !== s.preset)
        next = {
          ...next,
          preset: audioPreset,
          gains: presetGains(audioPreset),
        };
      if (audioOutput && audioOutput !== last.audioOutput && audioOutput !== s.output)
        next = { ...next, output: audioOutput };
      return next;
    });
  }, [audioPreset, audioOutput]);

  const change = useCallback((update: (s: LabSettings) => LabSettings) => {
    setSettings((s) => {
      const next = update(s);
      if (next.preset !== s.preset || next.gains !== s.gains || next.output !== s.output) store(next);
      if (next.preset !== s.preset || next.output !== s.output)
        queueMicrotask(() => reported.current?.({ preset: next.preset, output: next.output }));
      return next;
    });
  }, []);

  const setOpen = useCallback(
    (next: boolean, from?: HTMLElement | null) => {
      if (next && from) opener.current = from;
      if (next) start();
      setOpenState(next);
    },
    [start]
  );

  const value = useMemo<AudioLab>(
    () => ({
      available,
      narrow,
      settings,
      engine,
      media,
      container,
      setPreset: (preset) => {
        start();
        change((s) => ({ ...s, preset, gains: presetGains(preset) }));
      },
      setGain: (band, db) => {
        start();
        change((s) => {
          const gains = [...s.gains] as [number, number, number, number, number];
          gains[band] = clampGain(typeof db === 'function' ? db(s.gains[band]!) : db);
          if (gains[band] === s.gains[band]) return s;
          const same = PRESETS.find((p) => p.gains.every((g, i) => g === gains[i]) && !p.night);
          return { ...s, preset: same?.value ?? 'custom', gains };
        });
      },
      setOutput: (output) => {
        start();
        change((s) => ({ ...s, output }));
      },
      setBalance: (balance) => {
        start();
        change((s) => ({ ...s, balance: Math.max(-1, Math.min(1, balance)) }));
      },
      start,
      open,
      setOpen,
      opener,
    }),
    [available, narrow, settings, engine, media, container, change, start, open, setOpen]
  );

  return <LabContext.Provider value={value}>{children}</LabContext.Provider>;
}
