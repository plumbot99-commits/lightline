# Lightline

A Video.js v10 skin for React by FredericK DesigN StudiO, styled with CSS. Controls drawn as thin lines of light on a dark ground, and the film's own color spilling past the frame. Two layouts: Cinema for watching, Suite for working on a film. It started from the Scaffold skin.

Lightline is free. Anyone may use it, change it and ship it under the Apache License 2.0, with credit. It plays at [frederickdesign.studio/lightline](https://frederickdesign.studio/lightline), and it was entered in the Video.js Skins Design Challenge in November 2026.

## What is built

- **Cinema.** The film fills the frame, with the controls over the picture. The skin stays dark whatever the system or the page says.
- **The light.** Each color carries one meaning: cyan for the next move, blue for loading, orange for paused, green for ended, and magenta for an error. Ambient light carries the film's own color past the frame in Cinema; Settings sets it to Off, Low, Medium or High. In the Suite the film's light stays in the frame. Theater mode lowers the house lights around the player.
- **Suite.** The Audio Lab, the timecode deck, stream telemetry, and the timeline (a ruler, the chapters, the film strip and the waveform, with the playhead and its timecode) dock around the picture instead of over it; the framing guides sit in the bar's middle, or in its Guides menu where the bar is too narrow for them. The switch above the picture opens it when the player is at least 1,100 pixels wide. Each panel can be moved by its grip, by mouse or keyboard, and the Suite keeps its layout.
- **The Suite's room.** The Suite's panels are frosted glass over a gray room. The host hands in a picture of a room with the `room` prop (a URL) or the `--lightline-room-image` custom property; without one the skin draws soft light pools of its own. A host may hand in a looping video of a room with the `roomLoop` prop (a URL, with `room` as its still): the room shows it in its own color, muted and dimmed behind the glass, loads it only when the Suite shows that room, and plays it only while the room is on screen; the skin measures its frames across the whole loop before it shows it (so it must be same-origin or CORS), and reduced motion shows the still and never plays it. The skin exposes a picture from the `room` prop itself, so behind the glass its lightest part lands at the same gray whatever the picture, and lifts it in the margins around the panels so a dark picture still reads as a place there (`--lightline-room-lift`, which the glass takes back off what it shows; a host may set it on the player); `--lightline-room-dim` overrides the plate's brightness; `--lightline-room-light` (0 to 1) lights the room with the film's four corners, that much; unset, the room stays in its own light. `--lightline-glass-opacity` (0.3 to 0.9, 0.42 by default) sets how much of the panes' tint covers the room; `src/video/suite/glass.ts` gives the same range as percent see-through for a slider. Ambient light Off leaves a lit room unlit; reduced motion makes it a still; reduced transparency, more contrast and forced colors make the panes solid and remove it.
- **The Audio Lab.** Presets (Flat, Cinema, Dialogue, Music, Late night), a five-band equalizer, stereo, mono or wide output, balance, a test for each speaker, and a level meter. In Cinema it opens from Settings.
- **The languages.** Every label in English and 51 more locales, those machine-translated. The player follows the page's `lang`, or the browser's languages on a page without one, and reads right to left where the language does.
- **The icons.** Thirty-one icons drawn for the skin on an 18 by 18 grid with a 1.4 outline, in `design/icons/lightline-icons.ai`; `node scripts/build-icons.mjs` turns its exported SVGs into `src/video/icons/index.tsx`.
- **Access.** Every control can be reached from the keyboard and read in forced colors. Keyboard shortcuts are listed in Settings; the error dialog and a status announcer stay in.
- **The presentation page.** The four films in one player, the library, Cinema and Suite, the states and the icons, with a drawer of Chapters and Up Next and an Up Next card when a film ends. The player's Options button (top row, beside the state pill) opens a sheet over the player with the film, the player's language, a simulated network (normal, stalled, network error), the ambient light, and in the Suite the room's look (when the page has looks) and the Glass slider. A host gives the skin its own options with the `options` prop.

## Develop

```sh
npm run dev
```

The workbench opens the skin in a slimmed-down version of the Video.js sandbox. It plays three films from Mux: The Rogue Render, the music video The Only One That Fits (its captions are the lyrics), and the silent Likeness models; change the media in `apps/preview/src/frame/films.ts` and `player.tsx`. The options panel sets the player's width and aspect ratio, the color scheme, text direction, and language, and playback options such as autoplay, muted, loop, and preload. The arrow button opens the preview on its own. The settings live in the URL, so a link such as `/?width=384&ratio=9:16&dir=rtl&locale=ar` opens the workbench in that state, and `/preview.html#width=384&ratio=9:16` opens the preview alone.

`npm run typecheck` checks the types. The scripts in `checks/` drive the workbench or the page in Edge with Playwright (and `peaks.mjs` measures a film's sound for the timeline); each names its use in its first lines, and the browser ones take the dev server's port from `PORT`.

## The presentation page

```sh
npm run dev:page
```

`apps/page` is Lightline's presentation page, its own entry built on the skin as a consumer would use it. It shares the workbench's public folder for the films' tracks. `npm run build` builds the page into the root of `dist/` and then the workbench into `dist/workbench/`, so the page is what the published address opens. The page's own files (the link preview's still) are in `apps/page/public`; its `looks/` folder holds the licensed pictures and loops for the Suite's room, listed in its `looks.json` (`file`, `name`, and `loop` for a looping video with `file` as its still), and is never committed. Its words are drafts in `apps/page/src/copy.ts`.

## Deploy

```sh
npm run deploy
```

It asks where to deploy the build (the page, with the workbench under `workbench/`): Vercel, Netlify, or Cloudflare Pages. Name one to skip the question, such as `npm run deploy vercel`. The first time, the host's CLI signs you in and creates the project, then every run prints the URL. Vercel and Netlify deploy to a preview URL you can share; to deploy to production instead, add `--prod` to the `deploy:netlify` script, or to both commands in `deploy:vercel`.

To deploy on every push instead, put the project on GitHub and import it on Vercel or Netlify; `vercel.json` and `netlify.toml` already describe the build. The build uses relative URLs, so `dist/` also works on any static host, including in a subfolder.

## Where things live

- `src/`: the skin, and only the skin.
  - `src/video/`: the skin component and its parts; `lightline.css` is its look, `suite.css` the Suite's, `queue.css` the drawer's and the Up Next card's.
  - `src/video/suite/`, `src/video/audio/`: the Suite's room and panels, and the Audio Lab's sound.
  - `src/i18n/`: the labels, English in `en.ts` and the other 51 in `locales/`.
  - `src/styles/`: the theme tokens (`themes/lightline.css`) and Scaffold's structure.
  - `src/skin.css`: global styles for the skin.
- `apps/preview/`: the workbench that previews the skin.
  - `src/shell/`: the Shadcn shell.
  - `src/frame/`: the page the shell frames. `player` mounts the skin in a player and `films.ts` sets the media it plays.
  - `public/`: files the preview serves, such as the films' chapters and captions.
- `apps/page/`: the presentation page.
- `checks/`: the browser checks. `scripts/`: the icon build.
- `design/icons/`: the icons' sources.
- `vercel.json`, `netlify.toml`: how those hosts build the page and the workbench.
- `skin.json`: what this skin is built from. Keep it; it records the Video.js version the skin was created with.

## License

Apache License 2.0; see `LICENSE`.

## Learn more

- [Build your own skin](https://videojs.org/docs/framework/react/guides/build-your-own-skin)
- [Customize skins](https://videojs.org/docs/framework/react/guides/customize-skins)
- [UI components](https://videojs.org/docs/framework/react/guides/ui-components)
