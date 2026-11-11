/** @jsxImportSource react */

import { usePlayer } from '@videojs/react/video';
import {
  createContext,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { flushSync } from 'react-dom';

import { cn } from '@/lib/resolve-class-name';

import { useAudioLab } from '../audio/lab';
import { useAnnounce } from '../shared/status-announcer';
import { type Say, useSay } from '@/i18n/i18n';

import type { SuiteTextKey } from './labels';
import {
  DEFAULT_PANELS,
  dock,
  docked,
  float,
  floating,
  type LayoutMode,
  loadLayout,
  type PanelId,
  type Rail,
  setOpen,
  sidesDocked,
  sidesUnder,
  step,
  storeLayout,
  type SuiteLayout,
} from './layout';
import { filmVideo } from '../shared/film-video';

/**
 * The Suite: a second layout in the skin, a review room where the tools sit on four rails in the dark around the
 * frame and nothing covers the picture but the guides the viewer turns on. Under a container narrower than
 * `SUITE_FROM_PX` the room is not offered and the player stays Cinema; the viewer's choice is kept for when it
 * is wide again.
 */
export const SUITE_FROM_PX = 1100;

/**
 * The narrowest the film may be between the side rails: where the frame between them would be narrower, the panels
 * docked beside the film show under it instead (`sidesUnder`), so the film keeps the room's width. Decided from the
 * room's own width, the rails' and the margins, so it holds in any host and in fullscreen.
 */
export const FILM_BESIDE_FROM_PX = 640;

/** The waveform's peaks: the largest sample per 1/`rate` seconds, 0 to 1, computed from the film's master. */
export interface Peaks {
  rate: number;
  duration: number;
  silent?: boolean;
  peaks: number[];
}

export type GuideId = 'action' | 'title' | 'scope' | 'vertical' | 'thirds';
export const GUIDES: { id: GuideId; label: SuiteTextKey }[] = [
  { id: 'action', label: 'guideAction' },
  { id: 'title', label: 'guideTitle' },
  { id: 'scope', label: 'guideScope' },
  { id: 'vertical', label: 'guideVertical' },
  { id: 'thirds', label: 'guideThirds' },
];

export const PANEL_LABEL: Record<PanelId, SuiteTextKey> = {
  lab: 'panelLab',
  deck: 'panelDeck',
  telemetry: 'panelTelemetry',
  // The panel holds the timeline alone since the guides moved into the bar (design/guides-bar-timeline.md). Its id stays
  // `guides`, so a stored layout keeps its place; its title is the timeline's own word, which every locale translates.
  guides: 'timeline',
};

const RAIL_WORD: Record<Rail, SuiteTextKey> = {
  left: 'railleft',
  right: 'railright',
  top: 'railtop',
  bottom: 'railbottom',
};

const panelName = (say: Say, id: PanelId) => say(PANEL_LABEL[id]);

export interface Suite {
  /** The container is wide enough for the room. */
  offered: boolean;
  /** The room is showing: offered, and the viewer chose it. */
  active: boolean;
  /** The panels docked beside the film show under it: the frame between them would be too narrow. */
  under: boolean;
  /** The layout as the room shows it (with the side rails' panels under the film while `under`). */
  layout: SuiteLayout;
  setMode: (mode: LayoutMode) => void;
  dock: (id: PanelId, rail: Rail, index?: number) => void;
  float: (id: PanelId, rail: Rail, x: number, y: number, quiet?: boolean) => void;
  step: (id: PanelId, by: -1 | 1) => void;
  show: (id: PanelId, open: boolean) => void;
  reset: () => void;
  guides: Record<GuideId, boolean>;
  setGuide: (id: GuideId, on: boolean) => void;
  peaks: Peaks | null;
  /** A grip to focus once its panel has moved and drawn again. */
  refocus: RefObject<PanelId | null>;
  container: HTMLElement | null;
}

const SuiteContext = createContext<Suite | null>(null);

export function useSuite() {
  const suite = useContext(SuiteContext);
  if (!suite) throw new Error('useSuite must be used inside the Lightline skin.');
  return suite;
}

export interface SuiteHostProps {
  /** The film's waveform peaks, or a URL to fetch them from; without them the timeline shows the film strip alone. */
  peaks?: Peaks | string;
  /**
   * A picture of a room for the Suite's backdrop, as a URL. The room shows it gray and dimmed behind the rails (lit
   * by the film's four corners where the host sets `--lightline-room-light`). Without one the skin draws dim light
   * pools of its own. A host may set the custom property `--lightline-room-image` on the player instead, to any CSS
   * image; this prop wins over it.
   */
  room?: string;
  /**
   * A looping video of a room for the Suite's backdrop, as a URL, with `room` as its still (its first frame). The
   * room shows it in its own color, muted, dimmed and softened behind the rails (the film's light over it where the
   * host sets `--lightline-room-light`). It loads only when the Suite shows it and plays only while the room is on
   * screen; reduced motion shows the still and never plays it. The skin measures its frames across the whole loop before it shows it, so it must be
   * readable (the page's origin, or CORS); one that is not never shows.
   */
  roomLoop?: string;
}

export function SuiteProvider({ peaks: peaksInput, children }: SuiteHostProps & { children: ReactNode }) {
  const lab = useAudioLab();
  const container = lab.container;
  const announce = useAnnounce();
  const say = useSay();
  const [stored, setLayout] = useState<SuiteLayout>(loadLayout);
  const [offered, setOffered] = useState(false);
  const [sidesFit, setSidesFit] = useState<0 | 1 | 2>(2);
  const [guides, setGuides] = useState<Record<GuideId, boolean>>({
    action: false,
    title: false,
    scope: false,
    vertical: false,
    thirds: false,
  });
  const [peaks, setPeaks] = useState<Peaks | null>(typeof peaksInput === 'object' ? peaksInput : null);
  const refocus = useRef<PanelId | null>(null);
  const transitionName = `lightline-frame-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
  const active = offered && stored.mode === 'suite';
  // Where the room holds fewer sides of panels beside the film than the layout docks there, they show under it.
  const shown = useCallback(
    (l: SuiteLayout) => (sidesDocked(l).length > sidesFit ? sidesUnder(l) : l),
    [sidesFit]
  );
  const under = active && sidesDocked(stored).length > sidesFit;
  const layout = useMemo(() => (under ? sidesUnder(stored) : stored), [under, stored]);

  useEffect(() => {
    if (!container) return;
    const measure = () => setOffered(container.getBoundingClientRect().width >= SUITE_FROM_PX);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [container]);

  // How many sides of panels the room holds beside the film: the film's width between the side rails is the room
  // less its margins and, for each side with panels docked on it, a rail and the margin beside it. The rail's width
  // comes from the room's CSS in pixels (`--lightline-rail-px`). Measured before the room paints, so it never draws
  // the squeezed frame first; the layout then decides in its own render where each panel shows.
  useLayoutEffect(() => {
    if (!container || !active) return;
    const measure = () => {
      const style = getComputedStyle(container);
      const gap = parseFloat(style.paddingLeft) || 0;
      const rail = parseFloat(style.getPropertyValue('--lightline-rail-px')) || 0;
      const free = container.getBoundingClientRect().width - 2 * gap - FILM_BESIDE_FROM_PX;
      setSidesFit(free >= 2 * (rail + gap) ? 2 : free >= rail + gap ? 1 : 0);
    };
    measure();
    // The margins follow the viewport, so a window resized round a player of a set width measures again too.
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [container, active]);

  // The peaks are fetched once the room shows; a failed fetch leaves the strip alone.
  useEffect(() => {
    if (typeof peaksInput === 'object') return setPeaks(peaksInput);
    setPeaks(null);
    if (!peaksInput || !active) return;
    let live = true;
    fetch(peaksInput)
      .then((response) => (response.ok ? (response.json() as Promise<Peaks>) : null))
      .then((data) => live && data && Array.isArray(data.peaks) && setPeaks(data))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [peaksInput, active]);

  // In the room the Audio Lab shows as a panel, so its sound starts at the first press in the player, as the lab's
  // own button would start it.
  const labShown = active && layout.panels.lab.open;
  const { engine, available, start } = lab;
  useEffect(() => {
    if (!container || !labShown || engine || !available) return;
    const go = () => start();
    container.addEventListener('pointerdown', go, true);
    container.addEventListener('keydown', go, true);
    return () => {
      container.removeEventListener('pointerdown', go, true);
      container.removeEventListener('keydown', go, true);
    };
  }, [container, labShown, engine, available, start]);

  const change = useCallback((next: (layout: SuiteLayout) => SuiteLayout) => {
    setLayout((now) => {
      const after = next(now);
      if (after !== now) storeLayout(after);
      return after;
    });
  }, []);

  const value = useMemo<Suite>(() => {
    const position = (l: SuiteLayout, id: PanelId) => {
      const ids = docked(l, l.panels[id].rail);
      return { position: ids.indexOf(id) + 1, count: ids.length };
    };
    // Said where the panel shows, which is under the film if its side does not fit.
    const told = (next: SuiteLayout, id: PanelId) => {
      const l = shown(next);
      const place = l.panels[id];
      const rail = say(RAIL_WORD[place.rail]);
      announce(
        place.float
          ? say('sayFloated', { panel: panelName(say, id), rail })
          : say('sayDocked', {
              panel: panelName(say, id),
              rail,
              ...position(l, id),
            })
      );
    };
    return {
      offered,
      active,
      under,
      layout,
      setMode: (mode) => {
        if (mode === 'suite' && layout.panels.lab.open) start();
        const apply = () => flushSync(() => change((l) => ({ ...l, mode })));
        const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
        const doc = document as Document & {
          startViewTransition?: (update: () => void) => {
            finished: Promise<void>;
          };
        };
        const video = filmVideo(container);
        if (still || !doc.startViewTransition || !video)
          return void (apply(), announce(say('sayMode', { mode: say(mode) })));
        // The frame moves as one piece; it carries the name only for the length of the change.
        video.style.setProperty('view-transition-name', transitionName);
        video.style.setProperty('view-transition-class', 'lightline-frame');
        doc.startViewTransition(apply).finished.finally(() => {
          video.style.removeProperty('view-transition-name');
          video.style.removeProperty('view-transition-class');
        });
        announce(say('sayMode', { mode: say(mode) }));
      },
      // A panel moved, floated or stepped is moved in the room as the viewer sees it: while the side rails' panels
      // are under the film, what they then arrange is kept as they see it. Showing, closing and Reset keep each
      // panel's own rail. A panel docked on a side where the room holds only one keeps the side it was given, and the
      // other side's panels go under the film.
      dock: (id, rail, index) => {
        let next = dock(layout, id, rail, index);
        if (vertical(rail) && sidesDocked(next).length > sidesFit && sidesFit > 0)
          next = sidesUnder(next, rail === 'left' ? 'right' : 'left');
        change(() => next);
        told(next, id);
      },
      float: (id, rail, x, y, quiet) => {
        const next = float(layout, id, rail, x, y);
        change(() => next);
        if (!quiet) told(next, id);
      },
      step: (id, by) => {
        const next = step(layout, id, by);
        if (next === layout) return announce(say('sayEdge', { panel: panelName(say, id) }));
        change(() => next);
        told(next, id);
      },
      show: (id, open) => {
        change((l) => setOpen(l, id, open));
        announce(say(open ? 'sayShown' : 'sayClosed', { panel: panelName(say, id) }));
      },
      reset: () => {
        change((l) => ({ ...l, panels: DEFAULT_PANELS }));
        announce(say('sayReset'));
      },
      guides,
      setGuide: (id, on) => setGuides((g) => ({ ...g, [id]: on })),
      peaks,
      refocus,
      container,
    };
  }, [offered, active, under, layout, shown, sidesFit, guides, peaks, container, change, announce, say, start, transitionName]);

  return <SuiteContext.Provider value={value}>{children}</SuiteContext.Provider>;
}

/** The frame's box in the room: the picture with the controls above and below it. */
function frameRect(container: HTMLElement) {
  return container.querySelector('.lightline-suite-frame')?.getBoundingClientRect() ?? null;
}

/** The rail nearest a point: the side of the frame the point is furthest outside, or nearest to when inside it. */
function nearestRail(frame: DOMRect, x: number, y: number): Rail {
  const out: [Rail, number][] = [
    ['left', frame.left - x],
    ['right', x - frame.right],
    ['top', frame.top - y],
    ['bottom', y - frame.bottom],
  ];
  return out.reduce((best, next) => (next[1] > best[1] ? next : best))[0];
}

const vertical = (rail: Rail) => rail === 'left' || rail === 'right';

/** The room's margin (`--lightline-room-gap`, the room's own padding), which a floating panel keeps from the frame. */
const roomGap = (container: HTMLElement) => parseFloat(getComputedStyle(container).paddingTop) || 12;

/**
 * A floating panel's spot, kept out of the frame: on its side of the frame and inside the room. The room keeps
 * room for it (see `Rail`), so the frame shrinks rather than meet it.
 */
function clampFloat(container: HTMLElement, panel: HTMLElement, rail: Rail, x: number, y: number) {
  const room = container.getBoundingClientRect();
  const frame = frameRect(container);
  const w = panel.offsetWidth;
  const h = panel.offsetHeight;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, Math.max(lo, hi)));
  const gap = roomGap(container);
  let left = clamp(x, 0, room.width - w);
  let top = clamp(y, 0, room.height - h);
  if (frame) {
    const f = {
      left: frame.left - room.left,
      right: frame.right - room.left,
      top: frame.top - room.top,
      bottom: frame.bottom - room.top,
    };
    if (rail === 'left') left = clamp(x, 0, f.left - gap - w);
    if (rail === 'right') left = clamp(x, f.right + gap, room.width - w);
    if (rail === 'top') top = clamp(y, 0, f.top - gap - h);
    if (rail === 'bottom') top = clamp(y, f.bottom + gap, room.height - h);
  }
  return { left, top };
}

/** One rail: its docked panels in order, then the panels floating on its side of the frame. */
export function SuiteRail({ rail, render }: { rail: Rail; render: (id: PanelId) => ReactNode }) {
  const suite = useSuite();
  const ref = useRef<HTMLDivElement>(null);
  const [reserve, setReserve] = useState(0);
  const ids = docked(suite.layout, rail);
  const floats = floating(suite.layout, rail);

  // The player's hotkeys stay out of the panels: their keys move their own controls. The hotkeys listen on the
  // container, below React's root, so the rail stops the key itself; the grip's own keys are native listeners.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stop = (event: Event) => event.stopPropagation();
    el.addEventListener('keydown', stop);
    return () => el.removeEventListener('keydown', stop);
  }, [suite.active]);

  // The room keeps a floating panel's size free on its side, so the frame gives way instead of meeting it.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || floats.length === 0) return setReserve(0);
    const measure = () => {
      const sizes = [...el.querySelectorAll<HTMLElement>(':scope > [data-floating]')].map((panel) =>
        vertical(rail) ? panel.offsetWidth : panel.offsetHeight
      );
      setReserve(sizes.length ? Math.max(...sizes) + (el.parentElement ? roomGap(el.parentElement) : 12) : 0);
    };
    measure();
    const observer = new ResizeObserver(measure);
    el.querySelectorAll(':scope > [data-floating]').forEach((panel) => observer.observe(panel));
    return () => observer.disconnect();
  }, [rail, floats.join(), suite.active]);

  if (!suite.active) return null;
  return (
    <div
      ref={ref}
      className={cn('lightline-rail', `lightline-rail-${rail}`)}
      data-rail={rail}
      data-empty={ids.length === 0 ? '' : undefined}
      style={
        reserve
          ? {
              [vertical(rail) ? 'minInlineSize' : 'minBlockSize']: `${reserve}px`,
            }
          : undefined
      }
      // The player's taps and double taps leave the panels alone.
      data-interactive=""
    >
      {ids.map((id) => (
        <SuitePanel key={id} id={id} rail={rail}>
          {render(id)}
        </SuitePanel>
      ))}
      {floats.map((id) => (
        <SuitePanel key={id} id={id} rail={rail} floatAt={suite.layout.panels[id].float!}>
          {render(id)}
        </SuitePanel>
      ))}
    </div>
  );
}

function SuitePanel({
  id,
  rail,
  floatAt,
  children,
}: {
  id: PanelId;
  rail: Rail;
  floatAt?: { x: number; y: number };
  children: ReactNode;
}) {
  const say = useSay();
  const suite = useSuite();
  const ref = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const titleId = `lightline-panel-${useId().replace(/:/g, '')}`;
  const [scrolls, setScrolls] = useState(false);

  // While the body scrolls (its words take more than the panel is given), it is a tab stop, so the keyboard can
  // scroll it to words no control reaches; it watches its own box and what it holds.
  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    const measure = () => setScrolls(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of el.children) observer.observe(child);
    return () => observer.disconnect();
  }, [id]);

  // A floating panel takes its spot after it has drawn, kept out of the frame; again whenever the room resizes.
  useLayoutEffect(() => {
    const panel = ref.current;
    const container = suite.container;
    if (!panel || !container || !floatAt) return;
    const place = () => {
      const { left, top } = clampFloat(container, panel, rail, floatAt.x, floatAt.y);
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(container);
    return () => observer.disconnect();
  }, [floatAt?.x, floatAt?.y, rail, suite.container]);

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={titleId}
      className={cn('lightline-panel', `lightline-panel-${id}`)}
      data-panel={id}
      data-floating={floatAt ? '' : undefined}
    >
      <div className={'lightline-panel-head'}>
        <Grip id={id} rail={rail} floating={!!floatAt} panel={ref} />
        <span id={titleId} className={'lightline-panel-title'}>
          {panelName(say, id)}
        </span>
      </div>
      <div
        ref={body}
        className={'lightline-panel-body'}
        tabIndex={scrolls ? 0 : undefined}
        role={scrolls ? 'region' : undefined}
        aria-labelledby={scrolls ? titleId : undefined}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * A menu in the top layer beside the button that opens it, kept in the viewport: under the button where it fits
 * (`below`), else over it; or over it where it fits (`above`: the bar's menus open toward the picture, as Settings
 * does), aligned to the button's end edge.
 */
export function placeMenu(menu: HTMLElement, anchor: HTMLElement, prefer: 'below' | 'above') {
  const a = anchor.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const w = menu.offsetWidth;
  const h = menu.offsetHeight;
  const below = a.bottom + 4;
  const above = a.top - 4 - h;
  const fitsBelow = below + h <= vh - 8;
  const top = prefer === 'above' && (above >= 8 || !fitsBelow) ? Math.max(8, above) : fitsBelow ? below : Math.max(8, above);
  menu.style.left = `${Math.max(8, Math.min(prefer === 'above' ? a.right - w : a.left, vw - w - 8))}px`;
  menu.style.top = `${top}px`;
}

/** A menu's keys: the arrows, Home and End move the focus round its items; Tab closes it. */
export function menuKeys(menu: HTMLElement, event: globalThis.KeyboardEvent) {
  const items = [...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]')];
  const at = items.indexOf(document.activeElement as HTMLElement);
  const go = (to: number) => items[(to + items.length) % items.length]?.focus();
  if (event.key === 'ArrowDown') go(at + 1);
  else if (event.key === 'ArrowUp') go(at - 1);
  else if (event.key === 'Home') go(0);
  else if (event.key === 'End') go(items.length - 1);
  else if (event.key === 'Tab') menu.hidePopover();
  else return;
  event.preventDefault();
}

const DOCKS: { rail: Rail; label: SuiteTextKey }[] = [
  { rail: 'left', label: 'dockLeft' },
  { rail: 'right', label: 'dockRight' },
  { rail: 'top', label: 'dockTop' },
  { rail: 'bottom', label: 'dockBottom' },
];

/** Where a drag would put the panel: a rail and a place on it, or a floating spot. */
type Drop = {
  rail: Rail;
  index: number;
  float: { x: number; y: number } | null;
};

/**
 * The panel's grip: drag it to a rail (Alt or Option while dropping floats it there), or press it for a menu that
 * does everything a drag does. Arrow keys move a floating panel.
 */
function Grip({
  id,
  rail,
  floating: isFloating,
  panel,
}: {
  id: PanelId;
  rail: Rail;
  floating: boolean;
  panel: RefObject<HTMLDivElement | null>;
}) {
  const say = useSay();
  const suite = useSuite();
  const announce = useAnnounce();
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setMenuOpen] = useState(false);
  const menuId = `lightline-grip-${useId().replace(/:/g, '')}`;
  const drag = useRef<{
    pointer: number;
    x: number;
    y: number;
    dx: number;
    dy: number;
    moved: boolean;
    ghost?: HTMLElement;
    mark?: HTMLElement;
    drop?: Drop;
  } | null>(null);
  const swallowClick = useRef(false);

  // After a move redraws the panel on another rail, its grip takes the focus back.
  useLayoutEffect(() => {
    if (suite.refocus.current === id) {
      suite.refocus.current = null;
      button.current?.focus();
    }
  });

  const ids = docked(suite.layout, rail);
  const at = ids.indexOf(id);
  const across = vertical(rail) ? (['moveUp', 'moveDown'] as const) : (['moveLeft', 'moveRight'] as const);

  const items: {
    label: SuiteTextKey;
    checked?: boolean;
    disabled?: boolean;
    run: () => void;
  }[] = [
    ...DOCKS.map((d) => ({
      label: d.label,
      checked: !isFloating && rail === d.rail,
      run: () => suite.dock(id, d.rail),
    })),
    {
      label: 'float',
      checked: isFloating,
      run: () => {
        const container = suite.container;
        const box = panel.current?.getBoundingClientRect();
        const room = container?.getBoundingClientRect();
        if (!box || !room) return;
        suite.float(id, rail, box.left - room.left, box.top - room.top);
      },
    },
    {
      label: across[0],
      disabled: isFloating || at <= 0,
      run: () => suite.step(id, -1),
    },
    {
      label: across[1],
      disabled: isFloating || at < 0 || at >= ids.length - 1,
      run: () => suite.step(id, 1),
    },
    { label: 'close', run: () => suite.show(id, false) },
  ];

  const choose = (run: () => void) => {
    menu.current?.hidePopover();
    suite.refocus.current = id;
    run();
    button.current?.focus();
  };

  // The menu sits beside its grip, kept in the viewport; it opens with focus on its first live item.
  useEffect(() => {
    const el = menu.current;
    if (!el) return;
    const toggle = (event: Event) => {
      const now = (event as ToggleEvent).newState === 'open';
      setMenuOpen(now);
      if (now) {
        placeMenu(el, button.current!, 'below');
        el.querySelector<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])')?.focus();
      } else if (el.contains(document.activeElement) || document.activeElement === document.body) {
        button.current?.focus();
      }
    };
    el.addEventListener('toggle', toggle);
    return () => el.removeEventListener('toggle', toggle);
  }, []);

  // Arrows move a floating panel: 16 px a press, 64 with Shift; it stays on its side of the frame.
  const onKey = (event: globalThis.KeyboardEvent) => {
    const by = event.shiftKey ? 64 : 16;
    const move = {
      ArrowLeft: [-by, 0],
      ArrowRight: [by, 0],
      ArrowUp: [0, -by],
      ArrowDown: [0, by],
    }[event.key];
    if (!isFloating || !move) return;
    event.preventDefault();
    const el = panel.current!;
    const container = suite.container!;
    const x = el.offsetLeft + move[0]!;
    const y = el.offsetTop + move[1]!;
    const spot = clampFloat(container, el, rail, x, y);
    if (spot.left === el.offsetLeft && spot.top === el.offsetTop)
      return announce(say('sayEdge', { panel: panelName(say, id) }));
    suite.float(id, rail, spot.left, spot.top, true);
    announce(say('sayNudged', { panel: panelName(say, id) }));
  };

  const keys = useRef({ onKey });
  keys.current = { onKey };
  useEffect(() => {
    const grip = button.current!;
    const list = menu.current!;
    const key = (event: globalThis.KeyboardEvent) => keys.current.onKey(event);
    const menuKey = (event: globalThis.KeyboardEvent) => menuKeys(list, event);
    grip.addEventListener('keydown', key);
    list.addEventListener('keydown', menuKey);
    return () => {
      grip.removeEventListener('keydown', key);
      list.removeEventListener('keydown', menuKey);
    };
  }, []);

  const end = () => {
    const state = drag.current;
    drag.current = null;
    state?.ghost?.remove();
    state?.mark?.remove();
    panel.current?.removeAttribute('data-dragging');
    return state;
  };

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !panel.current) return;
    const box = panel.current.getBoundingClientRect();
    drag.current = {
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      dx: event.clientX - box.left,
      dy: event.clientY - box.top,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const state = drag.current;
    const container = suite.container;
    const el = panel.current;
    if (!state || state.pointer !== event.pointerId || !container || !el) return;
    if (!state.moved && Math.hypot(event.clientX - state.x, event.clientY - state.y) < 5) return;
    const room = container.getBoundingClientRect();
    const frame = frameRect(container);
    if (!frame) return;
    if (!state.moved) {
      state.moved = true;
      el.setAttribute('data-dragging', '');
      state.ghost = Object.assign(document.createElement('div'), {
        className: 'lightline-suite-ghost',
      });
      state.ghost.setAttribute('aria-hidden', 'true');
      state.ghost.style.width = `${el.offsetWidth}px`;
      state.ghost.style.height = `${Math.min(el.offsetHeight, 160)}px`;
      state.mark = Object.assign(document.createElement('div'), {
        className: 'lightline-suite-mark',
      });
      state.mark.setAttribute('aria-hidden', 'true');
      container.append(state.ghost, state.mark);
    }
    const target = nearestRail(frame, event.clientX, event.clientY);
    const left = event.clientX - room.left - state.dx;
    const top = event.clientY - room.top - state.dy;
    let drop: Drop;
    if (event.altKey) {
      drop = { rail: target, index: 0, float: { x: left, y: top } };
    } else {
      const others = [
        ...container.querySelectorAll<HTMLElement>(`[data-rail="${target}"] > [data-panel]:not([data-floating])`),
      ].filter((other) => other !== el);
      const index = others.filter((other) => {
        const r = other.getBoundingClientRect();
        return vertical(target) ? r.top + r.height / 2 < event.clientY : r.left + r.width / 2 < event.clientX;
      }).length;
      drop = { rail: target, index, float: null };
    }
    state.drop = drop;
    state.ghost!.style.transform = `translate(${left}px, ${top}px)`;
    state.ghost!.textContent = drop.float
      ? say('float')
      : `${say(DOCKS.find((d) => d.rail === target)!.label)}, ${drop.index + 1}`;
    // The mark: a line along the frame's edge on the side the panel will go.
    const f = {
      l: frame.left - room.left,
      t: frame.top - room.top,
      w: frame.width,
      h: frame.height,
    };
    const mark = state.mark!.style;
    mark.left = `${target === 'left' ? f.l - 8 : target === 'right' ? f.l + f.w + 5 : f.l}px`;
    mark.top = `${target === 'top' ? f.t - 8 : target === 'bottom' ? f.t + f.h + 5 : f.t}px`;
    mark.width = vertical(target) ? '3px' : `${f.w}px`;
    mark.height = vertical(target) ? `${f.h}px` : '3px';
    state.mark!.toggleAttribute('data-float', !!drop.float);
  };

  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const state = end();
    if (!state?.moved || !state.drop) return;
    swallowClick.current = true;
    const { drop } = state;
    suite.refocus.current = id;
    if (drop.float) suite.float(id, drop.rail, drop.float.x, drop.float.y);
    else suite.dock(id, drop.rail, drop.index);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        className={'lightline-panel-grip'}
        aria-label={say('grip', { panel: panelName(say, id) })}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        popoverTarget={menuId}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => end()}
        onClick={(event) => {
          // A drag ends in a click; it does not open the menu.
          if (swallowClick.current) {
            swallowClick.current = false;
            event.preventDefault();
          }
        }}
      >
        <svg className={'lightline-panel-grip-icon'} viewBox="0 0 10 16" aria-hidden="true" focusable="false">
          {[3, 8, 13].map((cy) => [3, 7].map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.3" />))}
        </svg>
      </button>
      <div
        ref={menu}
        id={menuId}
        popover="auto"
        role="menu"
        aria-label={say('grip', { panel: panelName(say, id) })}
        className={cn('media-popup', 'lightline-grip-menu')}
      >
        {items.map((item, index) => (
          <button
            key={item.label}
            type="button"
            role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
            aria-checked={item.checked}
            aria-disabled={item.disabled || undefined}
            tabIndex={-1}
            className={cn('lightline-grip-item', index === 5 && 'lightline-grip-item-split')}
            onClick={() => !item.disabled && choose(item.run)}
          >
            {say(item.label)}
          </button>
        ))}
      </div>
    </>
  );
}

/** The Cinema | Suite switch in the top row, offered only where the room fits. */
export function LayoutSwitch() {
  const say = useSay();
  const suite = useSuite();
  if (!suite.offered) return null;
  const mode = suite.active ? 'suite' : 'cinema';

  return (
    <div className={'lightline-layout-switch'} role="group" aria-label={say('layout')}>
      {(['cinema', 'suite'] as const).map((value) => (
        <button
          key={value}
          type="button"
          className={'lightline-layout-option'}
          aria-pressed={mode === value}
          onClick={() => mode !== value && suite.setMode(value)}
        >
          {say(value)}
        </button>
      ))}
    </div>
  );
}

/**
 * The room's fixed parts: the frame's box (measured by the drag and the floating panels) and the picture's own
 * place, which gives the middle row its height. The controls stay up while the room shows: they sit in the dark
 * above and below the picture, not over it.
 */
export function SuiteFrame() {
  const suite = useSuite();
  const requestControlsLock = usePlayer((s) => s.requestControlsLock);
  useEffect(() => (suite.active ? requestControlsLock() : undefined), [suite.active, requestControlsLock]);
  if (!suite.active) return null;
  return (
    <>
      <div className={'lightline-suite-frame'} aria-hidden="true" />
      <div className={'lightline-suite-picture'} aria-hidden="true" />
    </>
  );
}

/** Where the glass sees a room's lightest part, on the sRGB gray scale, whatever the room: low enough that a word on
 * the most see-through glass keeps 4.5 to 1 with that spot right behind it. */
const ROOM_LIGHTEST = 86;

/** Where the margins put a room's 90th percentile, on the same scale: about where Concrete's sat, the look that
 * read plainly as a room. */
const ROOM_MARGIN = 90;

/**
 * The room shows: the CSS draws it only here. Asked with the queries every engine knows; a viewer who asked for less
 * transparency is read apart (`LESS_QUERY`): Safari 27 (measured on a Mac, 2026-11-09) knows no
 * prefers-reduced-transparency at all and answers false to any query that names it, either value, so a gate that
 * named it kept the loop from ever mounting there.
 */
const ROOM_QUERY = '(forced-colors: none) and (not (prefers-contrast: more))';

/** The viewer asked for less transparency: no room. False where the engine does not know the query. */
const LESS_QUERY = '(prefers-reduced-transparency: reduce)';

/** The room shows and may move: the one case a loop plays. */
const LOOP_QUERY = `${ROOM_QUERY} and (prefers-reduced-motion: no-preference)`;

interface RoomExposure {
  value: number;
  lift: number;
}

const toLinear = (x: number) => ((x /= 255) <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
const toGray = (y: number) => 255 * (y <= 0.0031308 ? 12.92 * y : 1.055 * y ** (1 / 2.4) - 0.055);

/**
 * Reads pictures or a loop's frames into 48 by 27 grays, each the mean of about 40 by 40 of the picture's pixels:
 * about what the plate's blur and the glass's leave of a spot, wherever it falls behind a pane. Drawn at 192 by 108
 * and averaged in blocks of 4 by 4, since a browser draws a video frame small by sampling it, not by averaging. A
 * gray room's gray is what the grayscale filter gives; a room in its own color is as light as its WCAG luminance (an
 * orange or a gold a little lighter than its gray), so it counts as the gray of that luminance. `read` throws on a
 * tainted canvas.
 */
function roomReader(color: boolean) {
  const canvas = Object.assign(document.createElement('canvas'), { width: 192, height: 108 });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const grays: number[] = [];
  const read = (source: CanvasImageSource) => {
    if (!ctx) throw new Error('No canvas');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, 192, 108);
    const data = ctx.getImageData(0, 0, 192, 108).data;
    for (let y = 0; y < 108; y += 4) {
      for (let x = 0; x < 192; x += 4) {
        let [r, g, b] = [0, 0, 0];
        for (let i = 0; i < 16; i++) {
          const at = ((y + (i >> 2)) * 192 + x + (i & 3)) * 4;
          [r, g, b] = [r + data[at]! / 16, g + data[at + 1]! / 16, b + data[at + 2]! / 16];
        }
        const gray = color
          ? toGray(0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b))
          : 0.2126 * r + 0.7152 * g + 0.0722 * b;
        grays.push(Math.max(1, gray));
      }
    }
  };
  return { grays, read };
}

/**
 * How bright the plate draws a room: behind the glass its lightest part lands on `ROOM_LIGHTEST`, so a dark room is
 * lifted and a sunlit one is held down, and the glass's words keep the same margin over every room. The lift is for
 * the margins, where no word sits: it raises the plate until the room's 90th percentile lands on `ROOM_MARGIN` (never
 * below the exposure, never past 4 in all), so a night city or a dark studio reads as a place around the panels; the
 * glass takes it back off what it shows.
 */
function exposureOf(grays: number[]): RoomExposure {
  grays.sort((a, b) => a - b);
  const value = Math.min(2, Math.max(0.25, ROOM_LIGHTEST / grays[grays.length - 1]!));
  const margin = Math.min(4, Math.max(value, ROOM_MARGIN / grays[Math.floor(grays.length * 0.9)]!));
  return { value: +value.toFixed(3), lift: +(margin / value).toFixed(3) };
}

/**
 * A host's picture, read once. A picture that cannot be read (another origin without CORS) leaves the exposure
 * undefined, and the plate takes its default.
 */
function useRoomExposure(href: string | undefined, color: boolean) {
  const [exposure, setExposure] = useState<RoomExposure & { of: string }>();
  const of = `${color ? 'color' : 'gray'} ${href}`;
  useEffect(() => {
    if (!href) return;
    let live = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const reader = roomReader(color);
        reader.read(img);
        if (live) setExposure({ of, ...exposureOf(reader.grays) });
      } catch {
        // A tainted canvas: the plate keeps its default.
      }
    };
    img.src = href;
    return () => {
      live = false;
    };
  }, [href, color, of]);
  return exposure?.of === of ? exposure : undefined;
}

/** Loops measured this visit, by URL (null: their frames could not be read), so a room picked again shows at once. */
const measuredLoops = new Map<string, RoomExposure | null>();

/** A loop element's pass of seeks while it runs. */
const measuring = new WeakMap<HTMLVideoElement, Promise<RoomExposure | null>>();

/**
 * A loop's exposure from its brightest frames: seeks its own element through the whole loop about four times a second
 * (8 to 64 frames) and reads every frame, so the brightest, wherever it falls in the loop, lands on `ROOM_LIGHTEST`
 * behind the glass. Null when the frames cannot be read (another origin without CORS); the loop then never shows.
 */
async function measureLoop(video: HTMLVideoElement): Promise<RoomExposure | null> {
  const { duration } = video;
  if (!Number.isFinite(duration) || duration <= 0) return null;
  const reader = roomReader(true);
  const frames = Math.min(64, Math.max(8, Math.ceil(duration * 4)));
  try {
    for (let i = 0; i < frames; i++) {
      await new Promise((done, fail) => {
        video.addEventListener('seeked', done, { once: true });
        video.addEventListener('error', fail, { once: true });
        video.currentTime = ((i + 0.5) / frames) * duration;
      });
      reader.read(video);
    }
    return exposureOf(reader.grays);
  } catch {
    return null;
  }
}

function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (change) => {
      const list = matchMedia(query);
      list.addEventListener('change', change);
      return () => list.removeEventListener('change', change);
    },
    () => matchMedia(query).matches,
    () => false,
  );
}

const resolveUrl = (url?: string) =>
  url && typeof document !== 'undefined' ? new URL(url, document.baseURI).href : undefined;

interface RoomLoopProps {
  src: string;
  onMeasure: (src: string, exposure: RoomExposure | null) => void;
}

/**
 * The room's picture and loop, and how the plate draws them: custom properties for the container, since the glass of
 * every docked panel reads the lift too, and the loop for `SuiteRoom`. None outside the Suite or without a host room.
 * A loop is in its own color (its still too), and plays only where the room shows and motion is allowed; until it
 * is measured, and under reduced motion, its still shows at the still's own exposure.
 */
export function useRoom(image?: string, loopUrl?: string) {
  const suite = useSuite();
  // Resolved here: a relative URL inside a custom property would resolve against the skin's stylesheet. A parsed URL
  // carries no quote, backslash or line break, so it needs no escaping in the CSS string.
  const href = useMemo(() => resolveUrl(image), [image]);
  const loopHref = useMemo(() => resolveUrl(loopUrl), [loopUrl]);
  const less = useMediaQuery(LESS_QUERY);
  const shown = useMediaQuery(ROOM_QUERY) && !less;
  const moving = useMediaQuery(LOOP_QUERY) && !less;
  const color = !!loopHref;
  // Read only where the room shows, so a viewer who never sees it never loads it.
  const still = useRoomExposure(suite.active && shown ? href : undefined, color);
  const [measured, setMeasured] = useState<{ src: string; exposure: RoomExposure | null }>();
  const onMeasure = useCallback((src: string, exposure: RoomExposure | null) => setMeasured({ src, exposure }), []);
  const src = suite.active && moving ? loopHref : undefined;
  if (!suite.active || (!href && !src)) return { style: undefined, loop: undefined };
  const exposure = (src && measured?.src === src && measured.exposure) || still;
  return {
    style: {
      '--lightline-room-image': href ? `url("${href}")` : undefined,
      '--lightline-room-exposure': exposure?.value,
      '--lightline-room-lift': exposure?.lift,
      '--lightline-room-gray': color ? 0 : undefined,
    } as CSSProperties,
    loop: src ? ({ src, onMeasure } satisfies RoomLoopProps) : undefined,
  };
}

/**
 * The room's loop: muted, looping, inline, with no controls, hidden from assistive technology (in the room's
 * aria-hidden) and out of the tab order. It loads when the Suite shows it, stays hidden (the still behind it) until
 * its frames are measured, then fades in, and plays only while the room is on screen and the page is in view.
 */
function RoomLoop({ src, onMeasure }: RoomLoopProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let live = true;
    const show = (exposure: RoomExposure | null) => {
      if (!live) return;
      onMeasure(src, exposure);
      setReady(!!exposure);
    };
    // One pass of seeks per element, however often this runs.
    const measure = () => {
      const pass =
        measuring.get(video) ??
        measureLoop(video).then((exposure) => {
          measuredLoops.set(src, exposure);
          if (exposure) video.currentTime = 0;
          return exposure;
        });
      measuring.set(video, pass);
      void pass.then(show);
    };
    if (measuredLoops.has(src)) show(measuredLoops.get(src)!);
    else if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) measure();
    else video.addEventListener('loadeddata', measure, { once: true });
    return () => {
      live = false;
      video.removeEventListener('loadeddata', measure);
    };
  }, [src, onMeasure]);

  useEffect(() => {
    const video = ref.current;
    if (!video || !ready) return;
    let seen = false;
    const sync = () => {
      if (seen && !document.hidden) video.play().catch(() => {});
      else video.pause();
    };
    const observer = new IntersectionObserver(([entry]) => {
      seen = !!entry?.isIntersecting;
      sync();
    });
    observer.observe(video);
    document.addEventListener('visibilitychange', sync);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', sync);
      video.pause();
    };
  }, [ready]);

  return (
    <video
      ref={ref}
      className={'lightline-room-loop'}
      src={src}
      crossOrigin="anonymous"
      preload="auto"
      muted
      loop
      playsInline
      disablePictureInPicture
      disableRemotePlayback
      tabIndex={-1}
      data-ready={ready ? '' : undefined}
    />
  );
}

/**
 * The Suite's room: a plate behind the rails (the host's picture or loop from `useRoom`, or the skin's own light
 * pools) shown dim, and over it, where a host asks for it, the film's light from the ambient sample's four quadrants,
 * blended so the plate's dark stays dark and its highlights take the film's color. The stage keeps the ground behind
 * the frame, so the top row and the bar stay on the dark they were drawn for. Decorative only; the CSS removes it for
 * reduced transparency, more contrast and forced colors.
 */
export function SuiteRoom({ loop }: { loop?: RoomLoopProps }) {
  const suite = useSuite();
  if (!suite.active) return null;
  return (
    <>
      <div className={'lightline-room'} aria-hidden="true">
        <div className={'lightline-room-plate'}>{loop && <RoomLoop key={loop.src} {...loop} />}</div>
        <div className={'lightline-room-light'} />
      </div>
      <div className={'lightline-room-stage'} aria-hidden="true" />
    </>
  );
}
