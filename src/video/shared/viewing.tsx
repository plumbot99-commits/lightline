/** @jsxImportSource react */

import { createContext, useContext, useMemo, useState } from 'react';

/**
 * How the viewer has set up the room: the captions' size and background, the ambient light, and theater
 * mode. The skin holds this state and writes it on the container as data attributes, which the CSS reads;
 * the settings menu changes it. Theater mode also reports to the host through `onTheaterChange`, so a page
 * can widen its layout; on its own the skin brings the house lights down around the player.
 */
/** The captions' sizes, as a share of the browser's own; the menu writes each as the locale writes a percent. */
export const CAPTION_SIZES = [
  { value: '75', share: 0.75 },
  { value: '100', share: 1 },
  { value: '150', share: 1.5 },
  { value: '200', share: 2 },
] as const;

/** Each choice names its word in the skin's text (`src/i18n/en.ts`). */
export const CAPTION_BACKGROUNDS = [
  { value: 'none', label: 'settings.none' },
  { value: 'translucent', label: 'settings.translucent' },
  { value: 'solid', label: 'settings.solid' },
] as const;

/** The light that spills past the frame: off, or one of three strengths. */
export const AMBIENT_LEVELS = [
  { value: 'off', label: 'settings.off' },
  { value: 'low', label: 'settings.low' },
  { value: 'medium', label: 'settings.medium' },
  { value: 'high', label: 'settings.high' },
] as const;

export type CaptionSize = (typeof CAPTION_SIZES)[number]['value'];
export type CaptionBackground = (typeof CAPTION_BACKGROUNDS)[number]['value'];
export type AmbientLevel = (typeof AMBIENT_LEVELS)[number]['value'];

const AMBIENT_KEY = 'lightline:ambient';

/**
 * The viewer's last choice if they made one here, else medium; under reduced transparency the spill starts
 * off. Storage can be blocked, so a read that fails falls back to the default.
 */
function initialAmbient(): AmbientLevel {
  try {
    const stored = localStorage.getItem(AMBIENT_KEY);
    const known = AMBIENT_LEVELS.find((level) => level.value === stored);
    if (known) return known.value;
  } catch {
    // No storage: the default below.
  }
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-transparency: reduce)').matches;
  return reduced ? 'off' : 'medium';
}

function storeAmbient(level: AmbientLevel) {
  try {
    localStorage.setItem(AMBIENT_KEY, level);
  } catch {
    // The choice still holds for this visit.
  }
}

export interface Viewing {
  captionSize: CaptionSize;
  setCaptionSize: (size: CaptionSize) => void;
  captionBackground: CaptionBackground;
  setCaptionBackground: (background: CaptionBackground) => void;
  ambient: AmbientLevel;
  setAmbient: (level: AmbientLevel) => void;
  theater: boolean;
  setTheater: (theater: boolean) => void;
}

const ViewingContext = createContext<Viewing | null>(null);

export const ViewingProvider = ViewingContext.Provider;

export function useViewingState(onTheaterChange?: (theater: boolean) => void): Viewing {
  const [captionSize, setCaptionSize] = useState<CaptionSize>('100');
  const [captionBackground, setCaptionBackground] = useState<CaptionBackground>('translucent');
  const [ambient, setAmbientState] = useState<AmbientLevel>(initialAmbient);
  const [theater, setTheaterState] = useState(false);

  return useMemo(
    () => ({
      captionSize,
      setCaptionSize,
      captionBackground,
      setCaptionBackground,
      ambient,
      setAmbient: (level: AmbientLevel) => {
        setAmbientState(level);
        storeAmbient(level);
      },
      theater,
      setTheater: (next: boolean) => {
        setTheaterState(next);
        onTheaterChange?.(next);
      },
    }),
    [captionSize, captionBackground, ambient, theater, onTheaterChange]
  );
}

export function useViewing(): Viewing {
  const viewing = useContext(ViewingContext);
  if (!viewing) throw new Error('useViewing must be used inside the Lightline skin.');
  return viewing;
}
