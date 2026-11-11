/** @jsxImportSource react */

import { PlayButton as PlayButtonPrimitive } from '@videojs/react';
import {
  RestartIcon as RestartIconPrimitive,
  PlayIcon as PlayIconPrimitive,
  PauseIcon as PauseIconPrimitive,
} from '@/video/icons';
import type { ClassValue } from 'cn';

import { cn, resolveClassName } from '@/lib/resolve-class-name';

import { Button } from './button';
import { ButtonTooltip } from './tooltip';
import { BufferingIndicator } from './video-feedback';

export function PlayButton({
  className,
  iconClassName,
  tooltip = true,
  ...props
}: PlayButtonPrimitive.Props & { iconClassName?: ClassValue; tooltip?: boolean } = {}) {
  return (
    <ButtonTooltip disabled={!tooltip}>
      <PlayButtonPrimitive
        render={<Button />}
        className={(state) => cn('media-play-button', resolveClassName(className, state))}
        {...props}
      >
        <RestartIconPrimitive
          className={cn('media-button-icon-base', 'media-play-button-restart-icon', iconClassName)}
        />
        <PlayIconPrimitive className={cn('media-button-icon-base', 'media-play-button-play-icon', iconClassName)} />
        <PauseIconPrimitive className={cn('media-button-icon-base', 'media-play-button-pause-icon', iconClassName)} />
      </PlayButtonPrimitive>
    </ButtonTooltip>
  );
}

export function AudioPlayButton() {
  return (
    <div className={'media-play-button-audio'}>
      <PlayButton />
      <BufferingIndicator className={'media-play-button-buffering'} />
    </div>
  );
}
