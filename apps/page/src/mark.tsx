import { useId } from 'react';

/**
 * Lightline's mark: one line of light that rises into a play triangle and runs on. Since 2026-11-10 it wears the
 * film's look (his word, "make the logo match the video"): one neon blue, a pale hot core over a deeper glow, the
 * colors and proportions of the opening film's own drawing (Media OS lightline-demo-2026-11, the kept opening). The
 * points are the ones the Illustrator logo was drawn from (lightline-brand-2026-11). Decorative beside the wordmark,
 * so hidden from assistive technology.
 */
export function LightlineMark({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  // The film blurs its glow layer three times (30, 11 and 3 px on a mark 930 px wide) and adds them; here the same
  // three, in the mark's own units (323.5 wide).
  const glow = [
    [10.4, 0.62],
    [3.8, 0.8],
    [1.05, 0.7],
  ] as const;
  return (
    <svg className={className} viewBox="330 220 364 128" aria-hidden="true" focusable="false">
      <defs>
        {glow.map(([blur], i) => (
          <filter key={i} id={`${id}-g${i}`} x="-30%" y="-120%" width="160%" height="340%">
            <feGaussianBlur stdDeviation={blur} />
          </filter>
        ))}
      </defs>
      {glow.map(([, opacity], i) => (
        <path key={i} d={D} fill="none" stroke={GLOW} strokeWidth="4.8" strokeLinecap="round" strokeLinejoin="round" opacity={opacity} filter={`url(#${id}-g${i})`} />
      ))}
      <path d={D} fill="none" stroke={CORE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The film's neon: the line's pale core and the blue it glows. */
const CORE = '#D6ECFF';
const GLOW = '#2478FF';

const D =
  'M350 285.75C350 285.75 473.25 285.75 473.25 285.75C476.56 285.75 479.25 283.06 479.25 279.75C479.25 279.75 479.25 249.22 479.25 249.22C479.25 243.58 485.25 239.95 490.24 242.58C490.24 242.58 544.31 271.02 544.31 271.02C548.37 273.16 548.63 278.88 544.77 281.37C544.77 281.37 481.7 322.1 481.7 322.1C475.99 325.79 480.66 334.36 486.6 331.05C486.6 331.05 561.44 289.3 561.44 289.3C565.61 286.97 570.31 285.75 575.08 285.75C575.08 285.75 673.5 285.75 673.5 285.75';
