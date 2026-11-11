/**
 * The page's films, streamed from Mux (the first three IDs and tracks are the workbench's, apps/preview/src/frame/films.ts;
 * Where's Home was added on his ask of 2026-11-09). The tracks are served from the workbench's public folder, which the
 * page's build shares. Each source object lives
 * for the life of the page, because MuxVideo fires `sourcechange` for every new one.
 */
export interface PageFilm {
  id: string;
  title: string;
  /** Seconds: where the stream ends, as the player reads it (shown to the nearest second, as the player shows it). */
  duration: number;
  explicit?: boolean;
  source: { playbackId: string };
  /** The player's poster and the card's still. */
  poster: string;
  still: string;
  /** The muted preview on a hovered or focused card: Mux's animated image of a few seconds. */
  preview: string;
  captions?: string;
  chapters?: string;
}

const still = (id: string, time: number, width = 640) => `https://image.mux.com/${id}/thumbnail.webp?time=${time}&width=${width}`;
const animated = (id: string, start: number) =>
  `https://image.mux.com/${id}/animated.webp?start=${start}&end=${start + 4}&width=480&fps=12`;

const ROGUE = 'CHf85FN1XpM2La8vqHL8KQ41KRE4Q00U77AOq8eRF01TU';
const FITS = 'eFvix7S2ILsnb02JGyyQLELDimvOfsUmEgpigfZdTC5Q';
const LIKENESS = 'ScXBDzaCoDdoj1I01k361PE6301C7gCZcuN20001AFaxYWM';
const HOME = 'pNSi16fgu8bAKp7YIZTXE2tKan8F6B7DCN6Tbxh9Jcg';

export const FILMS: readonly PageFilm[] = [
  {
    id: 'rogue-render',
    title: 'The Rogue Render',
    duration: 50.083,
    source: { playbackId: ROGUE },
    poster: './rogue-render-war-room.webp',
    still: still(ROGUE, 12),
    preview: animated(ROGUE, 12),
    captions: './rogue-render.en.vtt',
    chapters: './rogue-render-chapters.vtt',
  },
  {
    id: 'the-only-one-that-fits',
    title: 'The Only One That Fits',
    duration: 237.973,
    explicit: true,
    source: { playbackId: FITS },
    poster: still(FITS, 72, 1280),
    still: still(FITS, 72),
    preview: animated(FITS, 72),
    captions: './the-only-one-that-fits.en.vtt',
    chapters: './the-only-one-that-fits-chapters.vtt',
  },
  {
    // His music video (Media OS wheres-home-video-2026-09, the approved landscape cut 8a8fae63). The song starts 4 s
    // in, after the opener; the lyrics and the sections are its line map shifted by those 4 s.
    id: 'wheres-home',
    title: "Where's Home?",
    duration: 248.943,
    source: { playbackId: HOME },
    poster: still(HOME, 212, 1280),
    still: still(HOME, 212),
    preview: animated(HOME, 208),
    captions: './wheres-home.en.vtt',
    chapters: './wheres-home-chapters.vtt',
  },
  {
    id: 'likeness-models',
    title: 'Likeness models',
    duration: 22.018,
    source: { playbackId: LIKENESS },
    poster: still(LIKENESS, 19.5, 1280),
    still: still(LIKENESS, 19.5),
    preview: animated(LIKENESS, 4),
  },
];
