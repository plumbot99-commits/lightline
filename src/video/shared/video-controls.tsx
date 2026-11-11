/** @jsxImportSource react */

import { Controls } from '@videojs/react';
import type { ReactNode } from 'react';

import { LayoutSwitch } from '../suite/suite';
import { OptionsButton } from './options';
import { CaptionsToggle } from './captions-button';
import { ControlsContent, type ControlsSlots } from './controls';
import { QueueDrawerButton } from './queue';
import { ScreenControls } from './screen-controls';
import { StatePill } from './state-pill';
import { Title } from './title';
import { VideoBufferingIndicator } from './video-feedback';

export function VideoControlsContent({
  center = false,
  lab,
  live = false,
  menu,
  middle,
  overlay,
  renderThumbnail,
  seekBackward,
  seekForward,
}: ControlsSlots & { center?: boolean; live?: boolean; menu?: ReactNode } = {}) {
  return (
    <>
      <Controls.Backdrop className={'video-controls-backdrop'} />
      <VideoBufferingIndicator />
      <ControlsContent
        captions={!live && <CaptionsToggle />}
        center={center}
        lab={lab}
        live={live}
        menu={menu}
        middle={middle}
        overlay={overlay}
        renderThumbnail={renderThumbnail}
        seekBackward={seekBackward}
        seekForward={seekForward}
        top={
          <>
            <StatePill />
            <OptionsButton />
            <Title />
            <LayoutSwitch />
            <QueueDrawerButton />
            <ScreenControls />
          </>
        }
      />
    </>
  );
}
