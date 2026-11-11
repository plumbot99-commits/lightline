/**
 * The Suite's Glass setting: how see-through the docked panels are, as the share of the room they let through (the
 * rest is the pane's tint). A host offers it over this range and writes it with `glassStyle` on the player or an
 * element around it, as `--lightline-glass-opacity`. The skin's CSS holds that property to the same bounds
 * (`--lightline-glass-tint` in src/styles/themes/lightline.css), where every word on the glass keeps 4.5 to 1 over the
 * lightest room behind it (checks/suite-glass.mjs; the numbers are in design/lightline-record.md). Reduced
 * transparency and more contrast make the panes solid whatever it says.
 */
export const GLASS = { min: 10, max: 70, step: 2, initial: 58 } as const;

/** The setting, in percent see-through, as the custom property the skin reads. */
export const glassStyle = (seeThrough: number) => ({ '--lightline-glass-opacity': (1 - seeThrough / 100).toFixed(2) });
