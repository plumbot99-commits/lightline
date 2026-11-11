import { I18nProvider } from '@videojs/react/i18n';
import { MuxVideo } from '@videojs/react/media/mux-video';
import { usePlayer, VideoPlayer } from '@videojs/react/video';
import { type ComponentType, type CSSProperties, type RefObject, type SVGProps, useEffect, useMemo, useRef, useState } from 'react';

import * as drawn from '@/video/icons';
import { OptionField } from '@/video/shared/options';
import { GLASS, glassStyle } from '@/video/suite/glass';
import type { Queue } from '@/video/shared/queue';
import { VideoSkin } from '@/video/skin';

// The workbench's state simulator, so a judge can see the player stall and fail: it patches the page's network
// before the player loads, and acts only while a mode other than normal is picked.
import { setNetworkMode } from '../../preview/src/frame/simulate';
import type { NetworkMode } from '../../preview/src/shell/params';
import { DRAFT } from './copy';
import { FILMS, type PageFilm } from './films';
import { LightlineMark } from './mark';
import { filmVideo } from '@/video/shared/film-video';

// The screening room: the player with its light, the film's info bar, the library, the two layouts, the states, the
// icons, the design thinking. The page opens with sound on and does not autoplay; a pick (a card, Up Next, the
// drawer) loads the film in the same player and plays it, so fullscreen holds across a switch. Brief: design/page.md.

/** Stills of the player, made from the workbench by checks/page-stills.mjs. */
const STILLS = import.meta.glob<string>('./stills/*.jpg', { eager: true, import: 'default' });
const stillOf = (name: string) => STILLS[`./stills/${name}.jpg`];

/** A film's length to the nearest second, as the player's bar and its queue write it (the skin's format.length). */
const clock = (seconds: number) => {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Own-language names a browser's data may lack (Edge names these three in English). */
const OWN_NAMES: Record<string, string> = { cy: 'Cymraeg', gd: 'Gàidhlig', gl: 'Galego' };

/** Every locale the skin ships (its packs in src/i18n/locales, and English), each named in its own language. */
const LOCALES = ['en', ...Object.keys(import.meta.glob('@/i18n/locales/*.ts')).map((file) => file.replace(/^.*\/|\.ts$/g, ''))]
  .map((tag) => {
    const own = new Intl.DisplayNames([tag], { type: 'language' }).of(tag) ?? tag;
    const english = new Intl.DisplayNames(['en'], { type: 'language' }).of(tag);
    const name = tag !== 'en' && own === english && OWN_NAMES[tag] ? OWN_NAMES[tag] : own;
    return { tag, name: name.charAt(0).toLocaleUpperCase(tag) + name.slice(1) };
  })
  .sort((a, b) => a.tag.localeCompare(b.tag));

const LOCALE_KEY = 'lightline-page:locale';

/** The player's language the viewer picked, kept for the visit; '' is Automatic (the skin's own choice). */
function useLocalePick() {
  const [locale, setLocale] = useState(() => {
    try {
      const kept = sessionStorage.getItem(LOCALE_KEY) ?? '';
      return LOCALES.some((l) => l.tag === kept) ? kept : '';
    } catch {
      return '';
    }
  });
  const pick = (tag: string) => {
    setLocale(tag);
    try {
      sessionStorage.setItem(LOCALE_KEY, tag);
    } catch {
      // Kept until the page reloads.
    }
  };
  return [locale, pick] as const;
}

interface Look {
  /** A picture, or a loop's still, under looks/. */
  file: string;
  name: string;
  /** A looping video under looks/, shown in the Suite's room over its still `file`. */
  loop?: string;
  /** How much of the film's light the room takes over this look, 0 to 1 (the skin's `--lightline-room-light`); none if unset. */
  light?: number;
  /** The look the page opens with, for a viewer who has not picked one; without it, the skin's own room. */
  default?: boolean;
  /** How bright the room shows this look, 0 to 1, as a share of what the skin exposes it to; the page's 0.55 if unset. */
  dim?: number;
}

/** A file under looks/ as a URL, each folder in its path kept. */
const lookUrl = (file: string) => `./looks/${file.split('/').map(encodeURIComponent).join('/')}`;

/** The looks the page was given (apps/page/public/looks/looks.json, never committed), or none. */
function useLooks() {
  const [looks, setLooks] = useState<Look[]>([]);
  useEffect(() => {
    let live = true;
    fetch('./looks/looks.json')
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
      .then((list: unknown) => {
        const valid = Array.isArray(list)
          ? list.filter(
              (l): l is Look =>
                typeof l?.file === 'string' &&
                typeof l?.name === 'string' &&
                l.file &&
                l.name &&
                (l.loop === undefined || (typeof l.loop === 'string' && l.loop)) &&
                (l.light === undefined || (typeof l.light === 'number' && l.light >= 0 && l.light <= 1)) &&
                (l.dim === undefined || (typeof l.dim === 'number' && l.dim >= 0 && l.dim <= 1)) &&
                (l.default === undefined || typeof l.default === 'boolean'),
            )
          : [];
        if (live) setLooks(valid);
      });
    return () => {
      live = false;
    };
  }, []);
  return looks;
}

const LOOK_KEY = 'lightline-page:look';

/**
 * The look the viewer picked, kept between visits; '' is the skin's own room. A viewer who has picked nothing yet gets
 * the looks' default, if one is marked.
 */
function useLook(looks: Look[]) {
  const [picked, setPicked] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LOOK_KEY);
    } catch {
      return null;
    }
  });
  const pick = (file: string) => {
    setPicked(file);
    try {
      localStorage.setItem(LOOK_KEY, file);
    } catch {
      // Kept for this visit only.
    }
  };
  // A kept pick that is no longer offered falls back to the skin's own room.
  const look = picked === null ? looks.find((l) => l.default) : looks.find((l) => l.file === picked);
  return [look, pick] as const;
}

const GLASS_KEY = 'lightline-page:glass';

/** How see-through the Suite's panels are, in percent, kept for the visit. */
function useGlass() {
  const [glass, setGlass] = useState<number>(() => {
    try {
      const kept = Number(sessionStorage.getItem(GLASS_KEY));
      return kept >= GLASS.min && kept <= GLASS.max ? kept : GLASS.initial;
    } catch {
      return GLASS.initial;
    }
  });
  const pick = (value: number) => {
    setGlass(value);
    try {
      sessionStorage.setItem(GLASS_KEY, String(value));
    } catch {
      // Kept until the page reloads.
    }
  };
  return [glass, pick] as const;
}

/** Whether the player is in the Suite, read from the layout the skin writes on its container. */
function useSuiteOn(ref: RefObject<HTMLElement | null>) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const skin = ref.current?.querySelector('.media-skin');
    if (!skin) return;
    const read = () => setOn(skin.getAttribute('data-layout') === 'suite');
    read();
    const observer = new MutationObserver(read);
    observer.observe(skin, { attributes: true, attributeFilter: ['data-layout'] });
    return () => observer.disconnect();
  }, [ref]);
  return on;
}

export function Page() {
  const [filmId, setFilmId] = useState(FILMS[0]!.id);
  const looks = useLooks();
  const [look, setLook] = useLook(looks);
  const playerRef = useRef<HTMLDivElement>(null);
  const suiteOn = useSuiteOn(playerRef);
  const [locale, setLocale] = useLocalePick();
  const [glass, setGlass] = useGlass();
  const [net, setNet] = useState<NetworkMode>('normal');
  // Bumped to reload the film when the simulated network fails or recovers; the reload picks up where the film was,
  // playing if it was (as the workbench's frame does).
  const [load, setLoad] = useState(0);
  const resume = useRef<{ at: number; playing: boolean } | null>(null);
  const [autoPlay, setAutoPlay] = useState(false);
  const film = FILMS.find((f) => f.id === filmId) ?? FILMS[0]!;

  const pick = (id: string) => {
    if (id === filmId) return;
    setAutoPlay(true);
    setFilmId(id);
  };

  const pickNet = (next: NetworkMode) => {
    if (setNetworkMode(next)) {
      const media = filmVideo(playerRef.current);
      resume.current = media ? { at: media.currentTime, playing: !media.paused } : null;
      setLoad((count) => count + 1);
    }
    setNet(next);
  };

  useEffect(() => {
    const target = resume.current;
    const media = filmVideo(playerRef.current);
    if (!target || !media) return;
    resume.current = null;
    const go = () => {
      media.currentTime = target.at;
      if (target.playing) void media.play().catch(() => undefined);
    };
    if (media.readyState >= 1) go();
    else media.addEventListener('loadedmetadata', go, { once: true });
  }, [load]);

  // The page's options, in the player's Options sheet: the film, the Suite's room and glass while the Suite is open,
  // the player's language, and the simulated network. The skin adds its own ambient light after them.
  const options = (
    <>
      <OptionField label={DRAFT.film}>
        {(id) => (
          <select id={id} className="lightline-option-select" value={filmId} onChange={(e) => pick(e.target.value)}>
            {FILMS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.title}
              </option>
            ))}
          </select>
        )}
      </OptionField>
      {looks.length > 0 && suiteOn && (
        <OptionField label={DRAFT.room}>
          {(id) => (
            <select id={id} className="lightline-option-select" value={look?.file ?? ''} onChange={(e) => setLook(e.target.value)}>
              <option value="">{DRAFT.roomDefault}</option>
              {looks.map((l) => (
                <option key={l.file} value={l.file}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
        </OptionField>
      )}
      {suiteOn && (
        <OptionField label={DRAFT.glass}>
          {(id) => (
            <input
              id={id}
              className="lightline-option-range"
              type="range"
              min={GLASS.min}
              max={GLASS.max}
              step={GLASS.step}
              value={glass}
              aria-valuetext={DRAFT.glassValue(glass)}
              onChange={(e) => setGlass(Number(e.target.value))}
            />
          )}
        </OptionField>
      )}
      <OptionField label={DRAFT.language}>
        {(id) => (
          <select id={id} className="lightline-option-select" value={locale} onChange={(e) => setLocale(e.target.value)}>
            <option value="">{DRAFT.languageAuto}</option>
            {LOCALES.map((l) => (
              <option key={l.tag} value={l.tag} lang={l.tag}>
                {l.name}
              </option>
            ))}
          </select>
        )}
      </OptionField>
      <OptionField label={DRAFT.network}>
        {(id) => (
          <select id={id} className="lightline-option-select" value={net} onChange={(e) => pickNet(e.target.value as NetworkMode)}>
            {(Object.keys(DRAFT.networkModes) as NetworkMode[]).map((mode) => (
              <option key={mode} value={mode}>
                {DRAFT.networkModes[mode]}
              </option>
            ))}
          </select>
        )}
      </OptionField>
    </>
  );

  const queue = useMemo<Queue>(
    () => ({
      films: FILMS.map((f) => ({ id: f.id, title: f.title, duration: f.duration, still: f.still })),
      current: filmId,
      onPick: pick,
    }),
    [filmId]
  );

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">
          <LightlineMark className="page-mark" />
          <span className="page-wordmark">{DRAFT.title}</span>
        </h1>
        <p className="page-byline">
          {DRAFT.byline}{' '}
          <a className="page-studio" href={DRAFT.studioUrl}>
            {DRAFT.studio}
          </a>
        </p>
        <p className="page-intro">{DRAFT.intro}</p>
        <p className="page-free">
          {DRAFT.free}{' '}
          <a href={DRAFT.repoUrl}>{DRAFT.repoLabel}</a>.
        </p>
      </header>

      <I18nProvider locale={locale || undefined}>
        <VideoPlayer poster={film.poster}>
          <section className="page-stage" aria-label={film.title}>
            <div
              className="page-player"
              ref={playerRef}
              style={
                {
                  ...glassStyle(glass),
                  ...(look?.light !== undefined && { '--lightline-room-light': look.light }),
                  ...(look?.dim !== undefined && { '--page-room-dim': look.dim }),
                } as CSSProperties
              }
            >
              <VideoSkin
                queue={queue}
                peaks={`./${film.id}-peaks.json`}
                room={look ? lookUrl(look.file) : undefined}
                roomLoop={look?.loop ? lookUrl(look.loop) : undefined}
                options={options}
              >
                <MuxVideo key={load} source={film.source} crossOrigin="anonymous" playsInline autoPlay={autoPlay}>
                  {film.captions && (
                    <track key={`${film.id}-cc`} kind="captions" label="English" srcLang="en" src={film.captions} />
                  )}
                  {film.chapters && (
                    <track key={`${film.id}-ch`} kind="chapters" label="English" srcLang="en" src={film.chapters} default />
                  )}
                </MuxVideo>
              </VideoSkin>
            </div>
            <InfoBar film={film} />
          </section>
          <Library film={film} onPick={pick} />
        </VideoPlayer>
      </I18nProvider>

      <Modes />
      <States />
      <Icons />
      <Thinking />

      <footer className="page-foot">{DRAFT.footer}</footer>
    </div>
  );
}

interface Cue {
  start: number;
  text: string;
}

/** The film's chapters, read from its chapters track. */
function useCues(src?: string) {
  const [cues, setCues] = useState<Cue[]>([]);
  useEffect(() => {
    setCues([]);
    if (!src) return;
    let live = true;
    fetch(src)
      .then((r) => r.text())
      .then((text) => {
        const seconds = (t: string) => t.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);
        const out: Cue[] = [];
        for (const block of text.split(/\r?\n\r?\n/)) {
          const lines = block.split(/\r?\n/);
          const at = lines.findIndex((line) => line.includes('-->'));
          if (at < 0) continue;
          out.push({ start: seconds(lines[at]!.split('-->')[0]!.trim()), text: lines.slice(at + 1).join(' ').trim() });
        }
        if (live) setCues(out);
      });
    return () => {
      live = false;
    };
  }, [src]);
  return cues;
}

/** Title, studio, length, EXPLICIT where it applies, and the chapters as pills that seek the player. */
function InfoBar({ film }: { film: PageFilm }) {
  const cues = useCues(film.chapters);
  const seek = usePlayer((s) => s.seek);
  const currentTime = usePlayer((s) => s.currentTime);
  const current = cues.reduce((at, cue, index) => (currentTime >= cue.start ? index : at), -1);

  return (
    <div className="page-info">
      <div className="page-info-line">
        <h2 className="page-info-title">{film.title}</h2>
        <span className="page-info-studio">{DRAFT.studio}</span>
        <span className="page-num">{clock(film.duration)}</span>
        {film.explicit && <span className="page-pill page-explicit">{DRAFT.explicit}</span>}
      </div>
      {cues.length > 0 && (
        <div className="page-chapters" role="group" aria-label={DRAFT.chapters}>
          {cues.map((cue, index) => (
            <button
              key={cue.start}
              type="button"
              className="page-pill page-chapter"
              aria-current={index === current ? 'true' : undefined}
              onClick={() => seek(cue.start)}
            >
              {cue.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

type CardState = keyof typeof DRAFT.cardState;

/** What the player is doing with the film it holds, read as the skin's state pill reads it. */
function useCardState(): CardState {
  return usePlayer((s): CardState => {
    if (s.error) return 'error';
    if (s.waiting) return 'loading';
    if (s.ended) return 'ended';
    if (s.paused) return s.started ? 'paused' : 'ready';
    return 'playing';
  });
}

function Library({ film, onPick }: { film: PageFilm; onPick: (id: string) => void }) {
  const [lit, setLit] = useState<string | null>(null);
  const state = useCardState();

  return (
    <section className="page-section" aria-labelledby="page-library">
      <h2 id="page-library" className="page-label">
        {DRAFT.library}
      </h2>
      <p className="page-note">{DRAFT.libraryNote}</p>
      <ul className="page-library">
        {FILMS.map((f) => (
          <li key={f.id}>
            <button
              type="button"
              className="page-card"
              aria-current={f.id === film.id ? 'true' : undefined}
              onClick={() => onPick(f.id)}
              onPointerEnter={() => setLit(f.id)}
              onPointerLeave={() => setLit((now) => (now === f.id ? null : now))}
              onFocus={() => setLit(f.id)}
              onBlur={() => setLit((now) => (now === f.id ? null : now))}
            >
              <img
                className="page-card-still"
                src={lit === f.id && !reduced() ? f.preview : f.still}
                alt=""
                loading="lazy"
              />
              <span className="page-card-text">
                <span className="page-card-title">{f.title}</span>
                <span className="page-num">{clock(f.duration)}</span>
                {f.id === film.id && (
                  <span className="page-card-playing" data-state={state}>
                    {DRAFT.cardState[state]}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Modes() {
  return (
    <section className="page-section" aria-labelledby="page-modes">
      <h2 id="page-modes" className="page-label">
        {DRAFT.modes}
      </h2>
      <div className="page-modes">
        {(
          [
            ['cinema', DRAFT.cinema, DRAFT.cinemaText],
            ['suite', DRAFT.suite, DRAFT.suiteText],
          ] as const
        ).map(([id, name, text]) => (
          <figure key={id} className="page-figure">
            {stillOf(id) && <img src={stillOf(id)} alt="" loading="lazy" />}
            <figcaption>
              <span className="page-figure-name">{name}</span> {text}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function States() {
  return (
    <section className="page-section" aria-labelledby="page-states">
      <h2 id="page-states" className="page-label">
        {DRAFT.states}
      </h2>
      <p className="page-note">{DRAFT.statesNote}</p>
      <div className="page-states">
        {DRAFT.stateList.map((state) => (
          <figure key={state.id} className="page-figure" data-color={state.color}>
            {stillOf(state.id) && <img src={stillOf(state.id)} alt="" loading="lazy" />}
            <figcaption>
              <span className="page-figure-name">
                <span className="page-dot" aria-hidden="true" />
                {state.name}
              </span>{' '}
              {state.text}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

type Icon = ComponentType<SVGProps<SVGSVGElement>>;
const named = (module: Record<string, unknown>) =>
  Object.entries(module)
    .filter(([key, value]) => key.endsWith('Icon') && typeof value === 'function')
    .map(([key, value]) => ({
      name: key
        .replace(/Icon$/, '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .replace(/^air play/, 'AirPlay')
        .replace(/^pip/, 'PiP'),
      Icon: value as Icon,
    }));

function Icons() {
  const icons = named(drawn);
  return (
    <section className="page-section" aria-labelledby="page-icons">
      <h2 id="page-icons" className="page-label">
        {DRAFT.icons}
      </h2>
      <p className="page-note">{DRAFT.iconsNote}</p>
      <ul className="page-icons">
        {icons.map(({ name, Icon }) => (
          <li key={name} className="page-icon">
            <Icon width={36} height={36} />
            <span>{name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Thinking() {
  return (
    <section className="page-section page-thinking" aria-labelledby="page-thinking">
      <h2 id="page-thinking" className="page-label">
        {DRAFT.thinking}
      </h2>
      <p>{DRAFT.thinkingText.join(' ')}</p>
    </section>
  );
}
