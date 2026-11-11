/** @jsxImportSource react */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useText } from '@/i18n/i18n';
import { Button } from './button';
import { ButtonTooltip } from './tooltip';
import { AMBIENT_LEVELS, type AmbientLevel, useViewing } from './viewing';

/**
 * Options: a button in the top row, between the state pill and the Cinema | Suite switch, opens an opaque sheet over
 * the whole player where the viewer picks the host's options (on the page: the film, the Suite's room and glass, the
 * player's language, a simulated network) and the skin's own (the ambient light). The host hands its options in as
 * `options` on `VideoSkin`, drawn with `OptionField`. Escape or the sheet's close button shuts it and gives focus
 * back to the button; while it is open, Tab stays inside it and the player's keys and gestures do not act.
 */
interface Options {
  open: boolean;
  setOpen: (open: boolean) => void;
  content: ReactNode;
  sheetId: string;
}

const OptionsContext = createContext<Options | null>(null);

export interface OptionsHostProps {
  /** The host's options, shown in the Options sheet above the skin's own; draw each with `OptionField`. */
  options?: ReactNode;
}

export function OptionsProvider({ options, children }: OptionsHostProps & { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const sheetId = useId();
  const value = useMemo(() => ({ open, setOpen, content: options, sheetId }), [open, options, sheetId]);
  return <OptionsContext.Provider value={value}>{children}</OptionsContext.Provider>;
}

/**
 * The Options mark, drawn in the set's hand (18 by 18, points as filled dots a little wider than the 1.4 line): three
 * dots in a row, the common sign for more options, apart from the gear's sliders (the settings menu) and the switches
 * (its quality item).
 */
function OptionsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <circle fill="currentColor" cx="4" cy="9" r="1.3" />
      <circle fill="currentColor" cx="9" cy="9" r="1.3" />
      <circle fill="currentColor" cx="14" cy="9" r="1.3" />
    </svg>
  );
}

export function OptionsButton() {
  const options = useContext(OptionsContext);
  const t = useText();
  if (!options) return null;

  return (
    <ButtonTooltip label={t('options.title')}>
      <Button
        className={'lightline-options-button'}
        aria-label={t('options.title')}
        aria-haspopup="dialog"
        aria-expanded={options.open}
        aria-controls={options.open ? options.sheetId : undefined}
        onClick={() => options.setOpen(true)}
      >
        <OptionsIcon className={'media-button-icon'} />
      </Button>
    </ButtonTooltip>
  );
}

/** One option in the sheet: its label and its native control, joined by the id the control is given. */
export function OptionField({ label, children }: { label: ReactNode; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className={'lightline-option'}>
      <label className={'lightline-option-label'} htmlFor={id}>
        {label}
      </label>
      {children(id)}
    </div>
  );
}

const FOCUSABLE = 'button:not([disabled]), select:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
// Stopped at the sheet so the player's taps and double taps never see them; a click is left to bubble, since React's
// own handlers (the close button's) listen above the player.
const POINTER = ['pointerdown', 'pointerup', 'dblclick'] as const;

export function OptionsSheet() {
  const options = useContext(OptionsContext);
  const t = useText();
  const viewing = useViewing();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const open = !!options?.open;

  const close = useCallback(() => {
    // Focus goes back to the button that opened it, before the sheet goes. Found in the player, not by a ref: the
    // tooltip around the button takes its child as a render prop.
    ref.current?.closest('.media-container')?.querySelector<HTMLElement>('.lightline-options-button')?.focus();
    options?.setOpen(false);
  }, [options]);

  // The latest close for the listeners below, which are set once per opening: a change in the sheet re-renders it
  // with a new close, and setting them again would also throw focus back to the first control.
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);

  useEffect(() => {
    if (open) ref.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !open) return;
    // The player's keys and gestures stay out of the sheet: no play on Space, no seek on an arrow in a range.
    const onKey = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      } else if (event.key === 'Tab') {
        const all = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((f) => f.offsetParent !== null);
        const first = all[0];
        const last = all[all.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    const stop = (event: Event) => event.stopPropagation();
    el.addEventListener('keydown', onKey);
    for (const type of POINTER) el.addEventListener(type, stop);
    return () => {
      el.removeEventListener('keydown', onKey);
      for (const type of POINTER) el.removeEventListener(type, stop);
    };
  }, [open]);

  if (!options || !open) return null;

  return (
    <div
      ref={ref}
      id={options.sheetId}
      className={'lightline-options'}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className={'lightline-options-inner'}>
        <div className={'lightline-options-head'}>
          <h2 id={titleId} className={'lightline-options-title'}>
            {t('options.title')}
          </h2>
          <button type="button" className={'lightline-options-close'} aria-label={t('options.close')} onClick={close}>
            <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
              <line x1="4.5" y1="4.5" x2="13.5" y2="13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <line x1="13.5" y1="4.5" x2="4.5" y2="13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className={'lightline-options-body'}>
          {options.content}
          <OptionField label={t('settings.ambient')}>
            {(id) => (
              <select
                id={id}
                className={'lightline-option-select'}
                value={viewing.ambient}
                onChange={(e) => viewing.setAmbient(e.target.value as AmbientLevel)}
              >
                {AMBIENT_LEVELS.map((level) => (
                  <option key={level.value} value={level.value}>
                    {t(level.label)}
                  </option>
                ))}
              </select>
            )}
          </OptionField>
        </div>
      </div>
    </div>
  );
}
