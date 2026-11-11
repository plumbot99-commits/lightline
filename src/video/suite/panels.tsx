/** @jsxImportSource react */

import { useMedia } from '@videojs/react';
import { usePlayer } from '@videojs/react/video';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/resolve-class-name';

import { useAudioLab } from '../audio/lab';
import { LabPanel } from '../shared/audio-lab';
import { type Format, useFormat, useSay, useText } from '@/i18n/i18n';

import type { PanelId } from './layout';
import { useSuite } from './suite';

// The Suite's four panels (the timeline's id is `guides`, from when it held the guides too; they are in the bar now).
// Every number they show is read from the browser or the stream's own engine; where neither reports a value, the panel
// says so rather than fill one in.

export function PanelBody({ id }: { id: PanelId }) {
  if (id === 'lab') return <LabBody />;
  if (id === 'deck') return <TimecodeDeck />;
  if (id === 'telemetry') return <Telemetry />;
  return <Timeline />;
}

function LabBody() {
  const say = useSay();
  const lab = useAudioLab();
  const id = `lightline-suite-lab-${useId().replace(/:/g, '')}`;
  if (!lab.available) return <p className={'lightline-panel-note'}>{say('labUnavailable')}</p>;
  return (
    <div className={'lightline-suite-lab'}>
      <LabPanel id={id} tall />
    </div>
  );
}

/* ---------- The stream's engine, read without depending on it ---------- */

interface Level {
  width?: number;
  height?: number;
  bitrate?: number;
  frameRate?: number;
  videoCodec?: string;
  audioCodec?: string;
  attrs?: Record<string, string>;
}

interface Engine {
  levels?: Level[];
  currentLevel?: number;
  bandwidthEstimate?: number;
  abrController?: { bwEstimator?: { canEstimate?: () => boolean } };
}

/** hls.js, where the film plays through it (Chromium's MediaSource path); null where the browser plays the stream. */
function useEngine(): Engine | null {
  const media = useMedia() as unknown as { engine?: unknown } | null;
  const engine = media?.engine;
  return engine && typeof engine === 'object' && 'levels' in engine ? (engine as Engine) : null;
}

const currentLevel = (engine: Engine | null): Level | null => {
  const index = engine?.currentLevel ?? -1;
  return index >= 0 ? (engine?.levels?.[index] ?? null) : null;
};

/** The frame rate the manifest gives (FRAME-RATE on the variant). */
function manifestRate(engine: Engine | null) {
  const level = currentLevel(engine) ?? engine?.levels?.find((l) => l.frameRate || l.attrs?.['FRAME-RATE']);
  const rate = level?.frameRate || Number(level?.attrs?.['FRAME-RATE']);
  return rate && Number.isFinite(rate) ? rate : null;
}

/** Re-read once a second while mounted. */
function useTick(ms = 1000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), ms);
    return () => clearInterval(timer);
  }, [ms]);
}

/* ---------- Timecode deck ---------- */

type VideoWithFrames = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

const pad = (n: number) => String(n).padStart(2, '0');

function timecode(seconds: number, fps: number | null) {
  const whole = Math.max(0, seconds);
  if (!fps) {
    const s = Math.floor(whole);
    return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
  }
  // Non-drop-frame at the nominal rate: frames count from the film's own frame times.
  const nominal = Math.round(fps);
  const frames = Math.floor(whole * fps + 1e-3);
  const s = Math.floor(frames / nominal);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}:${pad(frames % nominal)}`;
}

const SPEEDS = [0.25, 0.5, 1, 1.5, 2];

/** A frame rate measured from a film's frames, kept for the element so a panel that moves need not measure again. */
const measuredRates = new WeakMap<HTMLMediaElement, number>();

function TimecodeDeck() {
  const say = useSay();
  const t = useText();
  const format = useFormat();
  const lab = useAudioLab();
  const video = lab.media as VideoWithFrames | null;
  const engine = useEngine();
  const rate = usePlayer((s) => s.playbackRate);
  const setRate = usePlayer((s) => s.setPlaybackRate);
  const currentTime = usePlayer((s) => s.currentTime);
  const id = `lightline-deck-${useId().replace(/:/g, '')}`;
  const readout = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);
  const [measured, setMeasured] = useState<number | null>(() => (video && measuredRates.get(video)) || null);
  useTick();
  const fromStream = manifestRate(engine);
  const fps = fromStream ?? measured;
  const fpsRef = useRef(fps);
  fpsRef.current = fps;

  // The readout follows the frames the browser presents, where it reports them; otherwise the time it reports.
  useEffect(() => {
    if (!video) return;
    const write = (t: number) => {
      shown.current = t;
      if (readout.current) readout.current.textContent = timecode(t, fpsRef.current);
    };
    write(video.currentTime);
    if (!video.requestVideoFrameCallback) {
      const update = () => write(video.currentTime);
      video.addEventListener('timeupdate', update);
      video.addEventListener('seeked', update);
      return () => {
        video.removeEventListener('timeupdate', update);
        video.removeEventListener('seeked', update);
      };
    }
    // The frame rate is measured from the presented frames only where the manifest does not give one.
    if (measuredRates.has(video)) setMeasured(measuredRates.get(video)!);
    // A new source may have another rate.
    const forget = () => {
      measuredRates.delete(video);
      setMeasured(null);
    };
    video.addEventListener('emptied', forget);
    const gaps: number[] = [];
    let last = -1;
    let handle = 0;
    const frame = (_: number, meta: { mediaTime: number }) => {
      if (last >= 0 && video.playbackRate === 1 && !video.paused) {
        const gap = meta.mediaTime - last;
        if (gap > 0.004 && gap < 0.1) gaps.push(gap);
        if (gaps.length === 48) {
          const sorted = [...gaps].sort((a, b) => a - b);
          const fps = Math.round((1 / sorted[24]!) * 1000) / 1000;
          measuredRates.set(video, fps);
          setMeasured(fps);
        }
      }
      last = meta.mediaTime;
      write(meta.mediaTime);
      handle = video.requestVideoFrameCallback!(frame);
    };
    handle = video.requestVideoFrameCallback(frame);
    const seeked = () => write(video.currentTime);
    video.addEventListener('seeked', seeked);
    return () => {
      video.cancelVideoFrameCallback?.(handle);
      video.removeEventListener('seeked', seeked);
      video.removeEventListener('emptied', forget);
    };
  }, [video]);

  useEffect(() => {
    if (video && readout.current) readout.current.textContent = timecode(shown.current, fps);
  }, [fps, video]);

  const stepFrame = (by: -1 | 1) => {
    if (!video || !fps) return;
    video.pause();
    const frame = Math.floor(shown.current * fps + 1e-3) + by;
    // The middle of the frame, so the seek lands inside it whatever the rounding; a second press before the frame
    // draws steps on from there.
    const to = Math.max(0, Math.min((frame + 0.5) / fps, (video.duration || Infinity) - 0.5 / fps));
    shown.current = to;
    video.currentTime = to;
  };

  const chapters = useChapters(video);
  const current = chapters.findIndex((c) => currentTime >= c.start && currentTime < c.end);
  const fpsText = fromStream
    ? say('fpsManifest', {
        fps: format.number(fromStream, { maximumFractionDigits: 3 }),
      })
    : measured
      ? say('fpsMeasured', {
          fps: format.number(measured, { maximumFractionDigits: 3 }),
        })
      : say('fpsUnknown');

  return (
    <div className={'lightline-deck'}>
      <div className={'lightline-deck-line'}>
        <button
          type="button"
          className={'lightline-panel-button'}
          onClick={() => stepFrame(-1)}
          disabled={!fps}
          aria-label={say('frameBack')}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M4 3v10M13 3 6 8l7 5z" />
          </svg>
        </button>
        <span className={'lightline-deck-time'} role="group" aria-label={say('timecode')}>
          <span ref={readout} className={'lightline-deck-readout'}>
            00:00:00:00
          </span>
        </span>
        <button
          type="button"
          className={'lightline-panel-button'}
          onClick={() => stepFrame(1)}
          disabled={!fps}
          aria-label={say('frameForward')}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M12 3v10M3 3l7 5-7 5z" />
          </svg>
        </button>
      </div>
      <p className={'lightline-panel-note'}>{fpsText}</p>

      <fieldset className={'lightline-lab-set'}>
        <legend className={'lightline-lab-label'}>{say('speed')}</legend>
        <div className={'lightline-lab-chips'}>
          {SPEEDS.map((speed) => (
            <label key={speed} className={'lightline-lab-chip'}>
              <input
                type="radio"
                name={`${id}-speed`}
                value={speed}
                checked={rate === speed}
                onChange={() => setRate(speed)}
              />
              <span>{t('rate', { rate: format.number(speed) })}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className={'lightline-lab-set'} role="group" aria-labelledby={`${id}-chapters`}>
        <span id={`${id}-chapters`} className={'lightline-lab-label'}>
          {say('chapters')}
        </span>
        {chapters.length ? (
          <div className={'lightline-deck-pills'}>
            {chapters.map((chapter, index) => (
              <button
                key={`${chapter.start}`}
                type="button"
                className={'lightline-deck-pill'}
                aria-current={index === current ? 'true' : undefined}
                onClick={() => {
                  if (video) video.currentTime = chapter.start;
                }}
              >
                {chapter.text}
              </button>
            ))}
          </div>
        ) : (
          <p className={'lightline-panel-note'}>{say('noChapters')}</p>
        )}
      </div>
    </div>
  );
}

interface Chapter {
  start: number;
  end: number;
  text: string;
}

export function useChapters(video: HTMLVideoElement | null) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  useEffect(() => {
    if (!video) return;
    const read = () => {
      const track = [...video.textTracks].find((t) => t.kind === 'chapters');
      if (!track) return setChapters([]);
      if (track.mode === 'disabled') track.mode = 'hidden';
      const cues = [...(track.cues ?? [])].map((cue) => ({
        start: cue.startTime,
        end: cue.endTime,
        text: (cue as VTTCue).text,
      }));
      setChapters((now) =>
        now.length === cues.length && now.every((c, i) => c.start === cues[i]!.start && c.text === cues[i]!.text) ? now : cues
      );
    };
    read();
    const elements = [...video.querySelectorAll('track')];
    elements.forEach((el) => el.addEventListener('load', read));
    video.textTracks.addEventListener('addtrack', read);
    video.textTracks.addEventListener('change', read);
    return () => {
      elements.forEach((el) => el.removeEventListener('load', read));
      video.textTracks.removeEventListener('addtrack', read);
      video.textTracks.removeEventListener('change', read);
    };
  }, [video]);
  return chapters;
}

/* ---------- Stream telemetry ---------- */

const mbps = (format: Format, bps: number) => format.unit(bps / 1e6, 'megabit-per-second', 2);

function Telemetry() {
  const say = useSay();
  const format = useFormat();
  const lab = useAudioLab();
  const video = lab.media as HTMLVideoElement | null;
  const engine = useEngine();
  const error = usePlayer((s) => s.error);
  const waiting = usePlayer((s) => s.waiting);
  const [stalled, setStalled] = useState(false);
  useTick();

  useEffect(() => {
    if (!video) return;
    const stall = () => setStalled(true);
    const flow = () => setStalled(false);
    video.addEventListener('stalled', stall);
    ['progress', 'playing', 'canplay', 'emptied'].forEach((type) => video.addEventListener(type, flow));
    return () => {
      video.removeEventListener('stalled', stall);
      ['progress', 'playing', 'canplay', 'emptied'].forEach((type) => video.removeEventListener(type, flow));
    };
  }, [video]);

  const none = say('notReported');
  const level = currentLevel(engine);
  const count = engine?.levels?.length ?? 0;
  const codecs = [level?.videoCodec, level?.audioCodec].filter(Boolean).join(', ') || level?.attrs?.CODECS;
  const estimating = engine?.abrController?.bwEstimator?.canEstimate?.();
  const estimate = estimating !== false ? engine?.bandwidthEstimate : undefined;
  const quality = video?.getVideoPlaybackQuality?.();

  let ahead: string = none;
  if (video) {
    const t = video.currentTime;
    for (let i = 0; i < video.buffered.length; i++) {
      if (video.buffered.start(i) <= t + 0.04 && video.buffered.end(i) >= t)
        ahead = format.unit(video.buffered.end(i) - t, 'second', 1);
    }
    if (ahead === none && video.buffered.length) ahead = '0.0 s';
  }

  let net: { text: string; tone?: 'running' | 'missed' } = { text: none };
  if (error || video?.error) net = { text: say('netError'), tone: 'missed' };
  else if (stalled) net = { text: say('netStalled'), tone: 'running' };
  else if (waiting) net = { text: say('netWaiting'), tone: 'running' };
  else if (video) {
    const word = [say('netEmpty'), say('netIdle'), say('netLoading'), say('netNoSource')][video.networkState];
    // Under MediaSource the element reports loading for as long as the stream is attached; it is only blue
    // (running) while the element is short of data to play on.
    const short = video.readyState < 3;
    net =
      video.networkState === 2 && !short
        ? { text: say('netReceiving') }
        : {
            text: word ?? none,
            tone: video.networkState === 2 ? 'running' : undefined,
          };
  }

  const rows: [string, string, string?][] = [
    [
      say('resolution'),
      video?.videoWidth ? `${format.plain(video.videoWidth)} × ${format.plain(video.videoHeight)}` : none,
    ],
    [
      say('rendition'),
      level?.height
        ? say('renditionOf', {
            height: format.plain(level.height),
            index: format.plain((engine?.currentLevel ?? 0) + 1),
            count: format.plain(count),
          })
        : none,
    ],
    [say('bitrate'), level?.bitrate ? mbps(format, level.bitrate) : none],
    [say('codec'), codecs || none],
    [say('bandwidth'), estimate && Number.isFinite(estimate) ? mbps(format, estimate) : none],
    [say('bufferAhead'), ahead],
    [
      say('frames'),
      quality
        ? say('framesOf', {
            dropped: format.plain(quality.droppedVideoFrames),
            total: format.plain(quality.totalVideoFrames),
          })
        : none,
    ],
    [say('network'), net.text, net.tone],
  ];

  return (
    <dl className={'lightline-telemetry'}>
      {rows.map(([label, value, tone]) => (
        <div key={label} className={'lightline-telemetry-row'}>
          <dt>{label}</dt>
          <dd data-tone={tone}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------- The timeline ---------- */

interface Tile {
  url: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The storyboard's cues, from the metadata track the Mux media adds: an image and a region per time. */
function useStoryboard(video: HTMLVideoElement | null) {
  const [cues, setCues] = useState<{ start: number; tile: Tile }[]>([]);
  const [sheet, setSheet] = useState<{
    url: string;
    width: number;
    height: number;
  } | null>(null);
  useEffect(() => {
    if (!video) return;
    const read = () => {
      // The newest storyboard: a host that changes the source in place (the page) leaves the last film's behind.
      const track = [...video.textTracks]
        .reverse()
        .find((t) => t.kind === 'metadata' && [...(t.cues ?? [])].some((c) => (c as VTTCue).text?.includes('#xywh=')));
      const pending = [...video.textTracks].find((t) => t.kind === 'metadata' && t.mode === 'disabled');
      if (!track && pending) pending.mode = 'hidden';
      if (!track) return;
      const list = [...(track.cues ?? [])].flatMap((cue) => {
        const [url, hash] = (cue as VTTCue).text.trim().split('#xywh=');
        const [x, y, w, h] = (hash ?? '').split(',').map(Number);
        return url && w && h ? [{ start: cue.startTime, tile: { url, x: x!, y: y!, w, h } }] : [];
      });
      setCues((now) => (now.length === list.length && now[0]?.tile.url === list[0]?.tile.url ? now : list));
    };
    read();
    const elements = [...video.querySelectorAll('track')];
    elements.forEach((el) => el.addEventListener('load', read));
    video.textTracks.addEventListener('addtrack', read);
    video.textTracks.addEventListener('change', read);
    const timer = setInterval(read, 1500);
    return () => {
      clearInterval(timer);
      elements.forEach((el) => el.removeEventListener('load', read));
      video.textTracks.removeEventListener('addtrack', read);
      video.textTracks.removeEventListener('change', read);
    };
  }, [video]);

  // The sheet's own size, so each tile can be cut from it at the strip's scale.
  const url = cues[0]?.tile.url;
  useEffect(() => {
    if (!url) return;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => setSheet({ url, width: image.naturalWidth, height: image.naturalHeight });
    image.src = url;
  }, [url]);

  return { cues, sheet };
}

/** The ruler's steps, in seconds: the first whose labels stand `RULER_LABEL_PX` apart at the timeline's width. */
const RULER_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
const RULER_LABEL_PX = 80;
/** Room a label needs before the timeline's end, so the last one is never cut. */
const RULER_LABEL_END_PX = 40;

/** The ruler's ticks: a label at every step, and a short tick between at a fifth of it (a half, for 1 and 2 s). */
function rulerTicks(duration: number, width: number) {
  if (!duration || !Number.isFinite(duration) || !width) return [];
  const px = (s: number) => (s / duration) * width;
  const step = RULER_STEPS.find((s) => px(s) >= RULER_LABEL_PX) ?? RULER_STEPS[RULER_STEPS.length - 1]!;
  const parts = step % 5 === 0 ? 5 : 2;
  const every = px(step / parts) >= 6 ? step / parts : step;
  const per = Math.round(step / every);
  const ticks: { t: number; major: boolean; label: boolean }[] = [];
  for (let n = 0; n * every <= duration + 1e-6; n++) {
    const t = n * every;
    const major = n % per === 0;
    ticks.push({ t, major, label: major && px(duration - t) >= RULER_LABEL_END_PX });
  }
  return ticks;
}

/**
 * The timeline, the bottom panel's whole body since the guides moved into the bar: a time ruler, the chapters where
 * they start, the film strip cut from the storyboard, the waveform (played in the beam's light, the rest muted), and
 * the playhead with the film's timecode beside it, all one native slider for the keyboard and the pointer.
 */
function Timeline() {
  const say = useSay();
  const format = useFormat();
  const suite = useSuite();
  const lab = useAudioLab();
  const video = lab.media as HTMLVideoElement | null;
  const engine = useEngine();
  const duration = usePlayer((s) => s.duration);
  const currentTime = usePlayer((s) => s.currentTime);
  const { cues, sheet } = useStoryboard(video);
  const chapters = useChapters(video);
  const root = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const time = useRef<HTMLSpanElement>(null);
  /** The ruler's width and where its labels sit along it, read after each render; the timecode hides those it covers. */
  const ruler = useRef<{ width: number; labels: { el: HTMLElement; left: number; right: number; hidden: boolean }[] }>({
    width: 0,
    labels: [],
  });
  const timeWidth = useRef({ text: '', width: 0 });
  const cover = useRef(() => {});
  const [size, setSize] = useState({ width: 0, height: 0 });
  const peaks = suite.peaks;
  const fps = useRef<number | null>(null);
  fps.current = manifestRate(engine);

  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The playhead follows the frames while the film plays (one write a frame, of a share the CSS places it by); paused,
  // seeking or under reduced motion it moves only when the time does, so there it jumps. The timecode beside it reads
  // as the Timecode panel's, with frames where the stream gives the rate or that panel has measured it. It sits on the
  // ruler, so a label it would cover is hidden while it does, as an editor's ruler does (the words keep their contrast).
  useEffect(() => {
    const el = root.current;
    if (!el || !video) return;
    const still = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const write = () => {
      const d = video.duration;
      const t = video.currentTime;
      const at = d > 0 && Number.isFinite(d) ? Math.min(1, Math.max(0, t / d)) : 0;
      el.style.setProperty('--lightline-at', String(at));
      const badge = time.current;
      if (!badge) return;
      const text = timecode(t, fps.current ?? measuredRates.get(video) ?? null);
      if (badge.textContent !== text) badge.textContent = text;
      // Its width is read again only when its text's length changes, so a frame's write reads no layout.
      if (timeWidth.current.text.length !== text.length) timeWidth.current = { text, width: badge.offsetWidth };
      const from = at * ruler.current.width - at * timeWidth.current.width - 4;
      const to = from + timeWidth.current.width + 8;
      for (const label of ruler.current.labels) {
        const hidden = label.right > from && label.left < to;
        if (hidden !== label.hidden) label.el.toggleAttribute('data-covered', (label.hidden = hidden));
      }
    };
    cover.current = write;
    const tick = () => {
      write();
      frame = requestAnimationFrame(tick);
    };
    const run = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      write();
      if (!video.paused && !still.matches) frame = requestAnimationFrame(tick);
    };
    const step = () => frame || write();
    run();
    const runs = ['play', 'playing', 'pause', 'ended', 'emptied'];
    const steps = ['timeupdate', 'seeked', 'durationchange', 'loadedmetadata'];
    runs.forEach((type) => video.addEventListener(type, run));
    steps.forEach((type) => video.addEventListener(type, step));
    still.addEventListener('change', run);
    return () => {
      cancelAnimationFrame(frame);
      runs.forEach((type) => video.removeEventListener(type, run));
      steps.forEach((type) => video.removeEventListener(type, step));
      still.removeEventListener('change', run);
    };
  }, [video]);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    ruler.current = {
      width: el.clientWidth,
      labels: [...el.querySelectorAll<HTMLElement>('.lightline-timeline-tick-label')].map((label) => {
        const left = (label.parentElement?.offsetLeft ?? 0) + label.offsetLeft;
        return { el: label, left, right: left + label.offsetWidth, hidden: label.hasAttribute('data-covered') };
      }),
    };
    cover.current();
    // The chapter the film is in reads whole; the names it runs over are hidden, their hairlines kept.
    const current = el.querySelector('.lightline-timeline-chapter[data-current]');
    const reach = current?.firstElementChild?.getBoundingClientRect().right ?? -Infinity;
    const after = current?.getBoundingClientRect().left ?? Infinity;
    for (const chapter of el.querySelectorAll('.lightline-timeline-chapter')) {
      const left = chapter.getBoundingClientRect().left;
      chapter.firstElementChild?.toggleAttribute('data-covered', chapter !== current && left > after && left < reach + 2);
    }
  });

  const { width, height } = size;
  const tiles = useMemo(() => {
    if (!cues.length || !width || !height || !duration) return [];
    const first = cues[0]!.tile;
    const tileWidth = (height * first.w) / first.h;
    // Tiles at the strip's height, cut from the middle of each frame where the strip is narrow, so it always shows
    // the film's course: never wider than 1.2 to 1 short of the frame's own shape.
    const count = Math.max(1, Math.round(width / tileWidth), Math.round(width / (1.2 * height)));
    return Array.from({ length: count }, (_, i) => {
      const t = ((i + 0.5) / count) * duration;
      let cue = cues[0]!;
      for (const c of cues) if (c.start <= t) cue = c;
      return { key: i, tile: cue.tile, width: width / count };
    });
  }, [cues, width, height, duration]);

  // The waveform: a filled outline, mirrored about its middle, over the share of the film the peaks cover.
  const wave = useMemo(() => {
    if (!peaks || !peaks.peaks.length) return null;
    const columns = Math.min(peaks.peaks.length, 800);
    const per = peaks.peaks.length / columns;
    const tops: string[] = [];
    const bottoms: string[] = [];
    for (let i = 0; i < columns; i++) {
      let peak = 0;
      for (let j = Math.floor(i * per); j < Math.floor((i + 1) * per); j++) peak = Math.max(peak, peaks.peaks[j]!);
      // A floor of 5% of the height, so the quietest stretch still reads as a line across the timeline's width.
      const half = Math.max(peak, 0.05) * 0.5;
      tops.push(`${i},${(0.5 - half).toFixed(4)}`);
      bottoms.unshift(`${i},${(0.5 + half).toFixed(4)}`);
    }
    return { columns, path: `M${tops.join('L')}L${bottoms.join('L')}Z` };
  }, [peaks]);

  const ticks = useMemo(() => rulerTicks(duration, width), [duration, width]);
  const share = peaks && duration ? Math.min(1, peaks.duration / duration) : 1;
  const span = (from: number, to: number) => ({
    insetInlineStart: `${(from / duration) * 100}%`,
    inlineSize: `${((to - from) / duration) * 100}%`,
  });
  const waveform = (className: string) =>
    wave && (
      <svg
        className={className}
        viewBox={`0 0 ${wave.columns} 1`}
        preserveAspectRatio="none"
        style={{ inlineSize: `${share * 100}%` }}
        focusable="false"
      >
        <path d={wave.path} />
      </svg>
    );

  return (
    <div ref={root} className={'lightline-timeline'}>
      <div className={'lightline-timeline-ruler'} aria-hidden="true">
        {duration > 0 &&
          ticks.map(({ t, major, label }) => (
            <span
              key={t}
              className={'lightline-timeline-tick'}
              data-major={major ? '' : undefined}
              style={{ insetInlineStart: `${(t / duration) * 100}%` }}
            >
              {label && <span className={'lightline-timeline-tick-label'}>{format.clock(t)}</span>}
            </span>
          ))}
      </div>
      <div className={'lightline-timeline-chapters'} aria-hidden="true">
        {duration > 0 &&
          chapters.map((chapter) => (
            <span
              key={chapter.start}
              className={'lightline-timeline-chapter'}
              data-current={currentTime >= chapter.start && currentTime < chapter.end ? '' : undefined}
              style={span(chapter.start, Math.min(chapter.end, duration))}
            >
              <span className={'lightline-timeline-chapter-name'}>{chapter.text}</span>
            </span>
          ))}
      </div>
      <div ref={strip} className={'lightline-timeline-strip'} aria-hidden="true">
        {sheet &&
          tiles.map(({ key, tile, width: w }) => {
            const scale = height / tile.h;
            return (
              <span
                key={key}
                className={'lightline-timeline-tile'}
                style={{
                  inlineSize: `${w}px`,
                  backgroundImage: `url("${tile.url}")`,
                  backgroundSize: `${sheet.width * scale}px ${sheet.height * scale}px`,
                  backgroundPosition: `${-tile.x * scale - (tile.w * scale - w) / 2}px ${-tile.y * scale}px`,
                }}
              />
            );
          })}
      </div>
      <div className={'lightline-timeline-wave'} aria-hidden="true">
        {waveform('lightline-timeline-wave-rest')}
        {wave && <div className={'lightline-timeline-played'}>{waveform('lightline-timeline-wave-played')}</div>}
        {peaks?.silent && <span className={'lightline-timeline-note'}>{say('silent')}</span>}
        {!peaks && <span className={'lightline-timeline-note'}>{say('noPeaks')}</span>}
      </div>
      <span className={'lightline-timeline-head'} aria-hidden="true" />
      <span ref={time} className={'lightline-timeline-time'} aria-hidden="true" />
      <input
        className={'lightline-timeline-input'}
        type="range"
        min={0}
        max={Math.max(duration || 0, 0)}
        step={1}
        value={Math.min(currentTime || 0, duration || 0)}
        aria-label={say('timeline')}
        aria-valuetext={say('timelineValue', {
          time: format.clock(currentTime),
          duration: format.length(duration),
        })}
        onChange={(event) => {
          if (video) video.currentTime = Number(event.currentTarget.value);
        }}
      />
    </div>
  );
}

/** The guides the viewer turned on, drawn as thin lines over the picture itself (not its letterbox). */
export function GuidesOverlay() {
  const suite = useSuite();
  const lab = useAudioLab();
  const video = lab.media as HTMLVideoElement | null;
  const on = suite.active && Object.values(suite.guides).some(Boolean);
  const [box, setBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    if (!video || !on) return;
    const measure = () => {
      const vw = video.videoWidth || 16;
      const vh = video.videoHeight || 9;
      const ew = video.clientWidth;
      const eh = video.clientHeight;
      const scale = Math.min(ew / vw, eh / vh);
      const width = vw * scale;
      const height = vh * scale;
      // The overlay shares the picture's area with the video, so the offsets are the letterbox's alone.
      setBox({ left: (ew - width) / 2, top: (eh - height) / 2, width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(video);
    video.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      video.removeEventListener('resize', measure);
    };
  }, [video, on]);

  if (!on || !box) return null;
  const { width: w, height: h } = box;
  const g = suite.guides;
  const lines: [number, number, number, number][] = [];
  const rect = (inset: number) => {
    const x = w * inset;
    const y = h * inset;
    lines.push([x, y, w - x, y], [w - x, y, w - x, h - y], [w - x, h - y, x, h - y], [x, h - y, x, y]);
  };
  if (g.action) rect(0.05);
  if (g.title) rect(0.1);
  if (g.scope && w / 2.39 < h) {
    const y = (h - w / 2.39) / 2;
    lines.push([0, y, w, y], [0, h - y, w, h - y]);
  }
  if (g.vertical) {
    const x = (w - (h * 9) / 16) / 2;
    lines.push([x, 0, x, h], [w - x, 0, w - x, h]);
  }
  if (g.thirds)
    lines.push(
      [w / 3, 0, w / 3, h],
      [(2 * w) / 3, 0, (2 * w) / 3, h],
      [0, h / 3, w, h / 3],
      [0, (2 * h) / 3, w, (2 * h) / 3]
    );

  return (
    <svg
      className={'lightline-guides'}
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${w} ${h}`}
      style={{ left: box.left, top: box.top, width: w, height: h }}
    >
      {['lightline-guides-under', 'lightline-guides-line'].map((layer) => (
        <g key={layer} className={cn(layer)}>
          {lines.map(([x1, y1, x2, y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
          ))}
        </g>
      ))}
    </svg>
  );
}
