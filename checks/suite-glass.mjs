// Lightline, the glass room (design/glass-polish.md). Opens the page in the Suite at a size, with the skin's own room
// or one of the page's looks, lights the room, then hides every word and measures each word's color against the
// lightest pixel behind it: the docked panels (glass over the room), the frame's top row and the bar. The light is the
// film at its brightest scene (found by seeking through the film and measuring each frame), or the worst the blend
// can do (all four corners pure green, which the color blend lifts most in WCAG luminance), or none. Also reports
// what the settings leave of the room: the plate, the light, the panes.
// Usage: PORT=5192 node checks/suite-glass.mjs <evidence-dir> <width>x<height> [--look=<file>] [--light=film|worst|none]
//          [--film=<id>] [--fullscreen] [--ambient=off|low|medium|high] [--reduced-motion] [--reduced-transparency]
//          [--contrast] [--forced] [--looks=test] [--glass=<0 to 1>] [--loop-step=<seconds>]
// --glass sets `--lightline-glass-opacity` on the player, as a host (the page's Glass slider) does. --room-light sets
// `--lightline-room-light` on it, as a host that lights the Suite's room with the film does (off unless set, since
// design/guides-bar-timeline.md).
// A look with a loop (looks.json's `loop`) is measured at a frame every --loop-step seconds (0.5 by default) through
// the whole loop, each word at its worst frame; the report gives the lowest word of every frame.
// --looks=test serves the page the CSS-only test plates (test-*.jpg, never committed, kept outside the repository in
// the folder TEST_LOOKS names) and a looks.json for them, by route, in place of the real looks, which stay untouched.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const [OUT, SIZE = "1920x1080", ...flags] = process.argv.slice(2);
const [width, height] = SIZE.split("x").map(Number);
const flag = (name) => flags.find((f) => f.startsWith(`--${name}=`))?.split("=")[1];
const look = flag("look") ?? "";
const light = flag("light") ?? "film";
const film = flag("film");
const ambient = flag("ambient");
const fullscreen = flags.includes("--fullscreen");
const forced = flags.includes("--forced");
const reducedMotion = flags.includes("--reduced-motion");
const reducedTransparency = flags.includes("--reduced-transparency");
const contrast = flags.includes("--contrast");
const testLooks = flag("looks") === "test";
const glass = flag("glass");
const roomLight = flag("room-light");
const loopStep = Number(flag("loop-step") ?? 0.5);
const tag = [SIZE, look ? look.replace(/\.\w+$/, "").replace(/\//g, "-") : "default", light, film, glass && `glass-${glass}`, roomLight && `room-light-${roomLight}`, fullscreen && "fullscreen", ambient && `ambient-${ambient}`,
  reducedMotion && "reduced-motion", reducedTransparency && "reduced-transparency", contrast && "contrast", forced && "forced"]
  .filter(Boolean).join("-");
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "msedge" });
const context = await browser.newContext({
  viewport: { width, height },
  forcedColors: forced ? "active" : "none",
  reducedMotion: reducedMotion ? "reduce" : "no-preference",
  contrast: contrast ? "more" : "no-preference",
});
const page = await context.newPage();
if (reducedTransparency) {
  // Playwright has no switch for it: the media query is answered through the DevTools protocol.
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value: "reduce" }] });
}
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
// A stream chunk the brightest-scene search's own seeking aborts is not a fault of the page.
page.on("requestfailed", (r) => !(/mux\.com/.test(r.url()) && /ABORTED/.test(r.failure()?.errorText ?? "")) && errors.push(`failed: ${r.url()} ${r.failure()?.errorText}`));

if (testLooks) {
  const names = { window: "Test: window wall", lamps: "Test: lamp corner", studio: "Test: studio shelves", night: "Test: night city" };
  const list = Object.entries(names).map(([k, name]) => ({ file: `test-${k}.jpg`, name }));
  await page.route("**/looks/looks.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(list) }));
  await page.route("**/looks/test-*.jpg", (route) =>
    route.fulfill({ path: path.join(process.env.TEST_LOOKS, path.basename(new URL(route.request().url()).pathname)) }));
}
await page.addInitScript(([look, ambient]) => {
  localStorage.setItem("lightline-page:look", look);
  localStorage.removeItem("lightline:suite");
  if (ambient) localStorage.setItem("lightline:ambient", ambient);
}, [look, ambient]);
await page.goto(`http://localhost:${process.env.PORT ?? 5192}${process.env.BASE ?? "/"}`, { waitUntil: "load" });
await page.waitForSelector("video");
if (film) {
  await page.locator(".page-card", { hasText: new RegExp(film.replace(/-/g, ".?"), "i") }).first().click();
  await page.waitForTimeout(1500);
}
await page.locator(".media-skin").scrollIntoViewIfNeeded();
await page.locator(".lightline-layout-option", { hasText: "Suite" }).click();
await page.waitForFunction(() => document.querySelector(".media-skin")?.dataset.layout === "suite");
if (fullscreen) {
  await page.evaluate(() => document.querySelector(".media-skin").requestFullscreen());
  await page.waitForTimeout(800);
}
await page.waitForTimeout(800);
if (glass) await page.evaluate((g) => document.querySelector(".media-skin").style.setProperty("--lightline-glass-opacity", g), glass);
if (roomLight) await page.evaluate((l) => document.querySelector(".media-skin").style.setProperty("--lightline-room-light", l), roomLight);

// The film at its brightest: seek through it, measure each frame's mean luminance, play a moment from the brightest
// so the skin's own sample lights the room, then pause there.
let brightest = null;
if (light === "film") {
  brightest = await page.evaluate(async () => {
    const v = document.querySelector("video:not(.lightline-room-loop)");
    v.muted = true;
    await v.play();
    v.pause();
    const c = Object.assign(document.createElement("canvas"), { width: 32, height: 18 });
    const ctx = c.getContext("2d", { willReadFrequently: true });
    const lin = (x) => ((x /= 255) <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
    let best = { t: 0, l: -1 };
    const step = v.duration > 120 ? 4 : 2;
    for (let t = 0.5; t < v.duration - 0.5; t += step) {
      v.currentTime = t;
      await new Promise((r) => v.addEventListener("seeked", r, { once: true }));
      await new Promise((r) => setTimeout(r, 120));
      ctx.drawImage(v, 0, 0, 32, 18);
      const d = ctx.getImageData(0, 0, 32, 18).data;
      let l = 0;
      for (let i = 0; i < d.length; i += 4) l += 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
      l /= d.length / 4;
      if (l > best.l) best = { t, l };
    }
    v.currentTime = Math.max(0, best.t - 0.6);
    await v.play();
    await new Promise((r) => setTimeout(r, 1200));
    v.pause();
    // The fade to the last sample.
    await new Promise((r) => setTimeout(r, 1800));
    return { t: best.t, luminance: +best.l.toFixed(3) };
  });
} else if (light === "worst") {
  await page.evaluate(() => {
    const skin = document.querySelector(".media-skin");
    for (const c of ["tl", "tr", "bl", "br"]) skin.style.setProperty(`--lightline-room-${c}`, "rgb(0 255 0 / 1)");
  });
  await page.waitForTimeout(1900);
}

// A loop shows once the skin has measured it, then fades in.
await page.waitForFunction(() => !document.querySelector(".lightline-room-loop") || document.querySelector(".lightline-room-loop[data-ready]"), null, { timeout: 20000 });
await page.waitForTimeout(1800);

const state = await page.evaluate(() => {
  const skin = document.querySelector(".media-skin");
  const room = skin.querySelector(".lightline-room");
  const lightEl = skin.querySelector(".lightline-room-light");
  const panel = skin.querySelector(".lightline-panel:not([data-floating])");
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const plate = skin.querySelector(".lightline-room-plate");
  return {
    room: cs(room)?.display ?? "absent",
    plateImage: cs(plate)?.backgroundImage.slice(0, 80) ?? null,
    plateFilter: cs(plate)?.filter ?? null,
    loop: skin.querySelector(".lightline-room-loop") ? { ready: skin.querySelector(".lightline-room-loop").hasAttribute("data-ready"), exposure: skin.style.getPropertyValue("--lightline-room-exposure"), lift: skin.style.getPropertyValue("--lightline-room-lift") } : "absent",
    light: cs(lightEl) ? { display: cs(lightEl).display, opacity: cs(lightEl).opacity, tl: cs(lightEl).getPropertyValue("--lightline-room-tl") } : null,
    stage: cs(skin.querySelector(".lightline-room-stage"))?.display ?? "absent",
    pane: panel ? { background: cs(panel).backgroundImage.slice(0, 90), backdrop: cs(panel).backdropFilter } : null,
  };
});

// Every word in the room, with its color, before the words are hidden.
const words = await page.evaluate(() => {
  const skin = document.querySelector(".media-skin");
  const scopes = [
    ...[...skin.querySelectorAll(".lightline-rail > .lightline-panel:not([data-floating])")].map((el) => [`panel ${el.dataset.panel}`, el]),
    ["top row", skin.querySelector(".video-controls-top")],
    ["bar", skin.querySelector(".video-controls-bottom")],
  ].filter(([, el]) => el);
  const out = [];
  for (const [scope, root] of scopes) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim()) continue;
      const el = n.parentElement;
      const cs = getComputedStyle(el);
      if (cs.visibility !== "visible" || +cs.opacity === 0) continue;
      // Words for screen readers only (clipped to nothing) and words in a hidden popup (the slider preview at opacity
      // 0) are not seen, so not measured.
      let hidden = false;
      for (let a = el; a && a !== root.parentElement; a = a.parentElement) {
        const s = getComputedStyle(a);
        const b = a.getBoundingClientRect();
        if (s.clipPath !== "none" || s.clip !== "auto" || +s.opacity === 0 || (b.width <= 1 && b.height <= 1)) hidden = true;
      }
      if (hidden) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) {
        if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) continue;
        out.push({ scope, text: n.textContent.trim().slice(0, 24), color: cs.color, x: r.x, y: r.y, w: r.width, h: r.height });
      }
    }
  }
  return out;
});

await page.screenshot({ path: path.join(OUT, `${tag}.png`) });
await page.addStyleTag({
  content: `.media-skin * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; caret-color: transparent !important; }`,
});
await page.waitForTimeout(150);

// A room that loops: paused at a frame every `--loop-step` seconds through the whole loop, each measured, and each
// word kept at its worst frame (the loop's still for reduced motion, where it never plays).
const loop = await page.evaluate(() => {
  const v = document.querySelector(".lightline-room-loop[data-ready]");
  if (!v) return null;
  v.pause();
  return { src: v.currentSrc.replace(/^.*\//, ""), duration: v.duration };
});
const times = loop ? Array.from({ length: Math.ceil(loop.duration / loopStep) }, (_, i) => +(i * loopStep).toFixed(2)) : [null];
const frames = [];
for (const t of times) {
  if (t !== null) {
    await page.evaluate(async (t) => {
      const v = document.querySelector(".lightline-room-loop");
      v.pause();
      v.currentTime = t;
      await new Promise((r) => v.addEventListener("seeked", r, { once: true }));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }, t);
  }
  frames.push({ t, bare: (await page.screenshot()).toString("base64") });
}

const measure = (bare) => page.evaluate(async ({ bare, words }) => {
  const img = new Image();
  img.src = `data:image/png;base64,${bare}`;
  await img.decode();
  const c = Object.assign(document.createElement("canvas"), { width: img.width, height: img.height });
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const scale = img.width / innerWidth;
  const lin = (x) => ((x /= 255) <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  const L = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return words.map((w) => {
    const x0 = Math.max(0, Math.floor(w.x * scale));
    const y0 = Math.max(0, Math.floor(w.y * scale));
    const x1 = Math.min(img.width, Math.ceil((w.x + w.w) * scale));
    const y1 = Math.min(img.height, Math.ceil((w.y + w.h) * scale));
    const d = ctx.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data;
    let max = 0;
    let at = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) {
      const l = L(d[i], d[i + 1], d[i + 2]);
      if (l > max) [max, at] = [l, [d[i], d[i + 1], d[i + 2]]];
    }
    const m = w.color.match(/[\d.]+/g).map(Number);
    const a = m[3] ?? 1;
    const fg = [0, 1, 2].map((k) => m[k] * a + at[k] * (1 - a));
    const lt = L(...fg);
    const ratio = (Math.max(lt, max) + 0.05) / (Math.min(lt, max) + 0.05);
    return { scope: w.scope, text: w.text, at: [Math.round(w.x), Math.round(w.y), Math.round(w.w), Math.round(w.h)], color: w.color, behind: `rgb(${at.join(" ")})`, ratio: +ratio.toFixed(2) };
  });
}, { bare, words });

let results = null;
const lowestByFrame = [];
for (const { t, bare } of frames) {
  const frame = await measure(bare);
  lowestByFrame.push({ t, ratio: Math.min(...frame.map((r) => r.ratio)) });
  results = results ? results.map((r, i) => (frame[i].ratio < r.ratio ? { ...frame[i], t } : r)) : frame.map((r) => ({ ...r, t }));
}

const byScope = {};
for (const r of results) if (!byScope[r.scope] || r.ratio < byScope[r.scope].ratio) byScope[r.scope] = r;
const min = results.reduce((m, r) => (r.ratio < m.ratio ? r : m), { ratio: Infinity });
const report = { tag, state, brightest, loop: loop && { ...loop, frames: frames.length, lowestByFrame }, words: results.length, minimum: min, byScope, under45: results.filter((r) => r.ratio < 4.5), errors };
fs.writeFileSync(path.join(OUT, `${tag}.json`), JSON.stringify({ ...report, results }, null, 1));
console.log(JSON.stringify(report, null, 1));
console.log(results.length && min.ratio >= 4.5 && !errors.length ? "PASS" : results.length ? "FAIL" : "NO WORDS");
await browser.close();
