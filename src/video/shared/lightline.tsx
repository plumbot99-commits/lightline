/** @jsxImportSource react */

import { usePlayer } from '@videojs/react/video';
import { useEffect, useRef, useState } from 'react';

import { useViewing } from './viewing';
import { filmVideo } from './film-video';

/**
 * Lightline: the player's state as light. One layer over the picture names the state in `data-state`; the
 * skin's CSS reads it to dim the picture to an orange glow on pause, light the end green, and flicker magenta
 * once on an error. While the film plays, its own light spills past the frame: the layer samples the
 * picture's average color at a low rate into `--lightline-ambient` on the container, whose shadow is the glow. The
 * same sample, split into its four quadrants, lights the Suite's room (`--lightline-room-tl` to `-br`) where a host
 * asks for it; in the Suite the glow past the frame is off. The viewer sets how far that light reaches in the
 * settings menu; turned off, nothing samples. Decorative only: the status announcer already speaks every state change.
 */
type LightState = 'idle' | 'playing' | 'paused' | 'ended' | 'error';

/** How often the ambient glow samples the picture while the film plays, and the sample's size. */
const AMBIENT_EVERY_MS = 800;
const SAMPLE_W = 16;
const SAMPLE_H = 9;
/** Channel steps the sampled color is rounded to, so near-identical frames leave the glow alone. */
const AMBIENT_STEP = 12;
/** How far the sampled color is pushed away from gray. */
const AMBIENT_SATURATE = 1.8;
/** The room's four corners, each lit by its quadrant of the sample: [property, columns from, rows from]. */
const CORNERS = [
  ['--lightline-room-tl', 0, 0],
  ['--lightline-room-tr', 1, 0],
  ['--lightline-room-bl', 0, 1],
  ['--lightline-room-br', 1, 1],
] as const;

export function Lightline() {
  const ref = useRef<HTMLDivElement>(null);
  const state = usePlayer((s): LightState => {
    if (s.error) return 'error';
    if (s.ended) return 'ended';
    if (s.paused) return s.started ? 'paused' : 'idle';
    return 'playing';
  });
  const playing = state === 'playing';
  const spill = useViewing().ambient !== 'off';

  useEffect(() => {
    const root = ref.current?.parentElement;
    const video = filmVideo(root);
    if (!root || !video || !playing || !spill) return;
    // Under reduced motion the glow is a still: the CSS holds a fixed color and nothing samples.
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE_W;
    canvas.height = SAMPLE_H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    let last = '';
    const round = (v: number) => Math.min(255, Math.max(0, Math.round(v / AMBIENT_STEP) * AMBIENT_STEP));
    // In the Suite the film's light goes nowhere past the frame unless a host lights the room with it (suite.css), so
    // there nothing is read.
    const lit = () =>
      root.dataset.layout !== 'suite' ||
      parseFloat(getComputedStyle(root).getPropertyValue('--lightline-room-light')) > 0;
    const sample = () => {
      if (video.readyState < 2 || !lit()) return;
      try {
        ctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
        const px = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
        // The average of a frame is muddy; light is not. Lift the hue away from gray and carry it at full
        // brightness; the luminance says how far the light reaches.
        const light = (x0: number, x1: number, y0: number, y1: number) => {
          let r = 0;
          let g = 0;
          let b = 0;
          let n = 0;
          for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
              const i = (y * SAMPLE_W + x) * 4;
              r += px[i]!;
              g += px[i + 1]!;
              b += px[i + 2]!;
              n++;
            }
          }
          const [ar, ag, ab] = [r / n, g / n, b / n];
          const gray = (ar + ag + ab) / 3;
          const [sr, sg, sb] = [ar, ag, ab].map((c) => Math.max(0, gray + (c - gray) * AMBIENT_SATURATE));
          const peak = Math.max(sr!, sg!, sb!, 1);
          const rgb = `${round((sr! / peak) * 255)} ${round((sg! / peak) * 255)} ${round((sb! / peak) * 255)}`;
          const level = Math.round(((0.2126 * ar + 0.7152 * ag + 0.0722 * ab) / 255) * 20) / 20;
          return { rgb, level };
        };
        const whole = light(0, SAMPLE_W, 0, SAMPLE_H);
        const color = `rgb(${whole.rgb})`;
        const level = whole.level.toFixed(2);
        // The quadrants share the sample's middle row (nine rows do not halve). A dark quadrant lights its corner
        // faintly: its hue is carried at the strength its luminance gives, so the hue of a near-black corner is
        // not blown up into a color it never had.
        const halfW = SAMPLE_W / 2;
        const halfH = Math.floor(SAMPLE_H / 2);
        const corners = CORNERS.map(([name, cx, cy]) => {
          const q = light(cx * halfW, (cx + 1) * halfW, cy * halfH, cy ? SAMPLE_H : halfH + 1);
          return [name, `rgb(${q.rgb} / ${Math.min(1, 0.2 + q.level * 1.6).toFixed(2)})`] as const;
        });
        const next = `${color} ${level} ${corners.map(([, c]) => c).join(' ')}`;
        if (next !== last) {
          root.style.setProperty('--lightline-ambient', color);
          root.style.setProperty('--lightline-ambient-level', level);
          for (const [name, corner] of corners) root.style.setProperty(name, corner);
          last = next;
        }
      } catch {
        // A picture the page may not read (cross-origin without CORS): keep the fixed glow.
        clearInterval(timer);
      }
    };
    sample();
    const timer = setInterval(sample, AMBIENT_EVERY_MS);
    return () => clearInterval(timer);
  }, [playing, spill]);

  return <div ref={ref} className={'lightline-light'} data-state={state} aria-hidden="true" />;
}

/**
 * The beam's light on the rail: a short trail behind the playhead, the green sweep at the end, and a flare
 * at each scene cut the playhead passes in play. A seek that jumps over a cut does not flare it.
 */
export function BeamLight() {
  return (
    <>
      <span className={'lightline-beam-trail'} aria-hidden="true" />
      <span className={'lightline-beam-sweep'} aria-hidden="true" />
      <CutFlares />
    </>
  );
}

/** The longest step between two time updates still counted as play rather than a seek, in seconds. */
const MAX_PLAY_STEP = 1.5;

function CutFlares() {
  const cues = usePlayer((s) => s.chaptersCues);
  const duration = usePlayer((s) => s.duration);
  const currentTime = usePlayer((s) => s.currentTime);
  const moving = usePlayer((s) => !s.paused && !s.seeking);
  const previous = useRef(currentTime);
  const nextId = useRef(0);
  const [flares, setFlares] = useState<{ id: number; at: number }[]>([]);

  useEffect(() => {
    const from = previous.current;
    previous.current = currentTime;
    const step = currentTime - from;
    if (!moving || !duration || step <= 0 || step > MAX_PLAY_STEP) return;
    const passed = cues.filter((cue) => cue.startTime > 0 && from < cue.startTime && cue.startTime <= currentTime);
    if (!passed.length) return;
    setFlares((shown) => [
      ...shown.slice(-3),
      ...passed.map((cue) => ({ id: ++nextId.current, at: (cue.startTime / duration) * 100 })),
    ]);
  }, [currentTime, cues, duration, moving]);

  return flares.map((flare) => (
    <span
      key={flare.id}
      className={'lightline-cut-flare'}
      style={{ left: `${flare.at}%` }}
      aria-hidden="true"
      onAnimationEnd={() => setFlares((shown) => shown.filter((f) => f.id !== flare.id))}
    />
  ));
}
