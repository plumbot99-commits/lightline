// Lightline part 3: the Audio Lab's face, in a real browser (Edge, this repo's Playwright). At 1440, 390 and 320 px
// viewports (players of 1200, 342 and 272 px, as in part 2): where the lab opens from (its button beside the
// volume, or a row in Settings when the player is narrow), by keyboard alone, Escape and focus, the popover inside
// the viewport, forced colors, reduced motion (the meter holds still), the meter's colors, and the workbench's
// Audio section kept in the URL. Usage:
//   node checks/audio-lab-ui.mjs <evidence-dir> [film]
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const OUT = process.argv[2];
const FILM = process.argv[3] ?? "the-only-one-that-fits";
fs.mkdirSync(OUT, { recursive: true });
const ROOT = `http://localhost:${process.env.PORT ?? 5180}`;
const PLAYER = { 1440: 1200, 390: 342, 320: 272 };
const report = { at: new Date().toString(), film: FILM, widths: {}, console: [] };

const browser = await chromium.launch({ channel: "msedge" });

async function open(viewport, media = {}) {
  const context = await browser.newContext({ viewport: { width: viewport, height: viewport > 600 ? 900 : 780 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("console", (m) => m.type() === "error" && !/favicon/.test(m.location()?.url ?? "") && report.console.push(`${viewport}: ${m.text()}`));
  page.on("pageerror", (e) => report.console.push(`${viewport}: page error ${e}`));
  if (Object.keys(media).length) await page.emulateMedia(media);
  await page.goto(`${ROOT}/preview.html#film=${FILM}&width=${PLAYER[viewport]}&ratio=16:9&scheme=dark`, { waitUntil: "load" });
  await page.waitForSelector("video");
  await page.evaluate(
    () =>
      new Promise((r) => {
        const v = document.querySelector("video");
        v.readyState >= 1 ? r() : v.addEventListener("loadedmetadata", r, { once: true });
      })
  );
  await page.waitForTimeout(400);
  return { context, page };
}

/** The focused element, named the way a check can read it. */
const focused = (page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    return el ? `${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).split(" ").join(".") : ""}${el.getAttribute("aria-label") ? `[${el.getAttribute("aria-label")}]` : ""}${el.getAttribute("value") ? `=${el.getAttribute("value")}` : ""}` : null;
  });

const labFacts = (page) =>
  page.evaluate(() => {
    const lab = document.querySelector(".lightline-lab");
    const box = lab.getBoundingClientRect();
    const colors = {};
    for (const sel of [".lightline-lab-level", ".lightline-lab-peak", ".lightline-lab-track", ".lightline-lab-clip"]) {
      const cs = getComputedStyle(document.querySelector(sel));
      colors[sel] = { background: cs.backgroundColor, color: cs.color, border: cs.borderTopColor };
    }
    const curve = getComputedStyle(document.querySelector(".lightline-lab-line-curve"));
    return {
      open: lab.matches(":popover-open"),
      box: { left: Math.round(box.left), top: Math.round(box.top), right: Math.round(box.right), bottom: Math.round(box.bottom) },
      inViewport: box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight,
      scrolls: lab.scrollHeight > lab.clientHeight,
      overflowX: document.documentElement.scrollWidth > innerWidth,
      background: getComputedStyle(lab).backgroundImage !== "none" ? "gradient" : getComputedStyle(lab).backgroundColor,
      curveStroke: curve.stroke,
      bars: getComputedStyle(document.querySelector(".lightline-lab-bars")).display,
      readout: document.querySelector(".lightline-lab-readout").textContent,
      readoutHidden: getComputedStyle(document.querySelector(".lightline-lab-readout")).clipPath,
      meterColors: colors,
      labels: [...document.querySelectorAll(".lightline-lab-node")].map((n) => `${n.getAttribute("aria-label")} ${n.getAttribute("aria-valuetext")}`),
    };
  });

const play = (page) => page.evaluate(() => document.querySelector("video").play());

for (const viewport of [1440, 390, 320]) {
  const { context, page } = await open(viewport);
  const r = (report.widths[viewport] = {});
  r.button = await page.locator(".lightline-lab-button").count();

  // By keyboard alone: Tab from the page to the lab's opener.
  const stops = [];
  for (let i = 0; i < 16; i++) {
    await page.keyboard.press("Tab");
    const f = await focused(page);
    stops.push(f);
    if (r.button ? /lightline-lab-button/.test(f) : /aria-haspopup|Settings/.test(f ?? "") && /media-button/.test(f ?? "")) break;
  }
  r.tabStops = stops;
  await play(page);

  if (r.button) {
    await page.keyboard.press("Enter");
  } else {
    // Narrow: the lab is a row in Settings. Open Settings by keyboard and walk its rows to Audio Lab.
    const gear = page.locator('.video-controls-row button[aria-haspopup="menu"]');
    await gear.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    r.settingsRows = await page.locator(".media-menu-popup > .media-menu-content > [role^=menuitem]").allTextContents();
    for (let i = 0; i < 12; i++) {
      if (/Audio Lab/.test((await page.evaluate(() => document.activeElement?.textContent)) ?? "")) break;
      await page.keyboard.press("ArrowDown");
    }
    await page.keyboard.press("Enter");
  }
  await page.waitForFunction(() => document.querySelector(".lightline-lab")?.matches(":popover-open"));
  await page.waitForTimeout(500);
  r.focusOnOpen = await focused(page);
  r.facts = await labFacts(page);
  await page.screenshot({ path: path.join(OUT, `lab-${viewport}.png`) });

  // Through the lab by Tab: the preset group, the five nodes, the output group, the balance, the two tests.
  const inside = [];
  for (let i = 0; i < 11; i++) {
    inside.push(await focused(page));
    await page.keyboard.press("Tab");
  }
  r.labStops = inside;

  // A node by keyboard: arrows step 1 dB, Shift 3, Home resets; the preset becomes Custom and back.
  const node = page.locator(".lightline-lab-node").first();
  await node.focus();
  const steps = [];
  for (const key of ["ArrowUp", "ArrowUp", "Shift+ArrowUp", "PageDown", "ArrowDown", "Home"]) {
    await page.keyboard.press(key);
    steps.push(`${key}: ${await node.getAttribute("aria-valuetext")} (${await page.evaluate(() => document.querySelector(".lightline-lab-chip input:checked")?.value)})`);
  }
  r.nodeKeys = steps;
  // Arrows in the lab stay out of the player's hotkeys: the film did not seek or change volume.
  r.afterArrows = await page.evaluate(() => ({ volume: document.querySelector("video").volume, paused: document.querySelector("video").paused }));

  // A drag on the 4 kHz node: up is a boost.
  const k4 = page.locator(".lightline-lab-node").nth(3);
  const kb = await k4.boundingBox();
  await page.mouse.move(kb.x + kb.width / 2, kb.y + kb.height / 2);
  await page.mouse.down();
  await page.mouse.move(kb.x + kb.width / 2, kb.y + kb.height / 2 - 30, { steps: 5 });
  await page.mouse.up();
  r.dragUp = await k4.getAttribute("aria-valuetext");
  await page.screenshot({ path: path.join(OUT, `lab-${viewport}-drag.png`) });
  await k4.focus();
  await page.keyboard.press("Home");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  r.afterEscape = { open: await page.evaluate(() => document.querySelector(".lightline-lab").matches(":popover-open")), focus: await focused(page) };
  await page.evaluate(() => document.querySelector("video").pause());
  await context.close();
}

// Forced colors and reduced motion, at 1440.
for (const [name, media] of [
  ["forced", { forcedColors: "active" }],
  ["reduced", { reducedMotion: "reduce" }],
]) {
  const { context, page } = await open(1440, media);
  await play(page);
  await page.locator(".lightline-lab-button").click();
  await page.waitForTimeout(2600);
  const first = await labFacts(page);
  await page.waitForTimeout(1100);
  const second = await labFacts(page);
  report[name] = { ...first, readoutLater: second.readout };
  await page.screenshot({ path: path.join(OUT, `lab-1440-${name}.png`) });
  await context.close();
}

// The workbench: the Audio section and the URL. A link with eq=cinema&spatial=wide opens the lab on them; a pick
// in the lab comes back to the sidebar and the URL; a pick in the sidebar reaches the lab.
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on("console", (m) => m.type() === "error" && !/favicon/.test(m.location()?.url ?? "") && report.console.push(`shell: ${m.text()}`));
  await page.goto(`${ROOT}/?film=${FILM}&eq=cinema&spatial=wide`, { waitUntil: "load" });
  const frame = page.frameLocator("iframe");
  await frame.locator(".lightline-lab-button").click();
  const checked = () =>
    page.frames()[1].evaluate(() => [...document.querySelectorAll(".lightline-lab-chip input:checked")].map((i) => i.value));
  await page.waitForTimeout(500);
  const sync = (report.sync = { fromUrl: await checked() });
  await frame.locator(".lightline-lab-chip", { hasText: /^Music$/ }).click();
  await frame.locator(".lightline-lab-chip", { hasText: /^Mono$/ }).click();
  await page.waitForTimeout(1200);
  sync.urlAfterLab = new URL(page.url()).search;
  sync.sidebar = await page.locator('[role="combobox"]').allTextContents();
  await page.keyboard.press("Escape");
  await page.getByRole("combobox", { name: "Preset" }).click();
  await page.getByRole("option", { name: "Dialogue" }).click();
  await page.waitForTimeout(600);
  sync.afterSidebar = await checked();
  sync.urlAfterSidebar = new URL(page.url()).search;
  await page.screenshot({ path: path.join(OUT, "workbench-audio.png") });
  await context.close();
}

fs.writeFileSync(path.join(OUT, `ui-${FILM}.json`), JSON.stringify(report, null, 2));
await browser.close();
console.log(JSON.stringify(report, null, 1).slice(0, 12000));
