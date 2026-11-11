// Lightline, slice 4, rerun on the Mux stream: the skin under forced colors, more contrast and reduced motion, at 320 px, and driven by
// keyboard alone. Uses this repo's Playwright (1.62.1, devDependency) with its Chromium. Usage:
//   node lightline-access.mjs <evidence-dir> [film]
// where film is a workbench film id (rogue-render, the-only-one-that-fits, likeness-models; default
// rogue-render). Lightline part 2 added the film, the console record, and the `?` key and key feedback block.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
const BASE = `http://localhost:${process.env.PORT ?? 5180}/preview.html`;
const FILM = process.argv[3] ?? "rogue-render";
const report = { at: new Date().toString(), film: FILM, shots: [], keyboard: null, motion: null, keys: null, console: [] };

// The workbench plays the film from Mux (playback ID CHf85FN1...), which headless Edge plays as served, so
// the check no longer routes the old media host's mp4 to the local render (that host refuses headless
// browsers; Mux does not).
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(`timed out: ${what}`)), ms))]);

async function openAt(browser, width, media = {}) {
  const ctx = await browser.newContext({ viewport: { width: width + 48, height: Math.round(width * 0.5625) + 120 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  // Console errors and failed requests, by URL; the workbench has no favicon, so that 404 is left out.
  page.on("console", (m) => m.type() === "error" && !/favicon/.test(m.location()?.url ?? "") && report.console.push(`${width}: ${m.text()} ${m.location()?.url ?? ""}`));
  page.on("pageerror", (e) => report.console.push(`${width}: page error ${e}`));
  page.on("response", (r) => r.status() >= 400 && !r.url().endsWith("/favicon.ico") && report.console.push(`${width}: ${r.status()} ${r.url()}`));
  if (Object.keys(media).length) await page.emulateMedia(media);
  await page.goto(`${BASE}#film=${FILM}&width=${width}&ratio=16:9&scheme=dark`, { waitUntil: "load" });
  await page.waitForSelector("video");
  await withTimeout(page.evaluate(async () => {
    const v = document.querySelector("video");
    v.muted = true;
    await new Promise((r) => (v.readyState >= 1 ? r() : v.addEventListener("loadedmetadata", r, { once: true })));
    v.currentTime = Math.min(20.5, v.duration - 1);
    await v.play().catch(() => {});
    await new Promise((r) => setTimeout(r, 400));
    v.pause();
  }), 20000, `the film loading at ${width}px`);
  await page.waitForTimeout(700);
  const box = await page.locator(".media-skin").boundingBox();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.4);
  await page.waitForTimeout(400);
  return { ctx, page };
}

async function shot(browser, name, width, media) {
  const { ctx, page } = await openAt(browser, width, media);
  const file = path.join(OUT, `lightline-access-${name}.png`);
  await page.locator(".media-skin").screenshot({ path: file });
  const facts = await page.evaluate(() => {
    const pane = document.querySelector(".video-controls-bottom");
    const cs = getComputedStyle(pane);
    return { paneBackground: cs.backgroundImage !== "none" ? "gradient" : cs.backgroundColor, paneBlur: cs.backdropFilter, overflowX: document.documentElement.scrollWidth > innerWidth };
  });
  report.shots.push({ name, width, media, file: path.basename(file), ...facts });
  await ctx.close();
}

const browser = await chromium.launch({ channel: "msedge" }).catch(() => chromium.launch());
try {
  await shot(browser, "320", 320, {});
  await shot(browser, "forced-colors-896", 896, { forcedColors: "active" });
  await shot(browser, "more-contrast-896", 896, { contrast: "more" });

  // Reduced motion: the transition durations the skin's tokens resolve to.
  for (const reducedMotion of ["no-preference", "reduce"]) {
    const { ctx, page } = await openAt(browser, 896, { reducedMotion });
    const d = await page.evaluate(() => {
      const pick = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e).transitionDuration : null; };
      return { pane: pick(".video-controls-bottom"), track: pick(".media-time-slider-track"), pill: pick(".lightline-state-pill") };
    });
    report.motion = { ...(report.motion ?? {}), [reducedMotion]: d };
    await ctx.close();
  }

  // Keyboard alone: Tab through every stop, then open the settings menu with Enter and leave with Escape.
  {
    const { ctx, page } = await openAt(browser, 896, {});
    await page.mouse.move(0, 0);
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    const stops = [];
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Tab");
      const s = await page.evaluate(() => {
        const e = document.activeElement;
        if (!e || e === document.body) return null;
        const ring = getComputedStyle(e);
        return { label: e.getAttribute("aria-label") || e.getAttribute("role") || e.textContent.trim().slice(0, 30), outline: `${ring.outlineStyle} ${ring.outlineWidth} ${ring.outlineColor}` };
      });
      if (!s) break;
      stops.push(s);
      if (s.label === "Settings") break;
    }
    const settingsFocused = stops.at(-1)?.label === "Settings";
    let menu = null;
    if (settingsFocused) {
      await page.keyboard.press("Enter");
      await page.waitForTimeout(400);
      const state = () => page.evaluate(() => {
        const p = document.querySelector(".media-menu-popup");
        const cs = p ? getComputedStyle(p) : null;
        const e = document.activeElement;
        return {
          popup: p ? { open: p.hasAttribute("data-open"), display: cs.display, visibility: cs.visibility, opacity: cs.opacity, popoverOpen: (() => { try { return p.matches(":popover-open"); } catch { return null; } })() } : null,
          focus: e ? (e.getAttribute("aria-label") || e.textContent.trim().slice(0, 30) || e.tagName) : null,
        };
      });
      const opened = await state();
      await page.locator(".media-skin").screenshot({ path: path.join(OUT, "lightline-access-settings-menu-896.png") });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
      menu = { opened, afterEscape: await state() };
    }
    // Space plays from the player, with focus on the play button.
    await page.locator(".media-skin .media-play-button").last().focus();
    await page.keyboard.press("Space");
    await page.waitForTimeout(600);
    const playing = await page.evaluate(() => !document.querySelector("video").paused);
    report.keyboard = { stops, menu, spacePlays: playing };
    await ctx.close();
  }

  // Part 2: `?` opens the shortcut panel by keyboard alone and Escape twice gives focus back to the gear; K
  // answers with the key-feedback pill, which keeps a visible edge under forced colors.
  {
    const keys = {};
    for (const media of [{}, { forcedColors: "active" }]) {
      const { ctx, page } = await openAt(browser, 896, media);
      const tag = media.forcedColors ? "forced-colors" : "default";
      await page.evaluate(() => document.querySelector(".media-skin").focus());
      await page.keyboard.press("k");
      await page.waitForTimeout(100);
      const pill = await page.evaluate(() => { const e = document.querySelector(".media-indicator"); if (!e) return null; const cs = getComputedStyle(e); return { status: e.dataset.status ?? null, text: e.textContent.trim(), color: cs.color, border: `${cs.borderStyle} ${cs.borderWidth} ${cs.borderColor}`, outline: `${cs.outlineStyle} ${cs.outlineWidth}`, ariaHiddenGroup: e.closest("[aria-hidden]")?.getAttribute("aria-hidden") ?? null }; });
      await page.locator(".media-skin").screenshot({ path: path.join(OUT, `lightline-access-key-feedback-${tag}-896.png`) });
      await page.keyboard.press("k");
      await page.waitForTimeout(900);
      await page.evaluate(() => document.querySelector(".media-skin").focus());
      await page.keyboard.press("Shift+Slash");
      await page.waitForTimeout(500);
      const opened = await page.evaluate(() => { const panel = [...document.querySelectorAll(".lightline-shortcuts")].find((e) => e.getBoundingClientRect().height > 0); return { panel: !!panel, rows: panel ? panel.querySelectorAll(".lightline-menu-row").length : 0, focusInPanel: !!document.activeElement?.closest(".lightline-shortcuts") }; });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
      const back = await page.evaluate(() => ({ focus: document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent?.trim().slice(0, 30) || null, open: !!document.querySelector(".media-menu-popup[data-open]") }));
      keys[tag] = { pill, question: { opened, afterTwoEscapes: back } };
      await ctx.close();
    }
    report.keys = keys;
  }
} finally {
  await browser.close();
}
fs.writeFileSync(path.join(OUT, "lightline-access.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
