/** @jsxImportSource react */

import { Time, Controls, BufferingIndicator, Tooltip } from '@videojs/react';
import { usePlayer } from '@videojs/react/video';
import type { ReactNode } from 'react';

import { useFormat } from '@/i18n/i18n';

import { cn } from '@/lib/resolve-class-name';

import { LiveButton } from './live-button';
import { AudioPlayButton, PlayButton } from './play-button';
import { TimeSlider } from './time-slider';
import { type ThumbnailSlot } from './time-slider';
import { VolumePopover } from './volume-popover';

export function ControlsRow({
  audio = false,
  captions,
  lab,
  live = false,
  menu,
  middle,
  rate,
  seekBackward,
  seekForward,
}: ControlsSlots & { audio?: boolean; live?: boolean; menu?: ReactNode } = {}) {
  const format = useFormat();
  const ended = usePlayer((s) => s.ended);
  const duration = usePlayer((s) => s.duration);
  // The film's length to the nearest second (format.length), so the renditions' few hundredths never show as two
  // lengths; at the end the elapsed time reads the same length, not the second before it.
  const length: Time.Value.Props['render'] = (props, state) => <time {...props}>{format.length(state.seconds)}</time>;
  const elapsed: Time.Value.Props['render'] = (props, state) => (
    <time {...props}>{ended && state.type === 'current' ? format.length(duration) : props.children}</time>
  );
  return (
    <Controls.Group className={'video-controls-row'}>
      <Controls.Group className={cn('video-controls-group', 'video-controls-start')}>
        {audio ? <AudioPlayButton /> : <PlayButton />}
        {seekBackward}
        {seekForward}
        {live && <LiveButton />}
        {!audio && <VolumePopover />}
        {lab}
        {!live && (
          <Time.Group className={'media-time-group'}>
            <Time.Value className={'media-time-toggle'} type="current" toggle render={elapsed} />
            <Time.Value className={'media-time-current-value'} type="current" render={elapsed} />
            <Time.Separator className={'media-time-separator'} />
            <Time.Value className={'media-time-duration-value'} type="duration" render={length} />
          </Time.Group>
        )}
      </Controls.Group>

      {middle}

      <Controls.Group className={'video-controls-group'}>
        {captions}
        {rate}
        {menu ?? (audio && <VolumePopover />)}
      </Controls.Group>
    </Controls.Group>
  );
}

export interface ControlsSlots extends ThumbnailSlot {
  /** The captions toggle, supplied by the video presets because the audio presets have no text track feature. */
  captions?: ReactNode;
  /** The Audio Lab's button, beside the volume, supplied by the video skin. */
  lab?: ReactNode;
  /** The bar's middle, between the time and the icons on the right: the Suite's guides, supplied by the video skin. */
  middle?: ReactNode;
  /** Drawn over the picture between the center buttons and the bar, so it comes between them by Tab (the queue). */
  overlay?: ReactNode;
  /** The playback-rate control, supplied by the on-demand audio preset. */
  rate?: ReactNode;
  /** The skip-back control, supplied by the presets that have a timeline. */
  seekBackward?: ReactNode;
  /** The skip-forward control, supplied by the presets that have a timeline. */
  seekForward?: ReactNode;
}

export function ControlsContent({
  audio = false,
  captions,
  center = false,
  lab,
  live = false,
  menu,
  middle,
  overlay,
  rate,
  renderThumbnail,
  seekBackward,
  seekForward,
  top,
}: ControlsSlots & { audio?: boolean; center?: boolean; live?: boolean; menu?: ReactNode; top?: ReactNode } = {}) {
  return (
    <Controls.Content className={cn('video-controls-content', audio && 'audio-controls-content')}>
      <Tooltip.Provider>
        {top && <Controls.Group className={'video-controls-top'}>{top}</Controls.Group>}
        {center && (
          <BufferingIndicator className={'video-controls-buffering'}>
            <Controls.Group className={'video-controls-center'}>
              {seekBackward}
              <PlayButton
                className={cn('video-controls-center-button', 'video-controls-center-play')}
                iconClassName={'video-controls-center-play-icon'}
                tooltip={false}
              />
              {seekForward}
            </Controls.Group>
          </BufferingIndicator>
        )}
        {overlay}
        <div
          className={cn(
            'video-controls-bottom',
            audio && 'audio-controls-bottom',
            !audio && 'video-controls-video-bottom'
          )}
        >
          {!live && <TimeSlider audio={audio} renderThumbnail={renderThumbnail} />}
          <ControlsRow
            audio={audio}
            captions={captions}
            lab={lab}
            live={live}
            menu={menu}
            middle={middle}
            rate={rate}
            seekBackward={center ? undefined : seekBackward}
            seekForward={center ? undefined : seekForward}
          />
        </div>
      </Tooltip.Provider>
    </Controls.Content>
  );
}
