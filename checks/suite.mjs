// Lightline part 4: the Suite, measured. On the workbench's frame page (its 1360 px cap lifted so the room can take
// the viewport's width): the switch, every panel docked on every rail by the grip's menu, a pointer drag and its
// keyboard equal, a float moved by arrows, the layout across a reload, fullscreen, the guides, and each panel's
// numbers against the browser and hls.js (reached through React's fiber from the video element). The picture's
// overlap with every panel and both control rows is measured each time. Narrow widths: no switch, Cinema whole.
// Usage: PORT=5181 node checks/suite.mjs <evidence-dir> <film> <viewport-width> [--forced] [--reduced]
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const args = process.argv.slice(2);
const [OUT, FILM = "rogue-render", W = "1440"] = args.filter((a) => !a.startsWith("--"));
const FORCED = args.includes("--forced");
const REDUCED = args.includes("--reduced");
const width = Number(W);
const tag = `${FILM}-${W}${FORCED ? "-forced" : ""}${REDUCED ? "-reduced" : ""}`;
fs.mkdirSync(OUT, { recursive: true });
const report = { film: FILM, width, forced: FORCED, reduced: REDUCED, steps: [] };
const log = (name, value) => {
  report.steps.push({ name, ...value });
  console.log(name, JSON.stringify(value));
};

const browser = await chromium.launch({ channel: "msedge" });
const context = await browser.newContext({
  viewport: { width, height: width >= 1900 ? 1080 : width >= 1000 ? 900 : 844 },
  forcedColors: FORCED ? "active" : "none",
  reducedMotion: REDUCED ? "reduce" : "no-preference",
});
const page = await context.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && !/favicon/.test(m.location()?.url ?? "") && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
// hls.js cancels a segment's load when the film seeks: an abort, kept apart from a failure.
const aborted = [];
page.on("requestfailed", (r) => (/ABORTED/.test(r.failure()?.errorText ?? "") ? aborted : errors).push(`${r.failure()?.errorText} ${r.url().slice(0, 90)}`));
await page.addInitScript(() => {
  // Count the view transitions the skin starts.
  window.__transitions = 0;
  const start = Document.prototype.startViewTransition;
  if (start)
    Document.prototype.startViewTransition = function (...a) {
      window.__transitions++;
      return start.apply(this, a);
    };
});
const url = `http://localhost:${process.env.PORT ?? 5180}/preview.html#film=${FILM}&width=1360`;
const open = async (clear) => {
  // A new document each time: the URL differs only in its hash, which would not reload.
  await page.goto("about:blank");
  await page.goto(url, { waitUntil: "load" });
  await page.addStyleTag({ content: `.preview-player { max-width: none !important; }` });
  if (clear) await page.evaluate(() => localStorage.removeItem("lightline:suite"));
  if (clear) await page.reload({ waitUntil: "load" });
  if (clear) await page.addStyleTag({ content: `.preview-player { max-width: none !important; }` });
  await page.waitForSelector("video", { state: "attached" });
  await page.waitForFunction(() => document.querySelector("video").readyState >= 1);
  await page.waitForTimeout(800);
};
const shot = (name) => page.screenshot({ path: path.join(OUT, `${tag}-${name}.png`) });

// Boxes, the picture's overlap with every panel and control row, and the announcer's words.
const state = () =>
  page.evaluate(() => {
    const pic = document.querySelector(".lightline-suite-picture")?.getBoundingClientRect();
    const over = (el) => {
      if (!pic) return null;
      const b = el.getBoundingClientRect();
      return Math.round(Math.max(0, Math.min(b.right, pic.right) - Math.max(b.left, pic.left)) * Math.max(0, Math.min(b.bottom, pic.bottom) - Math.max(b.top, pic.top)));
    };
    const panels = Object.fromEntries(
      [...document.querySelectorAll(".lightline-panel")].map((p) => [
        p.dataset.panel,
        { rail: p.parentElement.dataset.rail, floating: p.hasAttribute("data-floating"), over: over(p), index: [...p.parentElement.querySelectorAll(":scope > .lightline-panel:not([data-floating])")].indexOf(p) },
      ]),
    );
    const controls = [".video-controls-top", ".video-controls-bottom"].reduce((n, s) => n + (over(document.querySelector(s)) ?? 0), 0);
    const room = document.querySelector(".media-skin").getBoundingClientRect();
    return {
      layout: document.querySelector(".media-skin").dataset.layout ?? "cinema",
      picture: pic && { w: Math.round(pic.width), h: Math.round(pic.height) },
      room: { w: Math.round(room.width), h: Math.round(room.height) },
      panels,
      panelOver: Object.values(panels).reduce((n, p) => n + (p.over ?? 0), 0),
      controlsOver: controls,
      said: document.querySelector(".media-status-announcer")?.textContent ?? "",
      overflowX: document.documentElement.scrollWidth > innerWidth,
    };
  });

// The grip's menu, by keyboard only: focus the grip, Enter, arrows to the item, Enter.
async function byMenu(panel, item) {
  const grip = page.locator(`.lightline-panel-${panel} .lightline-panel-grip`);
  await grip.focus();
  await page.keyboard.press("Enter");
  const menu = page.locator(`#${await grip.getAttribute("aria-controls")}`);
  await menu.waitFor({ state: "visible" });
  await page.waitForFunction(() => document.activeElement?.closest("[role=menu]"));
  const items = await menu.locator("[role^=menuitem]").allTextContents();
  const focused = await page.evaluate(() => document.activeElement.textContent);
  let at = items.indexOf(focused);
  const to = items.indexOf(item);
  while (at !== to) {
    await page.keyboard.press(at < to ? "ArrowDown" : "ArrowUp");
    at += at < to ? 1 : -1;
  }
  await page.keyboard.press("Enter");
  await page.waitForTimeout(250);
  const focus = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  return { ...(await state()), focus };
}

// A pointer drag of a panel's grip to a point; Alt held while dropping floats it.
async function drag(panel, x, y, alt = false) {
  const box = await page.locator(`.lightline-panel-${panel} .lightline-panel-grip`).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 30, box.y + 30, { steps: 4 });
  if (alt) await page.keyboard.down("Alt");
  await page.mouse.move(x, y, { steps: 12 });
  await page.mouse.up();
  if (alt) await page.keyboard.up("Alt");
  await page.waitForTimeout(250);
  return state();
}

await open(true);
const offered = await page.locator(".lightline-layout-option").count();
log("switch", { offered: offered > 0, layout: (await state()).layout });

if (offered === 0) {
  // Narrow: Suite not offered; with Suite stored, the player still shows Cinema whole.
  await page.evaluate(() => localStorage.setItem("lightline:suite", JSON.stringify({ mode: "suite", panels: {} })));
  await open(false);
  log("narrow with Suite stored", await state());
  await shot("narrow");
} else {
  await page.locator(".lightline-layout-option", { hasText: "Suite" }).click();
  await page.waitForTimeout(700);
  log("suite default", { ...(await state()), transitions: await page.evaluate(() => window.__transitions) });
  await page.evaluate(async () => {
    const v = document.querySelector("video");
    v.muted = true;
    await v.play();
  });
  await page.waitForTimeout(3500);
  await shot("default");

  // Every panel on every rail, by the menu.
  for (const panel of ["lab", "deck", "telemetry", "guides"]) {
    for (const item of ["Dock top", "Dock right", "Dock bottom", "Dock left"]) {
      const s = await byMenu(panel, item);
      log(`menu ${panel} ${item}`, { rail: s.panels[panel]?.rail, index: s.panels[panel]?.index, panelOver: s.panelOver, controlsOver: s.controlsOver, picture: s.picture, said: s.said, focus: s.focus });
    }
  }
  await shot("all-left");
  await page.locator(".media-skin").evaluate(() => {});
  // Back to the start, by the Settings row.
  await page.evaluate(() => localStorage.removeItem("lightline:suite"));
  await open(false);
  await page.locator(".lightline-layout-option", { hasText: "Suite" }).click();
  await page.waitForTimeout(500);

  // A drag and its keyboard equal: Stream dragged to the left of the frame, under the lab.
  const frame = await page.locator(".lightline-suite-frame").boundingBox();
  const lab = await page.locator(".lightline-panel-lab").boundingBox();
  let s = await drag("telemetry", frame.x - 120, lab.y + lab.height - 10);
  const dragged = { rail: s.panels.telemetry.rail, index: s.panels.telemetry.index, panelOver: s.panelOver, said: s.said };
  log("drag telemetry to left", dragged);
  // Its keyboard equal: away, then Dock left (the end of the rail) and Move up until it is where the drag put it.
  s = await byMenu("telemetry", "Dock right");
  s = await byMenu("telemetry", "Dock left");
  while (s.panels.telemetry.index > dragged.index) s = await byMenu("telemetry", "Move up");
  log("menu telemetry Dock left, Move up (the drag's equal)", { rail: s.panels.telemetry.rail, index: s.panels.telemetry.index, said: s.said, same: s.panels.telemetry.rail === dragged.rail && s.panels.telemetry.index === dragged.index });
  s = await byMenu("telemetry", "Move up");
  log("menu telemetry Move up", { index: s.panels.telemetry.index, said: s.said });

  // Alt-drop: Timecode floated over the picture's middle is kept out of the frame.
  s = await drag("deck", frame.x + frame.width / 2, frame.y + frame.height + 40, true);
  log("alt-drag deck below frame", { rail: s.panels.deck.rail, floating: s.panels.deck.floating, panelOver: s.panelOver, picture: s.picture, said: s.said });
  s = await drag("deck", frame.x + frame.width / 2, frame.y + frame.height / 2, true);
  log("alt-drag deck onto the picture", { rail: s.panels.deck.rail, floating: s.panels.deck.floating, panelOver: s.panelOver, picture: s.picture, said: s.said });
  // Arrows move the floating panel; it stays out of the frame.
  await page.locator(".lightline-panel-deck .lightline-panel-grip").focus();
  const before = await page.locator(".lightline-panel-deck").boundingBox();
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  for (let i = 0; i < 30; i++) await page.keyboard.press("Shift+ArrowUp");
  const after = await page.locator(".lightline-panel-deck").boundingBox();
  s = await state();
  log("arrows on floating deck", { movedX: Math.round(after.x - before.x), movedY: Math.round(after.y - before.y), panelOver: s.panelOver, said: s.said });
  await shot("float");

  // Close one, and the layout across a reload.
  s = await byMenu("guides", "Close");
  log("menu guides Close", { shown: !!s.panels.guides, said: s.said });
  const kept = JSON.stringify((await state()).panels);
  await open(false);
  s = await state();
  log("after reload", { layout: s.layout, same: JSON.stringify(s.panels) === kept, panelOver: s.panelOver, panels: s.panels, before: JSON.parse(kept) });

  // The Settings rows: the closed panel shown again, then Reset layout.
  const settings = page.locator('.video-controls-bottom button[aria-haspopup="menu"]').last();
  await settings.click();
  await page.locator(".media-menu-item", { hasText: "Timeline" }).click();
  await page.waitForTimeout(300);
  log("settings show guides", { shown: !!(await state()).panels.guides, said: (await state()).said });
  if ((await settings.getAttribute("aria-expanded")) !== "true") await settings.click();
  await page.locator(".media-menu-item", { hasText: "Reset layout" }).click();
  await page.waitForTimeout(300);
  s = await state();
  log("settings reset", { panels: Object.fromEntries(Object.entries(s.panels).map(([k, v]) => [k, v.rail])), said: s.said });

  // The numbers, against the browser and hls.js.
  await page.evaluate(async () => {
    const v = document.querySelector("video");
    v.muted = true;
    await v.play();
  });
  await page.waitForTimeout(4000);
  const numbers = await page.evaluate(() => {
    const v = document.querySelector("video");
    // hls.js: the media adapter holds it as `engine`; find it in the fiber's hooks above the video element.
    let hls = null;
    const key = Object.keys(v).find((k) => k.startsWith("__reactFiber"));
    for (let f = v[key]; f && !hls; f = f.return) {
      for (let h = f.memoizedState; h && !hls; h = h.next) {
        const m = h.memoizedState;
        for (const c of [m, m?.current]) if (c && typeof c === "object" && c.engine?.levels) hls = c.engine;
      }
    }
    const rows = Object.fromEntries([...document.querySelectorAll(".lightline-telemetry-row")].map((r) => [r.querySelector("dt").textContent, r.querySelector("dd").textContent]));
    const q = v.getVideoPlaybackQuality();
    const lvl = hls?.levels?.[hls.currentLevel];
    let ahead = null;
    for (let i = 0; i < v.buffered.length; i++) if (v.buffered.start(i) <= v.currentTime && v.buffered.end(i) >= v.currentTime) ahead = v.buffered.end(i) - v.currentTime;
    return {
      panel: rows,
      browser: { resolution: `${v.videoWidth} × ${v.videoHeight}`, dropped: q.droppedVideoFrames, total: q.totalVideoFrames, ahead: ahead?.toFixed(1), networkState: v.networkState, readyState: v.readyState },
      hls: hls && { level: hls.currentLevel, of: hls.levels.length, height: lvl?.height, bitrate: lvl?.bitrate, codecs: [lvl?.videoCodec, lvl?.audioCodec].join(", "), bandwidthEstimate: hls.bandwidthEstimate, frameRate: lvl?.frameRate, attrsFrameRate: lvl?.attrs?.["FRAME-RATE"] ?? null },
    };
  });
  log("telemetry", numbers);

  // The timecode: paused, the readout against the frame times; one frame forward and back.
  const tc = await page.evaluate(async () => {
    const v = document.querySelector("video");
    v.pause();
    const read = () => document.querySelector(".lightline-deck-readout").textContent;
    const wait = () => new Promise((r) => setTimeout(r, 400));
    v.currentTime = 10.5 / 24;
    await wait();
    const first = { time: v.currentTime, readout: read(), fps: document.querySelector(".lightline-deck .lightline-panel-note").textContent };
    document.querySelector(".lightline-deck [aria-label='Forward one frame']").click();
    await wait();
    const forward = { time: v.currentTime, readout: read() };
    document.querySelector(".lightline-deck [aria-label='Back one frame']").click();
    document.querySelector(".lightline-deck [aria-label='Back one frame']").click();
    await wait();
    const back = { time: v.currentTime, readout: read() };
    const pills = [...document.querySelectorAll(".lightline-deck-pill")];
    const track = [...v.textTracks].find((t) => t.kind === "chapters");
    let seek = null;
    if (pills[2]) {
      pills[2].click();
      await wait();
      seek = { pill: pills[2].textContent, to: v.currentTime, cue: track?.cues?.[2]?.startTime, current: document.querySelector(".lightline-deck-pill[aria-current='true']")?.textContent };
    }
    return { first, forward, back, pills: pills.length, cues: track?.cues?.length ?? 0, seek };
  });
  log("timecode", tc);

  // The waveform's span against the stream's duration, and the strip's tiles.
  log("timeline", await page.evaluate(() => ({
    duration: document.querySelector("video").duration,
    waveShare: document.querySelector(".lightline-timeline-wave svg")?.style.inlineSize ?? null,
    tiles: document.querySelectorAll(".lightline-timeline-tile").length,
    note: document.querySelector(".lightline-timeline-note")?.textContent ?? null,
  })));

  // The guides: all on, drawn over the picture's own box; all off, gone. They sit in the bar's middle, or in its Guides
  // menu where the middle is too narrow for them (design/guides-bar-timeline.md); the menu stays open between them.
  const GUIDE_LABELS = ["Action safe 90%", "Title safe 80%", "2.39:1", "9:16 center cut", "Thirds"];
  const folded = await page.locator(".lightline-bar-guides[data-folded]").count() > 0;
  const toggleGuides = async () => {
    for (const label of GUIDE_LABELS) {
      if (!folded) {
        await page.locator(".lightline-bar-guide", { hasText: label }).click();
        continue;
      }
      const button = page.locator(".lightline-bar-guides-button");
      if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
      await page.getByRole("menuitemcheckbox", { name: label, exact: true }).click();
    }
    if (folded) await page.keyboard.press("Escape");
  };
  await toggleGuides();
  await page.waitForTimeout(300);
  const guides = await page.evaluate(() => {
    const g = document.querySelector(".lightline-guides")?.getBoundingClientRect();
    const p = document.querySelector(".lightline-suite-picture").getBoundingClientRect();
    return { lines: document.querySelectorAll(".lightline-guides-line line").length, guide: g && [g.x, g.y, g.width, g.height].map(Math.round), picture: [p.x, p.y, p.width, p.height].map(Math.round) };
  });
  log("guides on", { folded, ...guides });
  await shot("guides");
  await toggleGuides();
  log("guides off", { svg: await page.locator(".lightline-guides").count() });

  // Fullscreen: the whole room fills the screen.
  await page.locator(".media-fullscreen-button").click();
  await page.waitForTimeout(900);
  s = await state();
  log("fullscreen", { fullscreen: await page.evaluate(() => !!document.fullscreenElement), room: s.room, picture: s.picture, panelOver: s.panelOver, controlsOver: s.controlsOver });
  await shot("fullscreen");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  // Back to Cinema.
  await page.locator(".lightline-layout-option", { hasText: "Cinema" }).click();
  await page.waitForTimeout(600);
  s = await state();
  log("cinema again", { layout: s.layout, panels: Object.keys(s.panels).length, transitions: await page.evaluate(() => window.__transitions), said: s.said });
}

report.errors = errors;
report.aborted = aborted.length;
console.log("aborted segment loads (seeks):", aborted.length);
console.log("errors:", errors.length ? errors : "none");
fs.writeFileSync(path.join(OUT, `${tag}.json`), JSON.stringify(report, null, 1));
await browser.close();
