// The simulator patches the page's network first, so it sees every request the player makes.
import { setNetworkMode } from './simulate';

import { I18nProvider } from '@videojs/react/i18n';
import { type CSSProperties, StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import '@/skin.css';
import './preview.css';
import { playbackProps, playerStyles } from '../shell/params';
import { showCueTest } from './cue-tests';
import { findFilm } from './films';
import { initialParams, onParamsChange } from './frame';
import { Player } from './player';

const first = initialParams();
setNetworkMode(first.net);

function Preview() {
  const [params, setParams] = useState(first);
  // Bumped to reload the film when the simulated network fails or recovers; the reload picks up where the
  // film was, playing if it was.
  const [load, setLoad] = useState(0);
  const resume = useRef<{ at: number; playing: boolean } | null>(null);

  useEffect(
    () =>
      onParamsChange((next) => {
        if (setNetworkMode(next.net)) {
          const media = document.querySelector('video');
          resume.current = media ? { at: media.currentTime, playing: !media.paused } : null;
          setLoad((count) => count + 1);
        }
        setParams(next);
      }),
    []
  );

  useEffect(() => {
    const target = resume.current;
    const media = document.querySelector('video');
    if (!target || !media) return;
    resume.current = null;
    const go = () => {
      media.currentTime = target.at;
      if (target.playing) void media.play().catch(() => undefined);
    };
    if (media.readyState >= 1) go();
    else media.addEventListener('loadedmetadata', go, { once: true });
  }, [load]);

  // A caption test takes over the captions while it is on; the track may still be loading, so try again once
  // the browser has it.
  useEffect(() => {
    showCueTest(params.cues);
    const media = document.querySelector('video');
    const retry = () => showCueTest(params.cues);
    media?.textTracks.addEventListener('addtrack', retry);
    return () => media?.textTracks.removeEventListener('addtrack', retry);
  }, [params.cues, params.film, load]);

  return (
    // The provider loads Video.js's built-in translations for the selected language; Automatic sets none, and the
    // skin follows the page's language, then the browser's.
    <I18nProvider locale={params.locale === 'auto' ? undefined : params.locale}>
      <div className="preview-player" style={playerStyles(params) as CSSProperties}>
        <Player
          key={load}
          film={findFilm(params.film)}
          media={playbackProps(params)}
          cueTest={params.cues}
          audio={{ eq: params.eq, spatial: params.spatial }}
        />
      </div>
    </I18nProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Preview />
  </StrictMode>
);
