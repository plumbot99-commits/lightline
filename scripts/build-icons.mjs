// Lightline's icons: reads the SVGs Illustrator exported (design/icons/lightline_<name>.svg, from
// design/icons/lightline-icons.ai, and the six more from design/icons/lightline-icons-six.ai, drawn 2026-11-09 under the
// production lightline-icons-2026-11) and writes src/video/icons/index.tsx, components named as Video.js names its
// icons so the skin's parts import them in place of the Scaffold set. Colors become currentColor.
//   node scripts/build-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'design', 'icons');
const OUT = path.join(ROOT, 'src', 'video', 'icons', 'index.tsx');

const NAMES = {
  'airplay-enter': 'AirPlayEnterIcon', 'airplay-exit': 'AirPlayExitIcon', 'captions-off': 'CaptionsOffIcon',
  'captions-on': 'CaptionsOnIcon', 'cast-enter': 'CastEnterIcon', 'cast-exit': 'CastExitIcon', check: 'CheckIcon',
  chevron: 'ChevronIcon', 'fullscreen-enter': 'FullscreenEnterIcon', 'fullscreen-exit': 'FullscreenExitIcon',
  gear: 'GearIcon', pause: 'PauseIcon', 'pip-enter': 'PipEnterIcon', 'pip-exit': 'PipExitIcon', play: 'PlayIcon',
  quality: 'QualityIcon', restart: 'RestartIcon', seek: 'SeekIcon', speech: 'SpeechIcon', speed: 'SpeedIcon',
  spinner: 'SpinnerIcon', switches: 'SwitchesIcon', 'volume-high': 'VolumeHighIcon', 'volume-low': 'VolumeLowIcon',
  'volume-off': 'VolumeOffIcon',
  // The six the skin added, drawn in place of its stand-ins (the owner's look of 2026-11-09: "i love the icons").
  ambient: 'AmbientIcon', 'audio-lab': 'AudioLabIcon', chapters: 'ChaptersIcon', keyboard: 'KeyboardIcon',
  queue: 'QueueIcon', theater: 'TheaterIcon',
};

export function inner(svg) {
  const g = svg.match(/<g id="[^"]*">([\s\S]*?)<\/g>\s*<\/svg>/);
  if (!g) throw new Error('no artboard group in the SVG');
  return g[1]
    .replace(/#F2F0EA/gi, 'currentColor')
    .replace(/\s*stroke-miterlimit="[^"]*"/g, '')
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .replace(/points=" /g, 'points="')
    .replace(/ "/g, '"')
    .trim();
}

const parts = [];
for (const [file, component] of Object.entries(NAMES)) {
  const svg = fs.readFileSync(path.join(SRC, `lightline_${file}.svg`), 'utf8');
  parts.push(`export const ${component} = icon('${file}', ${JSON.stringify(inner(svg))});`);
}

const source = `/** @jsxImportSource react */
// Written by scripts/build-icons.mjs from design/icons (drawn in Illustrator, design/icons/lightline-icons.ai).
// Do not edit by hand: change the drawing, export, and run the script.
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function icon(name: string, markup: string) {
  function Icon(props: IconProps) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={18}
        height={18}
        viewBox="0 0 18 18"
        fill="none"
        aria-hidden="true"
        focusable="false"
        data-lightline-icon={name}
        {...props}
        dangerouslySetInnerHTML={{ __html: markup }}
      />
    );
  }
  Icon.displayName = \`Lightline(\${name})\`;
  return Icon;
}

${parts.join('\n')}
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, source);
console.log(`wrote ${path.relative(ROOT, OUT)} with ${parts.length} icons`);
