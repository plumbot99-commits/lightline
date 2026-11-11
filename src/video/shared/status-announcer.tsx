/** @jsxImportSource react */

import { StatusAnnouncer as StatusAnnouncerPrimitive } from '@videojs/react';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';

/**
 * The player's one status region. It speaks the player's own changes, and the skin's when something of its own
 * moves (the Suite's panels): whichever came last is what the region holds.
 */
interface Spoken {
  text: string;
  generation: number;
}

const AnnounceContext = createContext<{ spoken: Spoken | null; announce: (text: string) => void } | null>(null);

export function AnnounceProvider({ children }: { children: ReactNode }) {
  const [spoken, setSpoken] = useState<Spoken | null>(null);
  const announce = useCallback(
    (text: string) => setSpoken((last) => ({ text, generation: (last?.generation ?? 0) + 1 })),
    []
  );
  const value = useMemo(() => ({ spoken, announce }), [spoken, announce]);
  return <AnnounceContext.Provider value={value}>{children}</AnnounceContext.Provider>;
}

/** Speak a change the player does not know about, through the status region it already has. */
export function useAnnounce() {
  return useContext(AnnounceContext)?.announce ?? (() => {});
}

export function StatusAnnouncer() {
  const own = useContext(AnnounceContext)?.spoken ?? null;
  // Which spoke last: the player's generation moving means it did; the skin's own message moving means the skin did.
  const last = useRef({ player: -1, own: -1, latest: 'player' as 'player' | 'own' });

  return (
    <StatusAnnouncerPrimitive
      className={'media-status-announcer'}
      render={(props, state) => {
        const seen = last.current;
        if (state.generation !== seen.player) {
          seen.player = state.generation;
          if (state.label) seen.latest = 'player';
        }
        if (own && own.generation !== seen.own) {
          seen.own = own.generation;
          seen.latest = 'own';
        }
        if (seen.latest === 'player' || !own) return <div {...props} />;
        return (
          <div {...props}>
            <span data-status-announcer-content="" key={`own-${own.generation}`}>
              {own.text}
            </span>
          </div>
        );
      }}
    />
  );
}
