/** @jsxImportSource react */

import { usePlayer } from '@videojs/react/video';
import { useEffect, useRef, useState } from 'react';

import { useFormat, useText } from '@/i18n/i18n';

/**
 * Hold for 2x: pressing and holding on the picture while the film plays runs it at double speed, with a small
 * "2x" badge at the top; letting go returns the speed the viewer had. Pointer and touch alike. A short tap
 * keeps its meaning (the library's tap gestures ignore presses over 250 ms, and this waits 400 ms), Space
 * stays play and pause, and keyboard users have the speed menu. The status announcer speaks the speed change,
 * so the badge is hidden from assistive technology.
 */
const HOLD_MS = 400;
const HOLD_RATE = 2;
/** A press that travels this far before the hold starts is a drag or a scroll, not a hold. */
const MOVE_PX = 10;
/** Presses on these are the controls' own, never the picture's. */
const NOT_PICTURE =
  'button, a, input, select, textarea, [role="slider"], [role="menu"], [role="menuitem"], [role="dialog"], [role="alertdialog"], .video-controls-bottom, .video-controls-top, .media-popup';

export function HoldSpeed() {
  const t = useText();
  const format = useFormat();
  const ref = useRef<HTMLSpanElement>(null);
  const [held, setHeld] = useState(false);
  const paused = usePlayer((s) => s.paused);
  const rate = usePlayer((s) => s.playbackRate);
  const setRate = usePlayer((s) => s.setPlaybackRate);
  const latest = useRef({ paused, rate, setRate });
  latest.current = { paused, rate, setRate };

  useEffect(() => {
    const root = ref.current?.parentElement;
    if (!root) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let start: { id: number; x: number; y: number } | undefined;
    let restoreTo: number | undefined;

    const release = () => {
      clearTimeout(timer);
      timer = undefined;
      start = undefined;
      if (restoreTo === undefined) return;
      latest.current.setRate(restoreTo);
      restoreTo = undefined;
      setHeld(false);
    };

    const down = (event: PointerEvent) => {
      if (event.button !== 0 || !event.isPrimary || latest.current.paused) return;
      if (!(event.target instanceof Element) || event.target.closest(NOT_PICTURE)) return;
      release();
      start = { id: event.pointerId, x: event.clientX, y: event.clientY };
      timer = setTimeout(() => {
        timer = undefined;
        if (latest.current.paused) return;
        restoreTo = latest.current.rate;
        latest.current.setRate(HOLD_RATE);
        setHeld(true);
      }, HOLD_MS);
    };

    const move = (event: PointerEvent) => {
      if (!start || event.pointerId !== start.id || restoreTo !== undefined) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > MOVE_PX) release();
    };

    const up = (event: PointerEvent) => {
      if (start && event.pointerId === start.id) release();
    };

    // A long press on touch opens the browser's context menu; while a hold is pending or running, it does not.
    const menu = (event: Event) => {
      if (timer !== undefined || restoreTo !== undefined) event.preventDefault();
    };

    root.addEventListener('pointerdown', down);
    root.addEventListener('contextmenu', menu);
    // Release anywhere ends the hold, even off the player.
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('blur', release);

    return () => {
      release();
      root.removeEventListener('pointerdown', down);
      root.removeEventListener('contextmenu', menu);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('blur', release);
    };
  }, []);

  return (
    <span ref={ref} className={'lightline-hold-badge'} data-held={held ? '' : undefined} aria-hidden="true">
      {t('rate', { rate: format.number(HOLD_RATE) })}
    </span>
  );
}
