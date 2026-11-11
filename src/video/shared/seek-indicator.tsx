/** @jsxImportSource react */

import { SeekIndicator as SeekIndicatorPrimitive } from '@videojs/react';
import { ChevronIcon as ChevronIconPrimitive } from '@/video/icons';

import { cn } from '@/lib/resolve-class-name';

import { KEY_FEEDBACK_MS } from './indicators';

/** Feedback for the arrow-key and double-tap seeks, shown on the side it seeks towards. */
export function SeekIndicator() {
  return (
    <SeekIndicatorPrimitive.Root closeDelay={KEY_FEEDBACK_MS} className={cn('media-indicator', 'media-seek-indicator')}>
      <ChevronIconPrimitive className={'media-seek-indicator-icon'} />
      <SeekIndicatorPrimitive.Value className={'media-seek-indicator-value'} />
    </SeekIndicatorPrimitive.Root>
  );
}
