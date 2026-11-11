// Lightline, slice lightline: the look in each state, in a real browser, at 1440, 390 and 320 px. Plays the
// film from Mux through the workbench on port 5180. Uses this repo's Playwright (1.62.1) with Edge, else its
// Chromium. Usage:
//   node checks/lightline-look.mjs <evidence-dir> [--film=<id>] [width ...]
// Part 2 added --film (rogue-render, the default; the-only-one-that-fits; likeness-models) and the table of
// each film's moments below.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const OUT = process.argv[2];
const FILM = (process.argv.find((a) => a.startsWith("--film=")) ?? "--film=rogue-render").slice(7);
const WIDTHS = process.argv.slice(3).filter((a) => !a.startsWith("--")).map(Number);
// Each film's moments: a lit stretch to sample, a scene cut to cross (from a little before it), and the last
// second. The silent film has no chapters, so no cut: the check plays a stretch and expects no flare.
const MOMENTS = {
  "rogue-render": { playing: 9, cut: { from: 16.6, at: 17.5 }, end: 49.2, still: 20.5 },
  "the-only-one-that-fits": { playing: 72, cut: { from: 64.8, at: 65.68 }, end: 237.2, still: 72 },
  "likeness-models": { playing: 12, cut: null, end: 21.2, still: 12 },
}[FILM];
fs.mkdirSync(OUT, { recursive: true });
const BASE = `http://localhost:${process.env.PORT ?? 5180}/preview.html`;
const report = { at: new Date().toString(), film: FILM, runs: [] };

// A 1440 px desktop window shows a large player with room around it for the film's light; phones fill the
// width inside the preview page's 24 px padding.
const VIEW = { 1440: { width: 1440, height: 900, player: 1200 }, 390: { width: 390, height: 844 }, 320: { width: 320, height: 640 } };

async function open(browser, w, media = {}, init) {
  const v = VIEW[w];
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height } });
  if (init) await init(ctx);
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  const consoleErrors = [];
  page.on("console", (m) => m.type() === "error" && !m.location().url?.endsWith("/favicon.ico") && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  // The browser's own /favicon.ico request 404s: the workbench has no favicon. Not the skin's; counted apart.
  page.on("response", (r) => r.status() >= 400 && !r.url().endsWith("/favicon.ico") && consoleErrors.push(`HTTP ${r.status()} ${r.url()}`));
  if (Object.keys(media).length) await page.emulateMedia(media);
  const hash = `film=${FILM}&ratio=16:9&scheme=dark${v.player ? `&width=${v.player}` : ""}`;
  await page.goto(`${BASE}#${hash}`, { waitUntil: "load" });
  await page.waitForSelector("video");
  return { ctx, page, consoleErrors };
}

const ready = (page) => page.evaluate(async () => {
  const v = document.querySelector("video");
  v.muted = true;
  await new Promise((r) => (v.readyState >= 2 ? r() : v.addEventListener("loadeddata", r, { once: true })));
});
const playFrom = (page, t, ms) => page.evaluate(async ([t, ms]) => {
  const v = document.querySelector("video");
  v.currentTime = t;
  await new Promise((r) => v.addEventListener("seeked", r, { once: true }));
  await v.play();
  await new Promise((r) => setTimeout(r, ms));
}, [t, ms]);
const facts = (page) => page.evaluate(() => {
  const skin = document.querySelector(".media-skin");
  const light = document.querySelector(".lightline-light");
  const trail = document.querySelector(".lightline-beam-trail");
  const head = document.querySelector(".media-time-slider-thumb");
  return {
    state: light?.dataset.state,
    ambient: skin.style.getPropertyValue("--lightline-ambient") || null,
    frameGlow: getComputedStyle(skin).boxShadow,
    trailOpacity: trail ? getComputedStyle(trail).opacity : null,
    trailDisplay: trail ? getComputedStyle(trail).display : null,
    headGlow: head ? getComputedStyle(head).boxShadow : null,
    fill: getComputedStyle(document.querySelector(".media-time-slider-fill")).backgroundColor,
    flares: document.querySelectorAll(".lightline-cut-flare").length,
    overflowX: document.documentElement.scrollWidth > innerWidth,
    time: document.querySelector("video").currentTime,
  };
});
const showControls = async (page) => {
  const box = await page.locator(".media-skin").boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.35);
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4);
};

async function run(browser, w, name, media, steps, init) {
  const { ctx, page, consoleErrors } = await open(browser, w, media, init);
  const entry = { width: w, name, media, shots: [] };
  try {
    await steps(page, async (label, extra = {}) => {
      const file = `lightline-${w}-${label}.png`;
      await page.screenshot({ path: path.join(OUT, file) });
      entry.shots.push({ label, file, ...(await facts(page)), ...extra });
    });
  } catch (e) {
    entry.failed = e.message;
  }
  entry.consoleErrors = consoleErrors;
  report.runs.push(entry);
  await ctx.close();
}

const browser = await chromium.launch({ channel: "msedge" }).catch(() => chromium.launch());
try {
  for (const w of WIDTHS.length ? WIDTHS : [1440, 390, 320]) {
    await run(browser, w, "states", {}, async (page, shot) => {
      await ready(page);
      // Playing, after the glow has sampled the picture.
      await playFrom(page, MOMENTS.playing, 2200);
      await showControls(page);
      await page.waitForTimeout(300);
      await shot("playing");
      // A scene cut: play up to it and catch the flare as the playhead passes it. With no chapters, play a
      // stretch and expect none.
      if (MOMENTS.cut) {
        await playFrom(page, MOMENTS.cut.from, 0);
        await page.waitForFunction((at) => document.querySelector("video").currentTime > at + 0.05, MOMENTS.cut.at, { timeout: 8000 });
        await showControls(page);
        await page.waitForTimeout(120);
        await shot("cut-flare");
      } else {
        await playFrom(page, 5, 1600);
        await showControls(page);
        await shot("no-cut");
      }
      // Paused: the picture dims, the playhead and the frame's glow turn orange.
      await page.evaluate(() => document.querySelector("video").pause());
      await page.waitForTimeout(500);
      await showControls(page);
      await shot("paused");
      // The film strip: the pointer on the rail at 60 % shows a storyboard frame.
      const rail = await page.locator(".media-time-slider").boundingBox();
      await page.mouse.move(rail.x + rail.width * 0.6, rail.y + rail.height / 2);
      await page.waitForTimeout(700);
      const strip = await page.evaluate(() => {
        const img = document.querySelector(".media-slider-thumbnail-image");
        const box = document.querySelector(".media-slider-thumbnail")?.getBoundingClientRect();
        return { src: img?.currentSrc || img?.getAttribute("src"), complete: img?.complete, natural: img?.naturalWidth, shown: box ? `${Math.round(box.width)}x${Math.round(box.height)}` : null };
      });
      await shot("film-strip", { strip });
      // The end: green sweeps the beam once.
      await playFrom(page, MOMENTS.end, 0);
      await page.waitForFunction(() => document.querySelector("video").ended, null, { timeout: 8000 });
      await showControls(page);
      await page.waitForTimeout(350);
      await shot("ended-sweep");
      await page.waitForTimeout(1300);
      await shot("ended");
    });
  }

  // An error: the stream refused, so the media fails; the light layer flickers magenta once and holds.
  await run(browser, 1440, "error", {}, async (page, shot) => {
    await page.waitForSelector(".lightline-light[data-state=error]", { timeout: 20000 });
    await page.waitForTimeout(150);
    await shot("error-flicker");
    await page.waitForTimeout(1200);
    await shot("error");
  }, (ctx) => ctx.route(/stream\.mux\.com/, (r) => r.abort()));

  // Reduced motion: a fixed glow, no trail, no flare, no sweep.
  await run(browser, 1440, "reduced-motion", { reducedMotion: "reduce" }, async (page, shot) => {
    await ready(page);
    await playFrom(page, MOMENTS.playing, 1800);
    await showControls(page);
    await shot("reduced-motion-playing");
    await playFrom(page, MOMENTS.end, 0);
    await page.waitForFunction(() => document.querySelector("video").ended, null, { timeout: 8000 });
    await page.waitForTimeout(350);
    await showControls(page);
    const anim = await page.evaluate(() => getComputedStyle(document.querySelector(".lightline-beam-sweep")).display);
    await shot("reduced-motion-ended", { sweepDisplay: anim });
  });

  // Forced colors: the light draws nothing; Scaffold's system colors carry the controls.
  await run(browser, 1440, "forced-colors", { forcedColors: "active" }, async (page, shot) => {
    await ready(page);
    await playFrom(page, MOMENTS.still, 400);
    await page.evaluate(() => document.querySelector("video").pause());
    await showControls(page);
    await page.waitForTimeout(400);
    await shot("forced-colors-paused");
  });
} finally {
  await browser.close();
  fs.writeFileSync(path.join(OUT, "lightline-look.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 1));
}
