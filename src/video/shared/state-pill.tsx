/** @jsxImportSource react */

import { usePlayer } from '@videojs/react/video';

import { useText } from '@/i18n/i18n';

/**
 * The state pill: names what the player is doing, the way the Work page at frederickdesign.studio names a
 * step with a word and a color. Nothing shows while the film plays or before it first starts. The skin's
 * status announcer already speaks these changes, so the pill is hidden from assistive technology.
 */
type PillState = 'error' | 'loading' | 'ended' | 'paused';

export function StatePill() {
  const t = useText();
  const state = usePlayer((s): PillState | null => {
    if (s.error) return 'error';
    if (s.waiting) return 'loading';
    if (s.ended) return 'ended';
    if (s.paused && s.started) return 'paused';
    return null;
  });

  return (
    <span className={'lightline-state-pill'} data-state={state ?? undefined} aria-hidden="true">
      {state ? t(`state.${state}`) : null}
    </span>
  );
}
