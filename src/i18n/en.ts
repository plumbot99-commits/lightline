import { SUITE_TEXT } from '../video/suite/labels';

/**
 * Every word the skin adds to the player, in English: the source each locale in `./locales` translates. Keys are
 * registered under `lightline.` beside the library's own (`menu.settings`, `buttons.play`), and a template names its
 * blanks in braces as the library's do (`{seconds}`). Numbers reach a template already formatted for the locale.
 */
export const en = {
  settings: {
    chapters: 'Chapters',
    chapterAt: '{chapter}, {time}',
    captionsStyle: 'Captions style',
    size: 'Size',
    background: 'Background',
    none: 'None',
    translucent: 'Translucent',
    solid: 'Solid',
    ambient: 'Ambient light',
    off: 'Off',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    theater: 'Theater mode',
    shortcuts: 'Keyboard shortcuts',
  },
  keys: {
    playPause: 'Play or pause',
    seek: 'Seek {seconds} seconds',
    volume: 'Volume',
    mute: 'Mute',
    jump: 'Jump to a tenth',
    startEnd: 'Start or end',
    speed: 'Speed',
    captions: 'Captions',
    fullscreen: 'Fullscreen',
    pip: 'Picture in picture',
    thisPanel: 'This panel',
    row: '{action}: {keys}',
    space: 'Space',
    home: 'Home',
    end: 'End',
    saySpaceK: 'Space or K',
    saySeek: 'Left or Right arrow, J or L',
    sayVolume: 'Up or Down arrow',
    sayJump: '{first} to {last}',
    sayHomeEnd: 'Home or End',
    saySpeed: 'Less than or Greater than',
    sayQuestion: 'Question mark',
  },
  lab: {
    title: 'Audio Lab',
    preset: 'Preset',
    flat: 'Flat',
    cinema: 'Cinema',
    dialogue: 'Dialogue',
    music: 'Music',
    lateNight: 'Late Night',
    custom: 'Custom',
    equalizer: 'Equalizer',
    output: 'Output',
    stereo: 'Stereo',
    mono: 'Mono',
    wide: 'Wide',
    balance: 'Balance',
    center: 'Center',
    balanceLeft: 'Left {percent}',
    balanceRight: 'Right {percent}',
    sideLeft: 'L',
    sideRight: 'R',
    speakers: 'Speakers',
    testLeft: 'Test L',
    testRight: 'Test R',
    muted: 'Muted',
    volumeOff: 'Volume off',
    level: 'Level',
    clip: 'Clip',
    idle: 'Plays when the film does',
    levels: 'Left {left}, right {right}',
    under: 'under {db}',
    db: '{value} dB',
    hz: '{value} Hz',
    khz: '{value} kHz',
  },
  state: {
    error: 'Error',
    loading: 'Loading',
    ended: 'Ended',
    paused: 'Paused',
  },
  /** A playback rate, as the hold badge and the Timecode panel's speeds write it. */
  rate: '{rate}×',
  suite: SUITE_TEXT,
  // The page's queue: the drawer over the picture and the Up Next card at a film's end.
  queue: {
    drawer: 'Chapters and Up Next',
    upNext: 'Up next',
    playNow: 'Play now',
    cancel: 'Cancel',
    close: 'Close',
    said: 'Up next: {title}',
  },
  // The Options button in the top row and the sheet it opens over the player (DRAFT words).
  options: {
    title: 'Options',
    close: 'Close options',
  },
} as const;

/** A locale's pack: every key of the English source, each a string. */
export type LightlinePack<T = typeof en> = {
  [K in keyof T]: T[K] extends string ? string : LightlinePack<T[K]>;
};

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

/** A key of the English source, dotted (`lab.preset`, `suite.dockLeft`). */
export type TextKey = Leaves<typeof en>;
