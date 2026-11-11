/**
 * DRAFT: every word on the page, for the studio's copy check before anything ships. Each says what is built and
 * nothing more. No em dashes, no hype words, nothing about winning.
 * The skin's own labels inside the player are not here: they come in the viewer's language (src/i18n).
 */
export const DRAFT = {
  /** The page's head: its title, and the words a link to it shows (description, og and twitter tags). */
  pageTitle: 'Lightline, a Video.js v10 skin by FredericK DesigN StudiO',
  description:
    'A Video.js v10 skin that draws its controls as thin lines of light on a dark ground. Two layouts: Cinema for watching, Suite for working on a film.',
  ogImageAlt: 'The Lightline logo on black: one neon blue line that rises into a play triangle and runs on, the word LIGHTLINE under it.',
  title: 'Lightline',
  byline: 'A Video.js v10 skin by',
  studio: 'FredericK DesigN StudiO',
  intro:
    'Controls drawn as thin lines of light on a dark ground, and the film’s own color spilling past the frame. Two layouts: Cinema for watching, Suite for working on a film.',
  /** Free, in the licence's own terms, with the code's address (his word of 2026-11-10: launch it for free, link the repo). */
  free: 'Lightline is free. Anyone may use it, change it and ship it under the Apache License 2.0, with credit.',
  repoLabel: 'The code is on GitHub',
  repoUrl: 'https://github.com/plumbot99-commits/lightline',
  room: 'Room',
  roomDefault: 'Lightline’s own',
  language: 'Player language',
  languageAuto: 'Automatic',
  glass: 'Glass',
  glassValue: (seeThrough: number) => `${seeThrough}% see-through`,
  film: 'Film',
  network: 'Network',
  networkModes: { normal: 'Normal', stall: 'Stalled', error: 'Network error' },
  library: 'The library',
  libraryNote: 'Pick a film to play it here.',
  /** What the player is doing with the film on its card, in the states' own words. */
  cardState: {
    ready: 'Ready',
    playing: 'Playing',
    paused: 'Paused',
    loading: 'Loading',
    ended: 'Ended',
    error: 'Error',
  },
  explicit: 'Explicit',
  chapters: 'Chapters',
  modes: 'Cinema and Suite',
  cinema: 'Cinema',
  cinemaText: 'The film fills the frame, with the controls over the picture.',
  suite: 'Suite',
  suiteText:
    'The Audio Lab, the timecode deck, stream telemetry, and the guides with a timeline dock around the picture instead of over it. The switch above the picture opens it when the player is at least 1,100 pixels wide. Where the film would be narrow between them, the side panels move under it.',
  states: 'The states',
  statesNote: 'Each state has one color, and the color means only that.',
  stateList: [
    { id: 'paused', name: 'Paused', color: 'orange', text: 'Orange means waiting. The light dims to an orange glow.' },
    { id: 'loading', name: 'Loading', color: 'blue', text: 'Blue means running. The state pill says Loading while the stream catches up.' },
    { id: 'ended', name: 'Ended', color: 'green', text: 'Green means done. A green sweep runs along the bar.' },
    { id: 'error', name: 'Error', color: 'magenta', text: 'Magenta means missed. The light flickers once and the error dialog opens.' },
  ],
  icons: 'The icons',
  iconsNote:
    'Thirty-one icons drawn in Illustrator for the skin, on an 18 by 18 grid with a 1.4 outline.',
  thinking: 'The design thinking',
  thinkingText: [
    'Lightline draws its controls as thin lines of light on a dark ground, so the film stays the brightest thing on the screen.',
    'Each color carries one meaning: cyan for the next move, blue for loading, orange for paused, green for ended, and magenta for an error.',
    'Cinema is for watching, and Suite is for working on a film, with an Audio Lab, a timecode deck, stream telemetry and framing guides around the picture.',
    'Every control can be reached from the keyboard and read in forced colors, and its labels come in 51 locales, machine-translated.',
  ],
  footer: 'Streamed from Mux. Built on Video.js v10 for React.',
} as const;
