/** @jsxImportSource react */

import { MuteButton as MuteButtonPrimitive } from '@videojs/react';
import {
  VolumeOffIcon as VolumeOffIconPrimitive,
  VolumeHighIcon as VolumeHighIconPrimitive,
} from '@/video/icons';

import { cn, resolveClassName } from '@/lib/resolve-class-name';

import { Button } from './button';

export function MuteButton({ className, ...props }: MuteButtonPrimitive.Props = {}) {
  return (
    <MuteButtonPrimitive
      render={<Button />}
      className={(state) => cn('media-mute-button', resolveClassName(className, state))}
      {...props}
    >
      <VolumeOffIconPrimitive className={cn('media-button-icon', 'media-mute-button-off-icon')} />
      <VolumeHighIconPrimitive className={cn('media-button-icon', 'media-mute-button-high-icon')} />
    </MuteButtonPrimitive>
  );
}
