/** @jsxImportSource react */

import { Menu } from '@videojs/react';
import { usePlayer } from '@videojs/react/video';
import { type PointerEvent, useEffect, useId, useMemo, useRef, useState } from 'react';

import type { TextKey } from '@/i18n/en';
import { type Format, type Translate, useFormat, useText } from '@/i18n/i18n';
import { cn } from '@/lib/resolve-class-name';
import { AudioLabIcon, ChevronIcon as ChevronIconPrimitive } from '@/video/icons';

import { BANDS, curveDb, GAIN_LIMIT, logFrequencies, OUTPUTS, PRESETS } from '../audio/engine';
import { useAudioLab } from '../audio/lab';
import { useSuite } from '../suite/suite';
import { Button } from './button';
import { ButtonTooltip } from './tooltip';

// The Audio Lab's face: its button beside the volume, the glass popover it opens, and its row in Settings when
// the player is narrow. The sound itself is in ../audio.

/** Each preset's and each output's word in the skin's text (`src/i18n/en.ts`). */
const PRESET_WORD: Record<string, TextKey> = {
  flat: 'lab.flat',
  cinema: 'lab.cinema',
  dialogue: 'lab.dialogue',
  music: 'lab.music',
  'late-night': 'lab.lateNight',
  custom: 'lab.custom',
};
const OUTPUT_WORD: Record<string, TextKey> = {
  stereo: 'lab.stereo',
  mono: 'lab.mono',
  wide: 'lab.wide',
};

/** A band's name for a screen reader (60 Hz, 1 kHz) and its mark on the axis (60, 1k), in the locale's numbers. */
const bandName = (t: Translate, format: Format, freq: number) =>
  freq < 1000 ? t('lab.hz', { value: format.plain(freq) }) : t('lab.khz', { value: format.number(freq / 1000) });
const bandMark = (format: Format, freq: number) =>
  freq < 1000 ? format.plain(freq) : `${format.number(freq / 1000)}k`;

/** The lab's button beside the volume, on wide players, and the popover it opens (also opened from Settings). */
export function AudioLabControl() {
  const lab = useAudioLab();
  const suite = useSuite();
  const t = useText();
  const id = `lightline-lab-${useId().replace(/:/g, '')}`;
  // In the Suite the lab is a panel beside the frame; the bar keeps its button only while that panel is closed.
  if (!lab.available || (suite.active && suite.layout.panels.lab.open)) return null;
  const changed = lab.settings.preset !== 'flat' || lab.settings.output !== 'stereo' || lab.settings.balance !== 0;

  return (
    <>
      {!lab.narrow && (
        <ButtonTooltip label={t('lab.title')}>
          <Button
            className={'lightline-lab-button'}
            aria-label={t('lab.title')}
            aria-expanded={lab.open}
            popoverTarget={id}
            data-changed={changed ? '' : undefined}
            onClick={(event) => {
              lab.opener.current = event.currentTarget;
              lab.start();
            }}
          >
            <AudioLabIcon className={'media-button-icon'} />
          </Button>
        </ButtonTooltip>
      )}
      <LabPopover id={id} />
    </>
  );
}

/** Settings' row for the lab, on narrow players, where the lab's button leaves the bar. */
export function AudioLabMenuItem() {
  const lab = useAudioLab();
  const t = useText();
  if (!lab.available || !lab.narrow) return null;
  const hint = t(PRESET_WORD[lab.settings.preset] ?? 'lab.custom');

  return (
    <Menu.Item
      className={'media-menu-item'}
      onSelect={() => {
        lab.start();
        // The menu closes and gives focus back to its button first; the lab opens from there.
        const settings = lab.container?.querySelector<HTMLElement>('.video-controls-row button[aria-haspopup="menu"]');
        setTimeout(() => lab.setOpen(true, settings), 0);
      }}
    >
      <AudioLabIcon className={'media-menu-trigger-icon'} />
      <span>{t('lab.title')}</span>
      <span className={'media-menu-hint'}>
        <span className={'media-menu-hint-label'}>{hint}</span>
        <ChevronIconPrimitive className={'media-menu-forward-chevron'} />
      </span>
    </Menu.Item>
  );
}

/**
 * Above its opener, centered on it and kept inside the viewport; below it when there is more room there. The
 * width is fixed in CSS, so the place is known before the popover draws.
 */
function place(panel: HTMLElement, anchor: HTMLElement) {
  const a = anchor.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const edge = 8;
  const gap = 8;
  const width = Math.min(parseFloat(getComputedStyle(panel).width) || 320, vw - edge * 2);
  const left = Math.min(Math.max(a.left + a.width / 2 - width / 2, edge), vw - width - edge);
  const above = a.top - gap - edge;
  const below = vh - a.bottom - gap - edge;
  const up = above >= 420 || above >= below;
  panel.style.left = `${left}px`;
  panel.style.maxHeight = `${Math.max(up ? above : below, 160)}px`;
  panel.style.top = up ? 'auto' : `${a.bottom + gap}px`;
  panel.style.bottom = up ? `${vh - a.top + gap}px` : 'auto';
}

function LabPopover({ id }: { id: string }) {
  const lab = useAudioLab();
  const t = useText();
  const ref = useRef<HTMLDivElement>(null);
  const requestControlsLock = usePlayer((s) => s.requestControlsLock);
  const { open, setOpen, opener } = lab;

  // The popover's own state is the truth (Escape and a click outside close it natively); the lab follows it.
  useEffect(() => {
    const panel = ref.current;
    if (!panel) return;
    const before = (event: Event) => {
      const anchor = opener.current;
      if ((event as ToggleEvent).newState === 'open' && anchor) place(panel, anchor);
    };
    const toggle = (event: Event) => {
      const now = (event as ToggleEvent).newState === 'open';
      setOpen(now);
      if (now) panel.querySelector<HTMLElement>('input:checked, input, button')?.focus();
      else if (document.activeElement === document.body || panel.contains(document.activeElement))
        opener.current?.focus();
    };
    // The player's hotkeys stay out of the lab: its arrows move its own controls.
    const keys = (event: globalThis.KeyboardEvent) => event.stopPropagation();
    panel.addEventListener('beforetoggle', before);
    panel.addEventListener('toggle', toggle);
    panel.addEventListener('keydown', keys);
    return () => {
      panel.removeEventListener('beforetoggle', before);
      panel.removeEventListener('toggle', toggle);
      panel.removeEventListener('keydown', keys);
    };
  }, [setOpen, opener]);

  useEffect(() => {
    const panel = ref.current;
    if (!panel) return;
    const shown = panel.matches(':popover-open');
    if (open && !shown) panel.showPopover();
    if (!open && shown) panel.hidePopover();
  }, [open]);

  // While the lab is open the controls stay up, and it follows its opener when the page moves.
  useEffect(() => {
    if (!open) return;
    const release = requestControlsLock();
    const follow = () => ref.current && opener.current && place(ref.current, opener.current);
    window.addEventListener('resize', follow);
    return () => {
      release();
      window.removeEventListener('resize', follow);
    };
  }, [open, requestControlsLock, opener]);

  return (
    <div
      ref={ref}
      id={id}
      popover="auto"
      role="dialog"
      aria-labelledby={`${id}-title`}
      className={cn('media-popup', 'lightline-lab')}
    >
      <div id={`${id}-title`} className={'lightline-lab-title'}>
        {t('lab.title')}
      </div>
      <LabPanel id={id} />
    </div>
  );
}

/** The lab's controls and its meter: in the popover, or as a panel in the Suite with its meters standing tall. */
export function LabPanel({ id, tall = false }: { id: string; tall?: boolean }) {
  const lab = useAudioLab();
  const { settings } = lab;
  const muted = usePlayer((s) => s.muted);
  const volume = usePlayer((s) => s.volume);
  const level = muted ? 0 : volume;
  const t = useText();
  const format = useFormat();
  const balance = Math.round(settings.balance * 100);
  const balanceText =
    balance === 0
      ? t('lab.center')
      : t(balance < 0 ? 'lab.balanceLeft' : 'lab.balanceRight', {
          percent: format.percent(Math.abs(balance) / 100),
        });

  return (
    <>
      <fieldset className={'lightline-lab-set'}>
        <legend className={'lightline-lab-label'}>{t('lab.preset')}</legend>
        <div className={'lightline-lab-chips'}>
          {PRESETS.map((preset) => (
            <label key={preset.value} className={'lightline-lab-chip'}>
              <input
                type="radio"
                name={`${id}-preset`}
                value={preset.value}
                checked={settings.preset === preset.value}
                onChange={() => lab.setPreset(preset.value)}
              />
              <span>{t(PRESET_WORD[preset.value]!)}</span>
            </label>
          ))}
          {settings.preset === 'custom' && (
            <label className={'lightline-lab-chip'}>
              <input type="radio" name={`${id}-preset`} value="custom" checked readOnly />
              <span>{t('lab.custom')}</span>
            </label>
          )}
        </div>
      </fieldset>

      <EqCurve />

      <fieldset className={'lightline-lab-set'}>
        <legend className={'lightline-lab-label'}>{t('lab.output')}</legend>
        <div className={'lightline-lab-chips'}>
          {OUTPUTS.map((output) => (
            <label key={output.value} className={'lightline-lab-chip'}>
              <input
                type="radio"
                name={`${id}-output`}
                value={output.value}
                checked={settings.output === output.value}
                onChange={() => lab.setOutput(output.value)}
              />
              <span>{t(OUTPUT_WORD[output.value]!)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className={'lightline-lab-line'}>
        <label className={'lightline-lab-label'} htmlFor={`${id}-balance`}>
          {t('lab.balance')}
        </label>
        <span className={'lightline-lab-side'} aria-hidden="true">
          {t('lab.sideLeft')}
        </span>
        <input
          id={`${id}-balance`}
          className={'lightline-lab-balance'}
          type="range"
          min={-100}
          max={100}
          step={5}
          value={balance}
          aria-valuetext={balanceText}
          onChange={(event) => lab.setBalance(Number(event.currentTarget.value) / 100)}
          onDoubleClick={() => lab.setBalance(0)}
        />
        <span className={'lightline-lab-side'} aria-hidden="true">
          {t('lab.sideRight')}
        </span>
        <output className={'lightline-lab-value'} htmlFor={`${id}-balance`}>
          {balanceText}
        </output>
      </div>

      <div className={'lightline-lab-line'} role="group" aria-labelledby={`${id}-test`}>
        <span id={`${id}-test`} className={'lightline-lab-label'}>
          {t('lab.speakers')}
        </span>
        {(['L', 'R'] as const).map((side, index) => (
          <button
            key={side}
            type="button"
            className={'lightline-lab-test'}
            onClick={() => {
              lab.start();
              lab.engine?.ping(index as 0 | 1, level);
            }}
          >
            {t(side === 'L' ? 'lab.testLeft' : 'lab.testRight')}
          </button>
        ))}
        {level === 0 && <span className={'lightline-lab-value'}>{t(muted ? 'lab.muted' : 'lab.volumeOff')}</span>}
      </div>

      <Meter tall={tall} />
    </>
  );
}

/** The plot's range: a little past the bands' reach, so a node at the limit still sits inside. */
const DB_RANGE = 15;
const PLOT = { width: 300, height: 120, pad: 0.08 } as const;
const FREQS = logFrequencies(121);
const xOf = (freq: number) => Math.log10(freq / 20) / 3;
const yOf = (db: number) => 0.5 - (Math.max(-DB_RANGE, Math.min(DB_RANGE, db)) / DB_RANGE) * (0.5 - PLOT.pad);
const dbAt = (y: number) => ((0.5 - y) / (0.5 - PLOT.pad)) * DB_RANGE;

/**
 * The five bands as a lit curve, drawn from the filters' own response, with a node on each band: drag it, or
 * focus it and use the arrows (Shift or Page Up and Down for 3 dB, Home for 0).
 */
function EqCurve() {
  const lab = useAudioLab();
  const t = useText();
  const format = useFormat();
  const { gains } = lab.settings;
  const plot = useRef<HTMLDivElement>(null);
  const rate = lab.engine?.context.sampleRate;

  const path = useMemo(() => {
    const curve = curveDb(gains, FREQS, rate);
    return Array.from(FREQS, (freq, i) => {
      const x = (xOf(freq) * PLOT.width).toFixed(1);
      const y = (yOf(curve[i]!) * PLOT.height).toFixed(1);
      return `${i ? 'L' : 'M'}${x} ${y}`;
    }).join('');
  }, [gains, rate]);
  const zero = (yOf(0) * PLOT.height).toFixed(1);

  const drag = (event: PointerEvent<HTMLElement>, band: number) => {
    const box = plot.current?.getBoundingClientRect();
    if (!box) return;
    lab.setGain(band, Math.round(dbAt((event.clientY - box.top) / box.height)));
  };

  // The lab keeps its keydown from the player's hotkeys (see LabPopover), so React never sees it: the nodes
  // listen natively, each through the latest handler.
  const onNodeKey = useRef<(event: KeyboardEvent, band: number) => void>(() => undefined);
  onNodeKey.current = (event, band) => {
    const step = event.shiftKey ? 3 : 1;
    const moves: Record<string, (now: number) => number> = {
      ArrowUp: (now) => now + step,
      ArrowRight: (now) => now + step,
      ArrowDown: (now) => now - step,
      ArrowLeft: (now) => now - step,
      PageUp: (now) => now + 3,
      PageDown: (now) => now - 3,
      Home: () => 0,
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    lab.setGain(band, move);
  };
  useEffect(() => {
    const nodes = [...(plot.current?.querySelectorAll<HTMLElement>('.lightline-lab-node') ?? [])];
    const offs = nodes.map((node, band) => {
      const listen = (event: KeyboardEvent) => onNodeKey.current(event, band);
      node.addEventListener('keydown', listen);
      return () => node.removeEventListener('keydown', listen);
    });
    return () => offs.forEach((off) => off());
  }, []);

  return (
    <div className={'lightline-lab-eq'}>
      <div className={'lightline-lab-label'} aria-hidden="true">
        {t('lab.equalizer')}
      </div>
      <div ref={plot} className={'lightline-lab-plot'}>
        <svg
          className={'lightline-lab-curve'}
          viewBox={`0 0 ${PLOT.width} ${PLOT.height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <line className={'lightline-lab-zero'} x1="0" x2={PLOT.width} y1={zero} y2={zero} />
          {BANDS.map((band) => (
            <line
              key={band.freq}
              className={'lightline-lab-band'}
              x1={xOf(band.freq) * PLOT.width}
              x2={xOf(band.freq) * PLOT.width}
              y1="0"
              y2={PLOT.height}
            />
          ))}
          <path className={'lightline-lab-fill'} d={`${path}L${PLOT.width} ${zero}L0 ${zero}Z`} />
          <path className={'lightline-lab-line-curve'} d={path} />
        </svg>
        {BANDS.map((band, i) => {
          const db = gains[i]!;
          return (
            <div
              key={band.freq}
              role="slider"
              tabIndex={0}
              className={'lightline-lab-node'}
              style={{
                left: `${xOf(band.freq) * 100}%`,
                top: `${yOf(db) * 100}%`,
              }}
              aria-label={bandName(t, format, band.freq)}
              aria-orientation="vertical"
              aria-valuemin={-GAIN_LIMIT}
              aria-valuemax={GAIN_LIMIT}
              aria-valuenow={db}
              aria-valuetext={t('lab.db', { value: format.signed(db) })}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                event.currentTarget.focus();
                drag(event, i);
              }}
              onPointerMove={(event) => event.currentTarget.hasPointerCapture(event.pointerId) && drag(event, i)}
              onDoubleClick={() => lab.setGain(i, 0)}
            />
          );
        })}
      </div>
      <div className={'lightline-lab-bands'} aria-hidden="true">
        {BANDS.map((band, i) => (
          <span key={band.freq} style={{ left: `${xOf(band.freq) * 100}%` }}>
            <span className={'lightline-lab-band-freq'}>{bandMark(format, band.freq)}</span>
            <span className={'lightline-lab-band-gain'}>{format.signed(gains[i]!)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Below this the meter reads empty. */
const FLOOR_DB = -48;

const toDb = (amplitude: number) => (amplitude > 0 ? 20 * Math.log10(amplitude) : -Infinity);
const toFill = (db: number) => Math.max(0, Math.min(1, (db - FLOOR_DB) / -FLOOR_DB));

/**
 * Left and right levels in the text color, the held peak in cyan, a clip as a word. It runs only while the
 * film plays with the lab open; under reduced motion the bars hold still and a slow numeric readout takes over.
 */
function Meter({ tall = false }: { tall?: boolean }) {
  const lab = useAudioLab();
  const paused = usePlayer((s) => s.paused);
  const engine = lab.engine;
  // In the popover the meter runs while the lab is open; in the Suite's panel, while the panel shows.
  const running = (tall || lab.open) && !paused && engine !== null;
  const fills = useRef<(HTMLElement | null)[]>([]);
  const peaks = useRef<(HTMLElement | null)[]>([]);
  const [clip, setClip] = useState(false);
  const [levels, setLevels] = useState<[number, number] | null>(null);
  const t = useText();
  const format = useFormat();
  const sayDb = (db: number) =>
    db < FLOOR_DB
      ? t('lab.under', { db: t('lab.db', { value: format.signed(FLOOR_DB) }) })
      : t('lab.db', { value: format.signed(Math.round(db)) });

  useEffect(() => {
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const show = (side: number, fill: number, peak: number) => {
      const bar = fills.current[side];
      const tick = peaks.current[side];
      if (bar) bar.style.transform = tall ? `scaleY(${fill})` : `scaleX(${fill})`;
      if (tick) {
        tick.style[tall ? 'insetBlockEnd' : 'insetInlineStart'] = `${peak * 100}%`;
        tick.style.opacity = peak > 0 ? '1' : '0';
      }
    };
    if (!running || !engine) {
      [0, 1].forEach((side) => show(side, 0, 0));
      setClip(false);
      return;
    }

    const { pre, post } = engine.taps;
    const samples = new Float32Array(post[0].fftSize);
    const measure = (analyser: AnalyserNode) => {
      analyser.getFloatTimeDomainData(samples);
      let peak = 0;
      let sum = 0;
      for (const s of samples) {
        peak = Math.max(peak, Math.abs(s));
        sum += s * s;
      }
      return { peak, rms: Math.sqrt(sum / samples.length) };
    };

    const held = [0, 0];
    const heldAt = [0, 0];
    let clipUntil = 0;
    const tick = (now: number) => {
      if (pre.some((analyser) => measure(analyser).peak > 1)) clipUntil = now + 1500;
      setClip(now < clipUntil);
      return post.map((analyser, side) => {
        const { peak, rms } = measure(analyser);
        const peakFill = toFill(toDb(peak));
        if (peakFill >= held[side]! || now - heldAt[side]! > 1000) {
          held[side] = peakFill;
          heldAt[side] = now;
        }
        if (!still) show(side, toFill(toDb(rms)), held[side]!);
        return toDb(peak);
      });
    };

    let lastText = 0;
    let frame = 0;
    const loop = (now: number) => {
      const levels = tick(now);
      if (now - lastText >= 1000) {
        lastText = now;
        setLevels([levels[0]!, levels[1]!]);
      }
      if (!still) frame = requestAnimationFrame(loop);
    };
    if (still) {
      const timer = setInterval(() => loop(performance.now()), 1000);
      return () => clearInterval(timer);
    }
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [running, engine, tall]);

  return (
    <div className={cn('lightline-lab-meter', tall && 'lightline-lab-meter-tall')}>
      <div className={'lightline-lab-label'}>{t('lab.level')}</div>
      <div className={'lightline-lab-bars'} aria-hidden="true">
        {(['L', 'R'] as const).map((side, i) => (
          <div key={side} className={'lightline-lab-bar'}>
            <span className={'lightline-lab-side'}>{t(side === 'L' ? 'lab.sideLeft' : 'lab.sideRight')}</span>
            <span className={'lightline-lab-track'}>
              <span className={'lightline-lab-level'} ref={(el) => void (fills.current[i] = el)} />
              <span className={'lightline-lab-peak'} ref={(el) => void (peaks.current[i] = el)} />
            </span>
          </div>
        ))}
      </div>
      <p className={'lightline-lab-readout'}>
        {running && levels ? t('lab.levels', { left: sayDb(levels[0]), right: sayDb(levels[1]) }) : t('lab.idle')}
      </p>
      <span className={'lightline-lab-clip'} hidden={!clip}>
        {t('lab.clip')}
      </span>
    </div>
  );
}
