// The Suite's layout: which rail each panel docks on and its order there, or where it floats, and whether it is
// open. Pure functions over a plain object, kept in localStorage behind try/catch.

export type Rail = 'left' | 'right' | 'top' | 'bottom';
export type LayoutMode = 'cinema' | 'suite';

export const RAILS: readonly Rail[] = ['top', 'left', 'right', 'bottom'];
export const PANEL_IDS = ['lab', 'deck', 'telemetry', 'guides'] as const;
export type PanelId = (typeof PANEL_IDS)[number];

/** A floating panel keeps its side of the frame and its spot in the room (its top left corner, in pixels). */
export interface Place {
  rail: Rail;
  order: number;
  float: { x: number; y: number } | null;
  open: boolean;
}

export interface SuiteLayout {
  mode: LayoutMode;
  panels: Record<PanelId, Place>;
}

export const DEFAULT_PANELS: Record<PanelId, Place> = {
  lab: { rail: 'left', order: 0, float: null, open: true },
  telemetry: { rail: 'right', order: 0, float: null, open: true },
  deck: { rail: 'bottom', order: 0, float: null, open: true },
  guides: { rail: 'bottom', order: 1, float: null, open: true },
};

const KEY = 'lightline:suite';

/** The panels docked on a rail, in order. */
export function docked(layout: SuiteLayout, rail: Rail): PanelId[] {
  return PANEL_IDS.filter((id) => {
    const place = layout.panels[id];
    return place.open && !place.float && place.rail === rail;
  }).sort((a, b) => layout.panels[a].order - layout.panels[b].order);
}

/** The panels floating on a side of the frame. */
export function floating(layout: SuiteLayout, rail: Rail): PanelId[] {
  return PANEL_IDS.filter((id) => {
    const place = layout.panels[id];
    return place.open && place.float && place.rail === rail;
  });
}

/** The side rails with panels docked on them. */
export function sidesDocked(layout: SuiteLayout): Rail[] {
  return (['left', 'right'] as const).filter((rail) => docked(layout, rail).length > 0);
}

/**
 * The layout as the room shows it where the film would be too narrow between the side rails: the panels docked on
 * the left and right (or on the one side given) go to the bottom rail, the left rail's before the bottom rail's own and
 * the right rail's after them, each in its order, so they keep their side of the room. Floating panels stay where
 * they float.
 */
export function sidesUnder(layout: SuiteLayout, only?: 'left' | 'right'): SuiteLayout {
  const panels = { ...layout.panels };
  const side = (rail: 'left' | 'right') => (!only || only === rail ? docked(layout, rail) : []);
  [...side('left'), ...docked(layout, 'bottom'), ...side('right')].forEach(
    (id, order) => (panels[id] = { ...panels[id], rail: 'bottom', order })
  );
  return { ...layout, panels };
}

/** Number the panels 0, 1, 2 in the given order. */
function renumber(panels: Record<PanelId, Place>, ids: PanelId[]) {
  ids.forEach((id, order) => (panels[id] = { ...panels[id], order }));
}

export function dock(layout: SuiteLayout, id: PanelId, rail: Rail, index = Infinity): SuiteLayout {
  const panels = { ...layout.panels };
  renumber(
    panels,
    docked(layout, layout.panels[id].rail).filter((other) => other !== id)
  );
  const onto = docked({ ...layout, panels }, rail).filter((other) => other !== id);
  onto.splice(Math.max(0, Math.min(index, onto.length)), 0, id);
  panels[id] = { rail, order: 0, float: null, open: true };
  renumber(panels, onto);
  return { ...layout, panels };
}

export function float(layout: SuiteLayout, id: PanelId, rail: Rail, x: number, y: number): SuiteLayout {
  const panels = { ...layout.panels };
  renumber(
    panels,
    docked(layout, layout.panels[id].rail).filter((other) => other !== id)
  );
  panels[id] = { ...panels[id], rail, float: { x: Math.round(x), y: Math.round(y) }, open: true };
  return { ...layout, panels };
}

/** One step earlier (-1) or later (1) on its rail; unchanged at either end. */
export function step(layout: SuiteLayout, id: PanelId, by: -1 | 1): SuiteLayout {
  const ids = docked(layout, layout.panels[id].rail);
  const at = ids.indexOf(id);
  const to = at + by;
  if (at < 0 || to < 0 || to >= ids.length) return layout;
  [ids[at], ids[to]] = [ids[to]!, ids[at]!];
  const panels = { ...layout.panels };
  renumber(panels, ids);
  return { ...layout, panels };
}

export function setOpen(layout: SuiteLayout, id: PanelId, open: boolean): SuiteLayout {
  const place = layout.panels[id];
  if (open === place.open) return layout;
  const panels = { ...layout.panels };
  if (open) {
    // A panel shown again goes to the end of its rail.
    panels[id] = { ...place, open: true, order: place.float ? 0 : docked(layout, place.rail).length };
  } else {
    panels[id] = { ...place, open: false };
    renumber(panels, docked({ ...layout, panels }, place.rail));
  }
  return { ...layout, panels };
}

const isRail = (value: unknown): value is Rail => RAILS.includes(value as Rail);

export function loadLayout(): SuiteLayout {
  const fallback: SuiteLayout = { mode: 'cinema', panels: DEFAULT_PANELS };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<SuiteLayout> | null;
    if (!raw || typeof raw !== 'object') return fallback;
    const panels = { ...DEFAULT_PANELS };
    for (const id of PANEL_IDS) {
      const place = raw.panels?.[id];
      if (!place || !isRail(place.rail)) continue;
      const spot = place.float;
      panels[id] = {
        rail: place.rail,
        order: Number(place.order) || 0,
        float:
          spot && Number.isFinite(spot.x) && Number.isFinite(spot.y) ? { x: Number(spot.x), y: Number(spot.y) } : null,
        open: place.open !== false,
      };
    }
    return { mode: raw.mode === 'suite' ? 'suite' : 'cinema', panels };
  } catch {
    return fallback;
  }
}

export function storeLayout(layout: SuiteLayout) {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    // The layout still holds for this visit.
  }
}
