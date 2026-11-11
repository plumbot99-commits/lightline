/** @jsxImportSource react */

'use client';

import '../styles/video/scaffold.css';
import '../styles/themes/lightline.css';
import './skin.css';
import './lightline.css';
import './suite.css';
import './queue.css';
import './options.css';
import { Container as ContainerPrimitive, Poster as PosterPrimitive, Slider as SliderPrimitive } from '@videojs/react';
import type { ReactNode } from 'react';

import { LightlineI18n } from '@/i18n/i18n';
import { cn } from '@/lib/resolve-class-name';

import { AudioLabProvider, type AudioLabHostProps } from './audio/lab';
import { VideoGestures } from './behaviors/gestures';
import { HoldSpeed } from './behaviors/hold-speed';
import { VideoHotkeys } from './behaviors/hotkeys';
import { VideoControls } from './controls';
import { ErrorDialog } from './shared/error-dialog';
import { Indicators } from './shared/indicators';
import { Lightline } from './shared/lightline';
import { SeekIndicator } from './shared/seek-indicator';
import { AnnounceProvider, StatusAnnouncer } from './shared/status-announcer';
import { Poster } from './shared/video-feedback';
import { OptionsSheet, type OptionsHostProps, OptionsProvider } from './shared/options';
import { type QueueHostProps, QueueProvider } from './shared/queue';
import { useViewing, useViewingState, ViewingProvider } from './shared/viewing';
import { GuidesOverlay, PanelBody } from './suite/panels';
import {
  type SuiteHostProps,
  SuiteFrame,
  SuiteProvider,
  SuiteRail,
  SuiteRoom,
  useRoom,
  useSuite,
} from './suite/suite';

export interface VideoSkinProps extends Omit<ContainerPrimitive.Props, 'children'>,
    AudioLabHostProps,
    SuiteHostProps,
    QueueHostProps,
    OptionsHostProps {
  children?: ReactNode;
  renderPoster?: PosterPrimitive.ImageProps['render'];
  renderThumbnail?: SliderPrimitive.Thumbnail.ImageProps['render'];
  /** Called when the viewer turns theater mode on or off in the settings menu, so the page can widen. */
  onTheaterChange?: (theater: boolean) => void;
}

const panel = (id: Parameters<typeof PanelBody>[0]['id']) => <PanelBody id={id} />;

export function VideoSkin({
  children,
  className,
  renderPoster,
  renderThumbnail,
  onTheaterChange,
  audioPreset,
  audioOutput,
  onAudioChange,
  peaks,
  room,
  roomLoop,
  queue,
  options,
  ...props
}: VideoSkinProps = {}) {
  const viewing = useViewingState(onTheaterChange);

  // Every word the skin adds, and the library's own, in the viewer's language (src/i18n).
  return (
    <LightlineI18n>
      <ViewingProvider value={viewing}>
        <AnnounceProvider>
          <AudioLabProvider audioPreset={audioPreset} audioOutput={audioOutput} onAudioChange={onAudioChange}>
            <SuiteProvider peaks={peaks}>
              <QueueProvider queue={queue}>
                <OptionsProvider options={options}>
                  <Room
                    className={className}
                    renderPoster={renderPoster}
                    renderThumbnail={renderThumbnail}
                    room={room}
                    roomLoop={roomLoop}
                    {...props}
                  >
                    {children}
                  </Room>
                </OptionsProvider>
              </QueueProvider>
            </SuiteProvider>
          </AudioLabProvider>
        </AnnounceProvider>
      </ViewingProvider>
    </LightlineI18n>
  );
}

/**
 * The container, as Cinema or as the Suite's room. In the room the top and left rails come before the frame and
 * the right and bottom rails after it, so the order a keyboard meets them is the order they are seen in. The room's
 * backdrop comes first of all, so everything else is drawn over it.
 */
function Room({
  children,
  className,
  renderPoster,
  renderThumbnail,
  room,
  roomLoop,
  ...props
}: Omit<VideoSkinProps, 'onTheaterChange' | 'audioPreset' | 'audioOutput' | 'onAudioChange' | 'peaks' | 'queue' | 'options'>) {
  const viewing = useViewing();
  const suite = useSuite();
  const { style: roomStyle, loop } = useRoom(room, roomLoop);

  return (
    <ContainerPrimitive
      className={cn('media-skin', 'media-container', 'media-video', 'lightline', className)}
      data-theme="scaffold"
      data-preset="video"
      data-captions-size={viewing.captionSize}
      data-captions-background={viewing.captionBackground}
      data-ambient={viewing.ambient}
      data-theater={viewing.theater ? '' : undefined}
      data-layout={suite.active ? 'suite' : undefined}
      data-panels-under={suite.active && suite.under ? '' : undefined}
      {...props}
      style={roomStyle ? { ...roomStyle, ...props.style } : props.style}
    >
      <SuiteRoom loop={loop} />
      <SuiteRail rail="top" render={panel} />
      <SuiteRail rail="left" render={panel} />
      {children}
      <Poster renderImage={renderPoster} />
      <Lightline />
      <ErrorDialog />
      <VideoControls renderThumbnail={renderThumbnail} />
      <SuiteFrame />
      <GuidesOverlay />
      <SuiteRail rail="right" render={panel} />
      <SuiteRail rail="bottom" render={panel} />
      <OptionsSheet />

      <VideoHotkeys />
      <VideoGestures />
      <HoldSpeed />
      <StatusAnnouncer />
      <Indicators>
        <SeekIndicator />
      </Indicators>
    </ContainerPrimitive>
  );
}
