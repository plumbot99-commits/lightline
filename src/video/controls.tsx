/** @jsxImportSource react */

import { Controls } from '@videojs/react';

import { cn } from '@/lib/resolve-class-name';

import { AudioLabControl } from './shared/audio-lab';
import { SeekButton } from './shared/seek-button';
import { QueueDrawer, UpNext } from './shared/queue';
import { SettingsMenu } from './shared/settings-menu';
import type { ThumbnailSlot } from './shared/time-slider';
import { VideoControlsContent } from './shared/video-controls';
import { BarGuides } from './suite/bar-guides';

export function VideoControls({ renderThumbnail }: ThumbnailSlot = {}) {
  return (
    <Controls.Root>
      <VideoControlsContent
        center
        lab={<AudioLabControl />}
        menu={<SettingsMenu />}
        middle={<BarGuides />}
        overlay={
          <>
            <QueueDrawer />
            <UpNext />
          </>
        }
        renderThumbnail={renderThumbnail}
        seekBackward={
          <SeekButton
            className={cn('video-controls-center-button', 'video-controls-center-seek')}
            iconClassName={'video-controls-center-seek-icon'}
            seconds={-10}
            tooltip={false}
          />
        }
        seekForward={
          <SeekButton
            className={cn('video-controls-center-button', 'video-controls-center-seek')}
            iconClassName={'video-controls-center-seek-icon'}
            seconds={10}
            tooltip={false}
          />
        }
      />
    </Controls.Root>
  );
}
