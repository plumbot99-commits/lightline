/** @jsxImportSource react */
import { audioText, captionsText, qualityText, settingsText, speedText } from '@videojs/core/i18n/text/menu';
import { Text as TextPrimitive, useHotkey } from '@videojs/react';
import { Menu } from '@videojs/react';
import { usePlayer } from '@videojs/react/video';
import {
  ChevronIcon as ChevronIconPrimitive,
  SwitchesIcon as SwitchesIconPrimitive,
  SpeechIcon as SpeechIconPrimitive,
  SpeedIcon as SpeedIconPrimitive,
  CaptionsOffIcon as CaptionsOffIconPrimitive,
  CaptionsOnIcon as CaptionsOnIconPrimitive,
  CheckIcon as CheckIconPrimitive,
  GearIcon as GearIconPrimitive,
  AmbientIcon,
  ChaptersIcon,
  KeyboardIcon,
  TheaterIcon,
} from '@/video/icons';
import { AudioTrackRadioGroup } from '@videojs/react/ui/audio-track-radio-group';
import { CaptionsRadioGroup } from '@videojs/react/ui/captions-radio-group';
import { PlaybackRateRadioGroup } from '@videojs/react/ui/playback-rate-radio-group';
import { QualityRadioGroup } from '@videojs/react/ui/quality-radio-group';

import { useState } from 'react';

import { cn } from '@/lib/resolve-class-name';

import { type TextKey } from '@/i18n/en';
import { useFormat, useSay, useText } from '@/i18n/i18n';
import { PANEL_IDS } from '../suite/layout';
import { PANEL_LABEL, useSuite } from '../suite/suite';
import { AudioLabMenuItem } from './audio-lab';
import { Button } from './button';
import { RadioItem } from './menu-item';
import { ButtonTooltip } from './tooltip';
import {
  AMBIENT_LEVELS,
  type AmbientLevel,
  CAPTION_BACKGROUNDS,
  CAPTION_SIZES,
  type CaptionBackground,
  type CaptionSize,
  useViewing,
} from './viewing';

function MenuChevron({ back = false }: { back?: boolean } = {}) {
  return <ChevronIconPrimitive className={back ? 'media-menu-back-chevron' : 'media-menu-forward-chevron'} />;
}

function QualityMenu() {
  return (
    <Menu.Root>
      <QualityRadioGroup.Root>
        <Menu.Trigger className={'media-menu-item'}>
          <SwitchesIconPrimitive className={'media-menu-trigger-icon'} />
          <TextPrimitive token={qualityText.key}>{qualityText.text}</TextPrimitive>
          <span className={'media-menu-hint'}>
            <QualityRadioGroup.Value className={'media-menu-hint-label'} />
            <MenuChevron />
          </span>
        </Menu.Trigger>
        <Menu.Content className={'media-menu-content'}>
          <Menu.Item className={'media-menu-back-item'}>
            <MenuChevron back />
            <TextPrimitive token={qualityText.key}>{qualityText.text}</TextPrimitive>
          </Menu.Item>
          <Menu.Separator className={'media-menu-separator'} />
          <QualityRadioGroup.Options
            className={'media-menu-radio-group'}
            renderItem={(props, item) => (
              <RadioItem {...props}>
                <span>
                  <span>{item.label}</span>
                  {item.tier ? <sup className={'media-menu-tier'}>{item.tier}</sup> : null}
                </span>
                {item.badge ? <span className={'media-menu-badge'}>{item.badge}</span> : null}
              </RadioItem>
            )}
          ></QualityRadioGroup.Options>
        </Menu.Content>
      </QualityRadioGroup.Root>
    </Menu.Root>
  );
}

function AudioTrackMenu() {
  return (
    <Menu.Root>
      <AudioTrackRadioGroup.Root>
        <Menu.Trigger className={'media-menu-item'}>
          <SpeechIconPrimitive className={'media-menu-trigger-icon'} />
          <TextPrimitive token={audioText.key}>{audioText.text}</TextPrimitive>
          <span className={'media-menu-hint'}>
            <AudioTrackRadioGroup.Value className={'media-menu-hint-label'} />
            <MenuChevron />
          </span>
        </Menu.Trigger>
        <Menu.Content className={'media-menu-content'}>
          <Menu.Item className={'media-menu-back-item'}>
            <MenuChevron back />
            <TextPrimitive token={audioText.key}>{audioText.text}</TextPrimitive>
          </Menu.Item>
          <Menu.Separator className={'media-menu-separator'} />
          <AudioTrackRadioGroup.Options
            className={'media-menu-radio-group'}
            renderItem={(props, item) => (
              <RadioItem {...props}>
                <span>{item.label}</span>
              </RadioItem>
            )}
          ></AudioTrackRadioGroup.Options>
        </Menu.Content>
      </AudioTrackRadioGroup.Root>
    </Menu.Root>
  );
}

function PlaybackRateMenu() {
  return (
    <Menu.Root>
      <PlaybackRateRadioGroup.Root>
        <Menu.Trigger className={'media-menu-item'}>
          <SpeedIconPrimitive className={'media-menu-trigger-icon'} />
          <TextPrimitive token={speedText.key}>{speedText.text}</TextPrimitive>
          <span className={'media-menu-hint'}>
            <PlaybackRateRadioGroup.Value className={'media-menu-hint-label'} />
            <MenuChevron />
          </span>
        </Menu.Trigger>
        <Menu.Content className={'media-menu-content'}>
          <Menu.Item className={'media-menu-back-item'}>
            <MenuChevron back />
            <TextPrimitive token={speedText.key}>{speedText.text}</TextPrimitive>
          </Menu.Item>
          <Menu.Separator className={'media-menu-separator'} />
          <PlaybackRateRadioGroup.Options
            className={'media-menu-radio-group'}
            renderItem={(props, item) => (
              <RadioItem {...props}>
                <span>{item.label}</span>
              </RadioItem>
            )}
          ></PlaybackRateRadioGroup.Options>
        </Menu.Content>
      </PlaybackRateRadioGroup.Root>
    </Menu.Root>
  );
}

function CaptionsMenu() {
  return (
    <Menu.Root>
      <CaptionsRadioGroup.Root>
        <Menu.Trigger className={'media-menu-item'}>
          <CaptionsOffIconPrimitive className={'media-menu-trigger-icon'} />
          <TextPrimitive token={captionsText.key}>{captionsText.text}</TextPrimitive>
          <span className={'media-menu-hint'}>
            <CaptionsRadioGroup.Value className={'media-menu-hint-label'} />
            <MenuChevron />
          </span>
        </Menu.Trigger>
        <Menu.Content className={'media-menu-content'}>
          <Menu.Item className={'media-menu-back-item'}>
            <MenuChevron back />
            <TextPrimitive token={captionsText.key}>{captionsText.text}</TextPrimitive>
          </Menu.Item>
          <Menu.Separator className={'media-menu-separator'} />
          <CaptionsRadioGroup.Options
            className={'media-menu-radio-group'}
            renderItem={(props, item) => (
              <RadioItem {...props}>
                <span>{item.label}</span>
              </RadioItem>
            )}
          ></CaptionsRadioGroup.Options>
        </Menu.Content>
      </CaptionsRadioGroup.Root>
    </Menu.Root>
  );
}

/** The six scenes by name, each with its time; the scene playing now is checked, and picking one seeks to it. */
function ChaptersMenu() {
  const t = useText();
  const format = useFormat();
  const cues = usePlayer((s) => s.chaptersCues);
  const current = usePlayer((s) => {
    let index = -1;
    s.chaptersCues.forEach((cue, i) => {
      if (cue.startTime <= s.currentTime) index = i;
    });
    return index;
  });
  const seek = usePlayer((s) => s.seek);
  if (!cues.length) return null;

  return (
    <Menu.Root>
      <Menu.Trigger className={'media-menu-item'}>
        <ChaptersIcon className={'media-menu-trigger-icon'} />
        <span>{t('settings.chapters')}</span>
        <span className={'media-menu-hint'}>
          <span className={'media-menu-hint-label'}>{cues[current]?.text}</span>
          <MenuChevron />
        </span>
      </Menu.Trigger>
      <Menu.Content className={'media-menu-content'}>
        <Menu.Item className={'media-menu-back-item'}>
          <MenuChevron back />
          <span>{t('settings.chapters')}</span>
        </Menu.Item>
        <Menu.Separator className={'media-menu-separator'} />
        <Menu.RadioGroup
          className={'media-menu-radio-group'}
          value={String(current)}
          onValueChange={(value) => {
            const cue = cues[Number(value)];
            if (cue) void seek(cue.startTime);
          }}
        >
          {cues.map((cue, index) => (
            <RadioItem
              key={`${cue.startTime}-${cue.text}`}
              value={String(index)}
              aria-label={t('settings.chapterAt', {
                chapter: cue.text,
                time: format.clock(cue.startTime),
              })}
            >
              <span className={'lightline-menu-row'}>
                <span className={'lightline-menu-row-label'}>{cue.text}</span>
                <span className={'lightline-menu-time'}>{format.clock(cue.startTime)}</span>
              </span>
            </RadioItem>
          ))}
        </Menu.RadioGroup>
      </Menu.Content>
    </Menu.Root>
  );
}

/** The captions' size and background, for the browser-drawn cues. */
function CaptionsStyleMenu() {
  const t = useText();
  const format = useFormat();
  const { captionSize, setCaptionSize, captionBackground, setCaptionBackground } = useViewing();
  const share = CAPTION_SIZES.find((size) => size.value === captionSize)?.share;
  const sizeLabel = share === undefined ? undefined : format.percent(share);

  return (
    <Menu.Root>
      <Menu.Trigger className={'media-menu-item'}>
        <CaptionsOnIconPrimitive className={'media-menu-trigger-icon'} />
        <span>{t('settings.captionsStyle')}</span>
        <span className={'media-menu-hint'}>
          <span className={'media-menu-hint-label'}>{sizeLabel}</span>
          <MenuChevron />
        </span>
      </Menu.Trigger>
      <Menu.Content className={'media-menu-content'}>
        <Menu.Item className={'media-menu-back-item'}>
          <MenuChevron back />
          <span>{t('settings.captionsStyle')}</span>
        </Menu.Item>
        <Menu.Separator className={'media-menu-separator'} />
        <Menu.RadioGroup
          className={'media-menu-radio-group'}
          value={captionSize}
          onValueChange={(value) => setCaptionSize(value as CaptionSize)}
        >
          <Menu.GroupLabel className={'lightline-menu-group-label'}>{t('settings.size')}</Menu.GroupLabel>
          {CAPTION_SIZES.map((size) => (
            <RadioItem key={size.value} value={size.value}>
              <span>{format.percent(size.share)}</span>
            </RadioItem>
          ))}
        </Menu.RadioGroup>
        <Menu.Separator className={'media-menu-separator'} />
        <Menu.RadioGroup
          className={'media-menu-radio-group'}
          value={captionBackground}
          onValueChange={(value) => setCaptionBackground(value as CaptionBackground)}
        >
          <Menu.GroupLabel className={'lightline-menu-group-label'}>{t('settings.background')}</Menu.GroupLabel>
          {CAPTION_BACKGROUNDS.map((background) => (
            <RadioItem key={background.value} value={background.value}>
              <span>{t(background.label)}</span>
            </RadioItem>
          ))}
        </Menu.RadioGroup>
      </Menu.Content>
    </Menu.Root>
  );
}

/** The film's light past the frame: off, or how far it reaches. */
function AmbientMenu() {
  const t = useText();
  const { ambient, setAmbient } = useViewing();
  const label = AMBIENT_LEVELS.find((level) => level.value === ambient)?.label;

  return (
    <Menu.Root>
      <Menu.Trigger className={'media-menu-item'}>
        <AmbientIcon className={'media-menu-trigger-icon'} />
        <span>{t('settings.ambient')}</span>
        <span className={'media-menu-hint'}>
          <span className={'media-menu-hint-label'}>{label && t(label)}</span>
          <MenuChevron />
        </span>
      </Menu.Trigger>
      <Menu.Content className={'media-menu-content'}>
        <Menu.Item className={'media-menu-back-item'}>
          <MenuChevron back />
          <span>{t('settings.ambient')}</span>
        </Menu.Item>
        <Menu.Separator className={'media-menu-separator'} />
        <Menu.RadioGroup
          className={'media-menu-radio-group'}
          value={ambient}
          onValueChange={(value) => setAmbient(value as AmbientLevel)}
        >
          {AMBIENT_LEVELS.map((level) => (
            <RadioItem key={level.value} value={level.value}>
              <span>{t(level.label)}</span>
            </RadioItem>
          ))}
        </Menu.RadioGroup>
      </Menu.Content>
    </Menu.Root>
  );
}

/** Theater mode: the house lights go down around the player, and the host hears of it to widen the page. */
/** In the Suite: each panel shown or closed, and the layout back to its start. */
function SuiteItems() {
  const say = useSay();
  const suite = useSuite();
  if (!suite.active) return null;
  return (
    <Menu.Group className={'lightline-menu-group'} aria-label={say('panels')}>
      <Menu.Separator className={'media-menu-separator'} />
      {PANEL_IDS.map((id) => {
        const open = suite.layout.panels[id].open;
        return (
          <Menu.CheckboxItem
            key={id}
            className={cn('media-menu-item', 'lightline-menu-check')}
            checked={open}
            onCheckedChange={(next) => suite.show(id, next)}
          >
            <span>{say(PANEL_LABEL[id])}</span>
            <Menu.ItemIndicator checked={open} forceMount className={'media-menu-indicator'}>
              <CheckIconPrimitive className={'media-menu-radio-icon'} />
            </Menu.ItemIndicator>
          </Menu.CheckboxItem>
        );
      })}
      <Menu.Item className={'media-menu-item'} onSelect={() => suite.reset()}>
        <span>{say('resetLayout')}</span>
      </Menu.Item>
    </Menu.Group>
  );
}

function TheaterItem() {
  const t = useText();
  const { theater, setTheater } = useViewing();
  return (
    <Menu.CheckboxItem
      className={cn('media-menu-item', 'lightline-menu-check')}
      checked={theater}
      onCheckedChange={setTheater}
    >
      <TheaterIcon className={'media-menu-trigger-icon'} />
      <span>{t('settings.theater')}</span>
      <Menu.ItemIndicator checked={theater} forceMount className={'media-menu-indicator'}>
        <CheckIconPrimitive className={'media-menu-radio-icon'} />
      </Menu.ItemIndicator>
    </Menu.CheckboxItem>
  );
}

/**
 * What the skin's hotkeys do (behaviors/hotkeys.tsx); each row's name says the keys in words. A key cap that is a
 * word (Space, Home, End) and every spoken form are the skin's text; a letter, digit or symbol is the key itself.
 */
type Cap = string | { word: TextKey };
const SHORTCUTS: { action: TextKey; keys: Cap[]; spoken: TextKey | string }[] = [
  {
    action: 'keys.playPause',
    keys: [{ word: 'keys.space' }, 'K'],
    spoken: 'keys.saySpaceK',
  },
  { action: 'keys.seek', keys: ['←', '→', 'J', 'L'], spoken: 'keys.saySeek' },
  { action: 'keys.volume', keys: ['↑', '↓'], spoken: 'keys.sayVolume' },
  { action: 'keys.mute', keys: ['M'], spoken: 'M' },
  { action: 'keys.jump', keys: ['0', '9'], spoken: 'keys.sayJump' },
  {
    action: 'keys.startEnd',
    keys: [{ word: 'keys.home' }, { word: 'keys.end' }],
    spoken: 'keys.sayHomeEnd',
  },
  { action: 'keys.speed', keys: ['<', '>'], spoken: 'keys.saySpeed' },
  { action: 'keys.captions', keys: ['C'], spoken: 'C' },
  { action: 'keys.fullscreen', keys: ['F'], spoken: 'F' },
  { action: 'keys.pip', keys: ['I'], spoken: 'I' },
  { action: 'keys.thisPanel', keys: ['?'], spoken: 'keys.sayQuestion' },
];

/**
 * The keyboard-shortcut panel: one row per shortcut, read like any menu, left or Escape to go back. The `?`
 * key opens it straight from the player, so its open state is held by the settings menu.
 */
function ShortcutsMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useText();
  const format = useFormat();
  // The seek row names its step as the locale writes numbers; the jump row's digits are the keys themselves.
  const values = { seconds: format.plain(10), first: '0', last: '9' };
  const word = (key: string) => (key.includes('.') ? t(key as TextKey, values) : key);
  return (
    <Menu.Root open={open} onOpenChange={onOpenChange}>
      <Menu.Trigger className={'media-menu-item'}>
        <KeyboardIcon className={'media-menu-trigger-icon'} />
        <span>{t('settings.shortcuts')}</span>
        <span className={'media-menu-hint'}>
          <MenuChevron />
        </span>
      </Menu.Trigger>
      <Menu.Content className={cn('media-menu-content', 'lightline-shortcuts')}>
        <Menu.Item className={'media-menu-back-item'}>
          <MenuChevron back />
          <span>{t('settings.shortcuts')}</span>
        </Menu.Item>
        <Menu.Separator className={'media-menu-separator'} />
        {SHORTCUTS.map((shortcut) => (
          <Menu.Item
            key={shortcut.action}
            className={cn('media-menu-item', 'lightline-menu-row')}
            aria-label={t('keys.row', {
              action: word(shortcut.action),
              keys: word(shortcut.spoken),
            })}
          >
            <span className={'lightline-menu-row-label'}>{word(shortcut.action)}</span>
            <span className={'lightline-menu-keys'}>
              {shortcut.keys.map((key) => {
                const cap = typeof key === 'string' ? key : t(key.word);
                return <kbd key={cap}>{cap}</kbd>;
              })}
            </span>
          </Menu.Item>
        ))}
      </Menu.Content>
    </Menu.Root>
  );
}

export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // `?` (Shift and / on a US layout; the key's character is what counts) opens the shortcut panel.
  useHotkey({
    keys: '?',
    onActivate: () => {
      setOpen(true);
      setShortcutsOpen(true);
    },
  });

  return (
    // The viewport bounds the menu, not the player: in a phone-sized player the panel rises above the frame
    // instead of showing one row at a time.
    <Menu.Root
      side="top"
      align="center"
      boundary="viewport"
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setShortcutsOpen(false);
      }}
    >
      <ButtonTooltip label={<TextPrimitive token={settingsText.key}>{settingsText.text}</TextPrimitive>}>
        <Menu.Trigger render={<Button />}>
          <GearIconPrimitive className={'media-button-icon'} />
          <TextPrimitive className={'media-settings-button-label'} token={settingsText.key}>
            {settingsText.text}
          </TextPrimitive>
        </Menu.Trigger>
      </ButtonTooltip>
      {/* The menu moves focus row to row without scrolling; where the viewport leaves less room than the rows
          need (a 320 by 640 phone), the focused row is brought into view so a keyboard user can see it. */}
      <Menu.Popup
        keepMounted
        className={cn('media-popup', 'media-popup-safe-area', 'media-menu-popup')}
        onFocus={(event) => event.target.scrollIntoView({ block: 'nearest' })}
      >
        <Menu.Content className={'media-menu-content'}>
          <ChaptersMenu />
          <QualityMenu />
          <AudioTrackMenu />
          <PlaybackRateMenu />
          <CaptionsMenu />
          <CaptionsStyleMenu />
          <Menu.Separator className={'media-menu-separator'} />
          <AudioLabMenuItem />
          <AmbientMenu />
          <TheaterItem />
          <SuiteItems />
          <ShortcutsMenu open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
        </Menu.Content>
      </Menu.Popup>
    </Menu.Root>
  );
}
