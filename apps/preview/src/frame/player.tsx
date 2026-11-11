import { MuxVideo } from '@videojs/react/media/mux-video';
import { VideoPlayer } from '@videojs/react/video';

import type { AudioChange } from '@/video/audio/lab';
import { VideoSkin } from '@/video/skin';

import { AUDIO_MESSAGE } from '../shell/messages';
import type { CueTest, PlaybackProps, WorkbenchParams } from '../shell/params';
import { cueTestTrack } from './cue-tests';
import type { Film } from './films';

// What the preview plays: one of the films in `films.ts`, streamed from Mux. The Mux video component derives
// the storyboard track the seek preview's film strip reads; crossOrigin lets that track and its sprite sheets
// load from image.mux.com. The player is keyed by film, so a new pick starts clean with only its own tracks. The
// Suite's waveform reads `<film>-peaks.json`, computed from the film's master by checks/peaks.mjs.

type AudioParams = Pick<WorkbenchParams, 'eq' | 'spatial'>;

/** The viewer's Audio Lab picks go back to the shell, which keeps them in the URL as `eq` and `spatial`. */
function reportAudio(change: AudioChange) {
  if (window.parent !== window) window.parent.postMessage({ type: AUDIO_MESSAGE, ...change }, location.origin);
}

/**
 * `media` carries the workbench's playback options: autoplay, muted, loop, and preload. `cueTest` adds the
 * simulator's caption stress test as one more captions track. `audio` is the workbench's Audio Lab preset and
 * output (`eq`, `spatial`).
 */
export function Player({
  film,
  media,
  cueTest = 'off',
  audio,
}: {
  film: Film;
  media?: PlaybackProps;
  cueTest?: CueTest;
  audio?: AudioParams;
}) {
  const test = cueTestTrack(cueTest);

  return (
    <VideoPlayer key={film.id} poster={film.poster}>
      <VideoSkin
        audioPreset={audio?.eq}
        audioOutput={audio?.spatial}
        onAudioChange={reportAudio}
        peaks={`./${film.id}-peaks.json`}
      >
        <MuxVideo {...media} source={film.source} crossOrigin="anonymous" playsInline>
          {film.captions && <track kind="captions" label={film.captions.label} srcLang="en" src={film.captions.src} />}
          {film.chapters && <track kind="chapters" label="English" srcLang="en" src={film.chapters} default />}
          {test && <track key={test.id} kind="captions" label={test.label} srcLang={test.lang} src={test.src} />}
        </MuxVideo>
      </VideoSkin>
    </VideoPlayer>
  );
}
