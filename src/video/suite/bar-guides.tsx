/** @jsxImportSource react */

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import { cn } from '@/lib/resolve-class-name';
import { useSay } from '@/i18n/i18n';

import { GUIDES, menuKeys, placeMenu, useSuite } from './suite';

/**
 * The guides in the Suite's bar, in its empty middle between the time and the icons on the right (his pick of
 * 2026-11-09, design/guides-bar-timeline.md): the five toggles the timeline's panel used to hold, the same checkboxes
 * under the same words. Where the middle is narrower than the five at their size, they fold into one Guides button
 * whose menu holds the same five, so the bar never overflows or wraps taller. Nothing outside the Suite.
 */
export function BarGuides() {
  const say = useSay();
  const suite = useSuite();
  const slot = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [folded, setFolded] = useState(false);

  // The five at their own width against the middle's: the list keeps its width folded or not (laid out apart while
  // folded), so the choice never feeds back into what it measures.
  useLayoutEffect(() => {
    const el = slot.current;
    const pills = list.current;
    if (!el || !pills) return;
    const measure = () => setFolded(pills.offsetWidth > el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    observer.observe(pills);
    return () => observer.disconnect();
  }, [suite.active]);

  // The player's hotkeys stay out of the guides, as out of the panels: Space toggles the one in focus.
  useEffect(() => {
    const el = slot.current;
    if (!el) return;
    const stop = (event: Event) => event.stopPropagation();
    el.addEventListener('keydown', stop);
    return () => el.removeEventListener('keydown', stop);
  }, [suite.active]);

  if (!suite.active) return null;
  return (
    <div ref={slot} className={'lightline-bar-guides'} data-folded={folded ? '' : undefined}>
      <div
        ref={list}
        className={'lightline-bar-guides-list'}
        role="group"
        aria-label={say('guides')}
        aria-hidden={folded || undefined}
        inert={folded}
      >
        {GUIDES.map((guide) => (
          <label key={guide.id} className={cn('lightline-lab-chip', 'lightline-bar-guide')}>
            <input
              type="checkbox"
              checked={suite.guides[guide.id]}
              onChange={(event) => suite.setGuide(guide.id, event.currentTarget.checked)}
            />
            <span>{say(guide.label)}</span>
          </label>
        ))}
      </div>
      {folded && <GuidesMenu />}
    </div>
  );
}

/** The folded guides: one button in the bar, and a menu of the five as checkable items. */
function GuidesMenu() {
  const say = useSay();
  const suite = useSuite();
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const menuId = `lightline-guides-${useId().replace(/:/g, '')}`;
  const on = Object.values(suite.guides).some(Boolean);

  // It opens over the button with focus on its first item, and gives the focus back when it closes. The bar's
  // keydown stops at the guides, so the menu's keys are native listeners, as the grips' are.
  useEffect(() => {
    const el = menu.current!;
    const toggle = (event: Event) => {
      const now = (event as ToggleEvent).newState === 'open';
      setOpen(now);
      if (now) {
        placeMenu(el, button.current!, 'above');
        el.querySelector<HTMLElement>('[role^="menuitem"]')?.focus();
      } else if (el.contains(document.activeElement) || document.activeElement === document.body) {
        button.current?.focus();
      }
    };
    const keys = (event: globalThis.KeyboardEvent) => menuKeys(el, event);
    el.addEventListener('toggle', toggle);
    el.addEventListener('keydown', keys);
    return () => {
      el.removeEventListener('toggle', toggle);
      el.removeEventListener('keydown', keys);
    };
  }, []);

  return (
    <>
      <button
        ref={button}
        type="button"
        className={'lightline-bar-guides-button'}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        popoverTarget={menuId}
        data-on={on ? '' : undefined}
      >
        {say('guides')}
      </button>
      <div
        ref={menu}
        id={menuId}
        popover="auto"
        role="menu"
        aria-label={say('guides')}
        className={cn('media-popup', 'lightline-grip-menu', 'lightline-guides-menu')}
      >
        {GUIDES.map((guide) => (
          <button
            key={guide.id}
            type="button"
            role="menuitemcheckbox"
            aria-checked={suite.guides[guide.id]}
            tabIndex={-1}
            className={'lightline-grip-item'}
            // The menu stays open: the viewer may want several.
            onClick={() => suite.setGuide(guide.id, !suite.guides[guide.id])}
          >
            {say(guide.label)}
          </button>
        ))}
      </div>
    </>
  );
}
