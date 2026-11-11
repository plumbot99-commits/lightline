/**
 * The films the workbench can play, all streamed from Mux. Each keeps its own tracks, served from
 * `apps/preview/public`; a film without a track simply has none. The source objects live here for the life of
 * the page, because MuxVideo fires `sourcechange` for every new source object.
 */
export interface Film {
  id: string;
  /** The picker's label: the title, its length, and anything a viewer should know first. */
  label: string;
  source: { playbackId: string };
  poster: string;
  captions?: { label: string; src: string };
  chapters?: string;
}

/** A Mux thumbnail at `time` seconds, for a film without a better still in the workbench. */
const muxStill = (playbackId: string, time: number) =>
  `https://image.mux.com/${playbackId}/thumbnail.webp?time=${time}&width=1280`;

export const FILMS = [
  {
    // The studio's 50-second film, approved by Frederick on 2026-10-19 (sha256 c7a31330), asset NNhcewsC...
    // The poster and captions were copied from frederick-design's public folder; the six scenes are grouped
    // from the approved cut's edit map.
    id: 'rogue-render',
    label: 'The Rogue Render (0:50)',
    source: { playbackId: 'CHf85FN1XpM2La8vqHL8KQ41KRE4Q00U77AOq8eRF01TU' },
    poster: './rogue-render-war-room.webp',
    captions: { label: 'English', src: './rogue-render.en.vtt' },
    chapters: './rogue-render-chapters.vtt',
  },
  {
    // Frederick's music video. The captions are the lyrics as sung (86 lines) and the chapters its nine song
    // sections, both from the production's line map. The still is the painted room at 1:12.
    id: 'the-only-one-that-fits',
    label: 'The Only One That Fits (3:58, explicit)',
    source: { playbackId: 'eFvix7S2ILsnb02JGyyQLELDimvOfsUmEgpigfZdTC5Q' },
    poster: muxStill('eFvix7S2ILsnb02JGyyQLELDimvOfsUmEgpigfZdTC5Q', 72),
    captions: { label: 'English', src: './the-only-one-that-fits.en.vtt' },
    chapters: './the-only-one-that-fits-chapters.vtt',
  },
  {
    // A silent film with no chapters: the player reads right with no sound and a plain beam. The still is
    // its closing card at 0:19.
    id: 'likeness-models',
    label: 'Likeness models (0:22, silent)',
    source: { playbackId: 'ScXBDzaCoDdoj1I01k361PE6301C7gCZcuN20001AFaxYWM' },
    poster: muxStill('ScXBDzaCoDdoj1I01k361PE6301C7gCZcuN20001AFaxYWM', 19.5),
  },
] as const satisfies readonly Film[];

export type FilmId = (typeof FILMS)[number]['id'];

export const FILM_IDS = FILMS.map((film) => film.id);

export function findFilm(id: FilmId): Film {
  return FILMS.find((film) => film.id === id) ?? FILMS[0];
}
