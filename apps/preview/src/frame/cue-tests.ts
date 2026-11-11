import type { CueTest } from '../shell/params';

/**
 * Caption stress tests: one cue that lasts the whole film, so whatever moment is on screen shows it. Each
 * becomes its own captions track, chosen and shown while the test is on, to prove the control dock never
 * covers a caption at any width or caption size.
 */
const TESTS: Record<Exclude<CueTest, 'off'>, { label: string; lang: string; text: string }> = {
  long: {
    label: 'Test: long two-line cue',
    lang: 'en',
    text: [
      'A caption long enough to run the full width of the picture on a wide player,',
      'and a second line just as long, so the dock has two full lines to keep clear of.',
    ].join('\n'),
  },
  localized: {
    label: 'Test: long localized string',
    lang: 'de',
    text: [
      'Die Untertitel bleiben über der Steuerleiste, auch bei Donaudampfschifffahrtsgesellschaftskapitänen',
      'und anderen sehr langen deutschen Wörtern, die sich nicht umbrechen lassen.',
    ].join('\n'),
  },
};

const urls = new Map<CueTest, string>();

/** The track for a test, its VTT served from a blob URL made once per page. */
export function cueTestTrack(test: CueTest) {
  if (test === 'off') return undefined;
  const { label, lang, text } = TESTS[test];
  let src = urls.get(test);
  if (!src) {
    src = URL.createObjectURL(new Blob([`WEBVTT\n\n00:00:00.000 --> 99:00:00.000\n${text}\n`], { type: 'text/vtt' }));
    urls.set(test, src);
  }
  return { id: test, label, lang, src };
}

/** Show the test's track and hide every other caption track; with the test off, leave the viewer's choice. */
export function showCueTest(test: CueTest) {
  const media = document.querySelector('video');
  const track = cueTestTrack(test);
  if (!media || !track) return;
  for (const textTrack of media.textTracks) {
    if (textTrack.kind !== 'captions' && textTrack.kind !== 'subtitles') continue;
    textTrack.mode = textTrack.label === track.label ? 'showing' : 'disabled';
  }
}
