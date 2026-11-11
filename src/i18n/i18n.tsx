/** @jsxImportSource react */

import { flattenTranslations } from '@videojs/core/i18n';
import { useContainer } from '@videojs/react';
import {
  createI18n,
  findLocaleKeys,
  getLocaleKey,
  I18nContext,
  loadLocale,
  useLocale,
  useTranslator,
} from '@videojs/react/i18n';
import { type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { SuiteTextKey } from '../video/suite/labels';
import { en, type LightlinePack, type TextKey } from './en';

/**
 * The skin's words in the viewer's language, through the library's own i18n: the same provider, the same lazy
 * per-locale packs, the same `{name}` templates. The skin's pack for a locale loads beside the library's in one
 * loader (registering it with `registerI18n` would stop the library loading its own pack for that locale).
 *
 * Which language: a locale the host sets outright (an `I18nProvider` with `locale`, as the workbench's option is);
 * else the page's, from the `lang` on the player or its nearest ancestor; else the first in the browser's list
 * (`navigator.languages`) that has a pack; else English. The library's provider reads the page's `lang` but not the
 * browser's list, and its `browser-translation` is the on-device Translator API, not detection: the skin adds the
 * list here. The library's container then writes the locale and its direction (right to left for Arabic, Hebrew
 * and Persian, by the library's own `getTextDirection`) on the player itself.
 */

type Pack = { default: LightlinePack };

/** One file per locale, the library's set (its `LOCALES`), loaded only when that locale is in use. */
const PACKS: Record<string, () => Promise<Pack>> = {
  ar: () => import('./locales/ar'),
  az: () => import('./locales/az'),
  bg: () => import('./locales/bg'),
  bn: () => import('./locales/bn'),
  bs: () => import('./locales/bs'),
  ca: () => import('./locales/ca'),
  cs: () => import('./locales/cs'),
  cy: () => import('./locales/cy'),
  da: () => import('./locales/da'),
  de: () => import('./locales/de'),
  el: () => import('./locales/el'),
  es: () => import('./locales/es'),
  et: () => import('./locales/et'),
  eu: () => import('./locales/eu'),
  fa: () => import('./locales/fa'),
  fi: () => import('./locales/fi'),
  fr: () => import('./locales/fr'),
  gd: () => import('./locales/gd'),
  gl: () => import('./locales/gl'),
  he: () => import('./locales/he'),
  hi: () => import('./locales/hi'),
  hr: () => import('./locales/hr'),
  hu: () => import('./locales/hu'),
  id: () => import('./locales/id'),
  it: () => import('./locales/it'),
  ja: () => import('./locales/ja'),
  ko: () => import('./locales/ko'),
  lt: () => import('./locales/lt'),
  lv: () => import('./locales/lv'),
  mr: () => import('./locales/mr'),
  nb: () => import('./locales/nb'),
  ne: () => import('./locales/ne'),
  nl: () => import('./locales/nl'),
  nn: () => import('./locales/nn'),
  oc: () => import('./locales/oc'),
  pl: () => import('./locales/pl'),
  'pt-br': () => import('./locales/pt-BR'),
  'pt-pt': () => import('./locales/pt-PT'),
  ro: () => import('./locales/ro'),
  ru: () => import('./locales/ru'),
  sk: () => import('./locales/sk'),
  sl: () => import('./locales/sl'),
  sr: () => import('./locales/sr'),
  sv: () => import('./locales/sv'),
  te: () => import('./locales/te'),
  th: () => import('./locales/th'),
  tr: () => import('./locales/tr'),
  uk: () => import('./locales/uk'),
  vi: () => import('./locales/vi'),
  'zh-cn': () => import('./locales/zh-CN'),
  'zh-tw': () => import('./locales/zh-TW'),
  // The library's own aliases: plain `pt` reads as Brazilian, plain `zh` as Simplified.
  pt: () => import('./locales/pt-BR'),
  zh: () => import('./locales/zh-CN'),
};

async function loadOwn(tag: string) {
  for (const key of findLocaleKeys(tag)) {
    const load = PACKS[key];
    if (load) return flattenTranslations({ lightline: (await load()).default });
  }
}

/** The library's pack and the skin's for the same tag, as one layer. */
async function loader(tag: string) {
  const [library, own] = await Promise.all([loadLocale(tag), loadOwn(tag)]);
  return library || own ? { ...library, ...own } : undefined;
}

const { I18nProvider } = createI18n({ loader });

/** A tag the skin has words for, kept as given (`de-AT` keeps its region for numbers); else undefined. */
function supported(tag: string | null | undefined) {
  const given = tag?.trim();
  if (!given) return;
  const language = getLocaleKey(given).split('-')[0];
  const has = findLocaleKeys(given).some((key) => (key === 'en' ? language === 'en' : key in PACKS));
  return has ? given : undefined;
}

/** The nearest non-empty `lang`, as the library reads it: an empty one is passed over. */
function nearestLang(start: Element) {
  for (let el: Element | null = start; el; el = el.parentElement) {
    const lang = el.getAttribute('lang')?.trim();
    if (lang) return lang;
  }
}

function detect(anchor: Element | null) {
  if (typeof document === 'undefined') return 'en';
  // From the container's parent: the library's container writes the player's own locale back onto itself as `lang`.
  const page = supported(nearestLang(anchor?.parentElement ?? document.documentElement));
  if (page) return page;
  const list = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of list) {
    const browser = supported(tag);
    if (browser) return browser;
  }
  return 'en';
}

export function LightlineI18n({ locale: own, children }: { locale?: string; children: ReactNode }) {
  const parent = useContext(I18nContext);
  const container = useContainer() as Element | null;
  const host = own ?? (parent?.localeFromProp ? parent.locale : undefined);
  const [epoch, bump] = useState(0);

  // A `lang` changed anywhere on the page, or the browser's languages changed: look again.
  useEffect(() => {
    if (host) return;
    const again = () => bump((n) => n + 1);
    const observer = new MutationObserver(again);
    observer.observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ['lang'],
    });
    window.addEventListener('languagechange', again);
    return () => {
      observer.disconnect();
      window.removeEventListener('languagechange', again);
    };
  }, [host]);

  const locale = useMemo(
    () => host ?? detect(container),
    // `epoch` is the page's or the browser's language changing.
    [host, container, epoch]
  );

  return (
    <I18nProvider locale={locale} translations={parent?.translations}>
      {children}
    </I18nProvider>
  );
}

const DEFAULTS = flattenTranslations({ lightline: en }) as Record<string, string>;

type Values = Record<string, string | number>;

/** The skin's words: `t('lab.preset')`, `t('suite.sayDocked', { panel, rail, position, count })`. */
export function useText() {
  const translate = useTranslator() as unknown as (input: { key: string; text: string }, values?: Values) => string;
  return useCallback(
    (key: TextKey, values?: Values) => {
      const full = `lightline.${key}`;
      return translate({ key: full, text: DEFAULTS[full] ?? key }, values);
    },
    [translate]
  );
}

export type Translate = ReturnType<typeof useText>;

/** The Suite's words (`src/video/suite/labels.ts`): `say('sayDocked', { panel, rail, position, count })`. */
export function useSay() {
  const t = useText();
  return useCallback((key: SuiteTextKey, values?: Values) => t(`suite.${key}`, values), [t]);
}

export type Say = ReturnType<typeof useSay>;

/** Numbers, units and times for the player's locale, through `Intl`. */
export function useFormat() {
  const locale = useLocale();
  return useMemo(() => makeFormat(locale), [locale]);
}

const formatters = new Map<string, Intl.NumberFormat>();

function numberFormat(locale: string, options: Intl.NumberFormatOptions = {}) {
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = formatters.get(key);
  if (!format) {
    try {
      format = new Intl.NumberFormat(locale, options);
    } catch {
      format = new Intl.NumberFormat('en', options);
    }
    formatters.set(key, format);
  }
  return format;
}

export function makeFormat(locale: string) {
  const plain = numberFormat(locale, { useGrouping: false });
  const two = numberFormat(locale, {
    minimumIntegerDigits: 2,
    useGrouping: false,
  });
  /** m:ss or h:mm:ss, the way the library's own time display writes it: the locale's digits, a colon between. */
  const clock = (seconds: number) => {
    const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const rest = two.format(s % 60);
    return h ? `${plain.format(h)}:${two.format(m)}:${rest}` : `${plain.format(m)}:${rest}`;
  };
  return {
    locale,
    number: (value: number, options?: Intl.NumberFormatOptions) => numberFormat(locale, options).format(value),
    /** A whole number with no grouping: a year, a pixel count, a frame. */
    plain: (value: number) => plain.format(value),
    /** 0 to 1 as a percent. */
    percent: (share: number) =>
      numberFormat(locale, {
        style: 'percent',
        maximumFractionDigits: 0,
      }).format(share),
    /** Always with its sign, for gains: +3, 0, −3 (the minus is the locale's). */
    signed: (value: number) => numberFormat(locale, { signDisplay: 'exceptZero' }).format(value),
    unit: (value: number, unit: string, digits = 1, display: 'short' | 'narrow' = 'short') =>
      numberFormat(locale, {
        style: 'unit',
        unit,
        unitDisplay: display,
        maximumFractionDigits: digits,
      }).format(value),
    clock,
    /**
     * A film's length: its seconds to the nearest whole one, then as the clock writes them. A stream's renditions can
     * end a few hundredths apart (The Only One That Fits: 238.001 s in one, 237.973 in another), and whole seconds
     * passed would show that as two lengths; rounded, the length holds.
     */
    length: (seconds: number) => clock(Math.round(Number.isFinite(seconds) ? seconds : 0)),
  };
}

export type Format = ReturnType<typeof makeFormat>;
