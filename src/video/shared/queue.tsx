/** @jsxImportSource react */

import { usePlayer } from '@videojs/react/video';
import {
  createContext,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useFormat, useText } from '@/i18n/i18n';

import { useAudioLab } from '../audio/lab';
import { QueueIcon } from '../icons';
import { useChapters } from '../suite/panels';
import { Button } from './button';
import { useAnnounce } from './status-announcer';
import { ButtonTooltip } from './tooltip';

/**
 * The page's queue, when a host gives one: a drawer over the picture with the film's chapters and the films to come
 * (so switching works in fullscreen, where the page's own controls cannot be seen), and the Up Next card at a film's
 * end. Without a queue the skin draws neither. Brief: design/page.md.
 */
export interface QueueFilm {
  id: string;
  title: string;
  /** Seconds. */
  duration: number;
  /** A frame of the film, for the card and the drawer. */
  still: string;
}

export interface Queue {
  films: readonly QueueFilm[];
  /** The id of the film in the player. */
  current: string;
  /** Load a film in the player and play it. */
  onPick: (id: string) => void;
}

export interface QueueHostProps {
  queue?: Queue;
}

interface QueueState extends Queue {
  open: boolean;
  setOpen: (open: boolean) => void;
  drawerId: string;
}

const QueueContext = createContext<QueueState | null>(null);

export function QueueProvider({ queue, children }: QueueHostProps & { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const drawerId = `lightline-queue-${useId().replace(/:/g, '')}`;
  const value = useMemo(() => (queue ? { ...queue, open, setOpen, drawerId } : null), [queue, open, drawerId]);
  return <QueueContext.Provider value={value}>{children}</QueueContext.Provider>;
}

/** The films after the current one, in order; after the last film the first comes next. */
function upcoming(queue: Queue) {
  const at = Math.max(0, queue.films.findIndex((film) => film.id === queue.current));
  return [...queue.films.slice(at + 1), ...queue.films.slice(0, at)];
}

/** The player's hotkeys listen on the container, below React's root: keys meant for the queue stop here. */
function useOwnKeys(ref: RefObject<HTMLElement | null>, active: boolean, onEscape?: () => void) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    const keydown = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === 'Escape' && onEscape) {
        event.preventDefault();
        onEscape();
      }
    };
    el.addEventListener('keydown', keydown);
    return () => el.removeEventListener('keydown', keydown);
  }, [ref, active, onEscape]);
}

export function QueueDrawerButton() {
  const queue = useContext(QueueContext);
  const t = useText();
  if (!queue) return null;

  return (
    <ButtonTooltip label={t('queue.drawer')}>
      <Button
        className={'lightline-queue-button'}
        aria-label={t('queue.drawer')}
        aria-expanded={queue.open}
        aria-controls={queue.drawerId}
        onClick={() => queue.setOpen(!queue.open)}
      >
        <QueueIcon className={'media-button-icon'} />
      </Button>
    </ButtonTooltip>
  );
}

/** The drawer: Chapters and Up Next over the picture. Escape or Close shuts it and gives focus back to its button. */
export function QueueDrawer() {
  const queue = useContext(QueueContext);
  const t = useText();
  const format = useFormat();
  const lab = useAudioLab();
  const chapters = useChapters(lab.media as HTMLVideoElement | null);
  const currentTime = usePlayer((s) => s.currentTime);
  const ref = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const open = !!queue?.open;

  const close = useMemo(
    () => () => {
      // Focus goes back to the button that opened it, before the drawer goes.
      ref.current
        ?.closest('.media-container')
        ?.querySelector<HTMLElement>(`[aria-controls="${queue?.drawerId}"]`)
        ?.focus();
      queue?.setOpen(false);
    },
    [queue]
  );
  useOwnKeys(ref, open, close);

  useEffect(() => {
    if (open) ref.current?.querySelector<HTMLElement>('button')?.focus();
  }, [open]);

  if (!queue || !open) return null;
  const current = chapters.findIndex((c) => currentTime >= c.start && currentTime < c.end);

  return (
    <div ref={ref} id={queue.drawerId} role="dialog" aria-label={t('queue.drawer')} className={'lightline-queue-drawer'}>
      <div className={'lightline-queue-head'}>
        <span className={'lightline-queue-title'} aria-hidden="true">
          {t('queue.drawer')}
        </span>
        <button type="button" className={'lightline-queue-close'} onClick={close}>
          {t('queue.close')}
        </button>
      </div>
      {chapters.length > 0 && (
        <section aria-labelledby={`${headingId}-chapters`}>
          <h3 id={`${headingId}-chapters`} className={'lightline-queue-heading'}>
            {t('settings.chapters')}
          </h3>
          <ul className={'lightline-queue-list'}>
            {chapters.map((chapter, index) => (
              <li key={`${chapter.start}`}>
                <button
                  type="button"
                  className={'lightline-queue-chapter'}
                  aria-current={index === current ? 'true' : undefined}
                  onClick={() => {
                    const video = lab.media as HTMLVideoElement | null;
                    if (video) video.currentTime = chapter.start;
                  }}
                >
                  <span>{chapter.text}</span>
                  <span className={'lightline-queue-time'}>{format.clock(chapter.start)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby={`${headingId}-next`}>
        <h3 id={`${headingId}-next`} className={'lightline-queue-heading'}>
          {t('queue.upNext')}
        </h3>
        <ul className={'lightline-queue-list'}>
          {upcoming(queue).map((film) => (
            <li key={film.id}>
              <button
                type="button"
                className={'lightline-queue-film'}
                onClick={() => {
                  close();
                  queue.onPick(film.id);
                }}
              >
                <img className={'lightline-queue-still'} src={film.still} alt="" />
                <span>{film.title}</span>
                <span className={'lightline-queue-time'}>{format.length(film.duration)}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

const COUNT = 5;

/**
 * Up Next: in a film's last five seconds of play, or once it has ended, a card with the next film and a five-second
 * count; at the end of the count, once the film has ended, the next one plays. Play now goes at once; Cancel puts
 * the card away and leaves the film ended. Said once each time it appears.
 */
export function UpNext() {
  const queue = useContext(QueueContext);
  const t = useText();
  const format = useFormat();
  const announce = useAnnounce();
  const currentTime = usePlayer((s) => s.currentTime);
  const duration = usePlayer((s) => s.duration);
  const ended = usePlayer((s) => s.ended);
  const paused = usePlayer((s) => s.paused);
  const ref = useRef<HTMLDivElement>(null);
  const [cancelled, setCancelled] = useState(false);
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(0);
  const said = useRef(false);

  const next = queue ? upcoming(queue)[0] : undefined;
  const early = !ended && !(duration > 0 && duration - currentTime <= COUNT);
  const near = !!next && duration > 0 && (ended || (!paused && !early));
  const shown = near && !cancelled;

  // A Cancel holds the ended film; a seek back before the last seconds, leaving the end (a seek or a replay), or a
  // new film lifts it.
  const endedCancelled = useRef(false);
  useEffect(() => {
    if (ended && cancelled) endedCancelled.current = true;
    if (!early && !(endedCancelled.current && !ended)) return;
    endedCancelled.current = false;
    setCancelled(false);
    said.current = false;
  }, [early, ended, cancelled, queue?.current]);

  useEffect(() => {
    if (!shown || !next) return;
    const start = Date.now();
    setDeadline(start + COUNT * 1000);
    setNow(start);
    if (!said.current) announce(t('queue.said', { title: next.title }));
    said.current = true;
    const tick = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(tick);
  }, [shown, next?.id]);

  useEffect(() => {
    if (shown && ended && next && deadline && now >= deadline) queue?.onPick(next.id);
  }, [shown, ended, now, deadline]);

  useOwnKeys(ref, shown);

  if (!queue || !next || !shown) return null;
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));

  const cancel = () => {
    // Focus goes to the bar's play button before the card goes, so it is never lost.
    ref.current?.closest('.media-container')?.querySelector<HTMLElement>('.video-controls-bottom button')?.focus();
    setCancelled(true);
  };

  return (
    <div ref={ref} role="group" aria-label={t('queue.upNext')} className={'lightline-up-next'}>
      <img className={'lightline-up-next-still'} src={next.still} alt="" />
      <div className={'lightline-up-next-text'}>
        <span className={'lightline-up-next-label'}>{t('queue.upNext')}</span>
        <span className={'lightline-up-next-title'}>{next.title}</span>
        <span className={'lightline-up-next-length'}>{format.length(next.duration)}</span>
      </div>
      <div className={'lightline-up-next-count'} aria-hidden="true">
        <svg key={deadline} className={'lightline-up-next-ring'} viewBox="0 0 36 36">
          <circle className={'lightline-up-next-ring-track'} cx="18" cy="18" r="16" />
          <circle className={'lightline-up-next-ring-run'} cx="18" cy="18" r="16" pathLength={100} />
        </svg>
        <span className={'lightline-up-next-number'}>{format.number(left)}</span>
      </div>
      <div className={'lightline-up-next-actions'}>
        <button type="button" className={'lightline-up-next-play'} onClick={() => queue.onPick(next.id)}>
          {t('queue.playNow')}
        </button>
        <button type="button" className={'lightline-up-next-cancel'} onClick={cancel}>
          {t('queue.cancel')}
        </button>
      </div>
    </div>
  );
}
