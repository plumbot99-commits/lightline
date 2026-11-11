// Lightline, slice settings: the settings menu's chapters, quality, captions style, keyboard-shortcut panel
// and theater mode, each reached, used and left by keyboard alone, in a real browser at 1440, 390 and 320 px.
// Plays the film from Mux through the workbench on port 5180. Usage:
//   node checks/lightline-settings.mjs <evidence-dir> [width ...]
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const OUT = process.argv[2];
const WIDTHS = process.argv.slice(3).map(Number);
fs.mkdirSync(OUT, { recursive: true });
const VIEW = { 1440: { width: 1440, height: 900, player: 1200 }, 390: { width: 390, height: 844 }, 320: { width: 320, height: 640 } };
const report = { at: new Date().toString(), runs: [] };

// What has keyboard focus or the menu's highlight, by accessible name.
const current = (page) => page.evaluate(() => {
  const el = document.querySelector(".media-menu-popup [data-highlighted]") || document.activeElement;
  return {
    role: el?.getAttribute("role") || el?.tagName.toLowerCase(),
    name: (el?.getAttribute("aria-label") || el?.textContent || "").replace(/\s+/g, " ").trim(),
    checked: el?.getAttribute("aria-checked"),
  };
});
// The rows of the menu page now showing.
const rows = (page) => page.evaluate(() => {
  const pages = [...document.querySelectorAll(".media-menu-popup .media-menu-content")].filter((c) => {
    const r = c.getBoundingClientRect();
    return r.width > 0 && getComputedStyle(c).visibility !== "hidden" && !c.hasAttribute("data-child-open") && !c.closest("[inert]");
  });
  const page = pages.at(-1);
  return page ? [...page.querySelectorAll("[role^=menuitem]")].filter((i) => i.closest(".media-menu-content") === page).map((i) => ({
    role: i.getAttribute("role"),
    name: (i.getAttribute("aria-label") || i.textContent || "").replace(/\s+/g, " ").trim(),
    checked: i.getAttribute("aria-checked"),
  })) : [];
});

async function moveTo(page, name, key = "ArrowDown") {
  for (let i = 0; i < 24; i++) {
    const c = await current(page);
    if (c.name.startsWith(name)) return c;
    await page.keyboard.press(key);
    await page.waitForTimeout(60);
  }
  throw new Error(`no menu row named ${name}`);
}

async function openSettings(page, log) {
  await page.locator(".media-skin").focus();
  for (let i = 1; i <= 30; i++) {
    await page.keyboard.press("Tab");
    const label = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent?.trim());
    if (/^settings$/i.test(label || "")) {
      log.tabsToSettings = i;
      await page.keyboard.press("Enter");
      await page.waitForTimeout(350);
      return;
    }
  }
  throw new Error("Tab never reached the settings button");
}

async function run(browser, w) {
  const v = VIEW[w];
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  const consoleErrors = [];
  page.on("console", (m) => m.type() === "error" && !m.location().url?.endsWith("/favicon.ico") && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  await page.goto(`http://localhost:${process.env.PORT ?? 5180}/preview.html#ratio=16:9&scheme=dark${v.player ? `&width=${v.player}` : ""}`, { waitUntil: "load" });
  await page.waitForSelector("video");
  await page.evaluate(async () => {
    const v = document.querySelector("video");
    v.muted = true;
    await new Promise((r) => (v.readyState >= 2 ? r() : v.addEventListener("loadeddata", r, { once: true })));
    v.currentTime = 9;
    await v.play();
    await new Promise((r) => setTimeout(r, 1500));
    v.pause();
  });
  const log = { width: w, steps: [] };
  const step = async (label, extra = {}) => {
    const file = `settings-${w}-${label}.png`;
    await page.screenshot({ path: path.join(OUT, file) });
    log.steps.push({ label, file, focus: await current(page), rows: await rows(page), ...extra });
  };
  const skin = (attr) => page.evaluate((a) => document.querySelector(".media-skin").getAttribute(a), attr);
  const time = () => page.evaluate(() => Math.round(document.querySelector("video").currentTime * 10) / 10);

  try {
    await openSettings(page, log);
    await step("menu");

    // Chapters: in, pick The gate drops, which seeks to 0:21.5 and closes the menu.
    await moveTo(page, "Chapters");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(300);
    await step("chapters");
    await moveTo(page, "The gate drops");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
    log.steps.push({ label: "chapter picked", time: await time(), menuOpen: await page.evaluate(() => document.querySelector(".media-menu-popup")?.matches(":popover-open") ?? false) });

    // Quality: the Mux renditions, then Escape back to the root page.
    await openSettings(page, log);
    await moveTo(page, "Quality");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(300);
    await step("quality");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    log.steps.push({ label: "escape from quality", focus: await current(page) });

    // Captions on (English), so the style shows.
    await moveTo(page, "Captions");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(250);
    await moveTo(page, "English");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);

    // Captions style: size 200 %, then background solid.
    await openSettings(page, log);
    await moveTo(page, "Captions style");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(300);
    await step("captions-style");
    await moveTo(page, "200%");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(250);
    await openSettings(page, log);
    await moveTo(page, "Captions style");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(250);
    await moveTo(page, "Solid");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(250);
    await page.evaluate(async () => {
      const v = document.querySelector("video");
      v.currentTime = 22.8;
      await new Promise((r) => v.addEventListener("seeked", r, { once: true }));
    });
    await page.waitForTimeout(500);
    await step("captions-200-solid", { size: await skin("data-captions-size"), background: await skin("data-captions-background") });

    // Theater mode on, seen, then off again.
    await openSettings(page, log);
    await moveTo(page, "Theater mode");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(900);
    await step("theater-on", { theater: await skin("data-theater") });
    await openSettings(page, log);
    await moveTo(page, "Theater mode");
    log.steps.push({ label: "theater row when on", focus: await current(page) });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    log.steps.push({ label: "theater off", theater: await skin("data-theater") });

    // The shortcut panel: in, read, Escape back, Escape out; focus returns to the settings button.
    await openSettings(page, log);
    await moveTo(page, "Keyboard shortcuts");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(300);
    await step("shortcuts");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    const back = await current(page);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    log.steps.push({
      label: "escape twice",
      afterFirst: back,
      focusAfterSecond: await page.evaluate(() => document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent?.trim()),
      menuOpen: await page.evaluate(() => document.querySelector(".media-menu-popup")?.matches(":popover-open") ?? false),
    });
  } catch (e) {
    log.failed = e.message;
    await page.screenshot({ path: path.join(OUT, `settings-${w}-failed.png`) });
  }
  log.consoleErrors = consoleErrors;
  report.runs.push(log);
  await ctx.close();
}

const browser = await chromium.launch({ channel: "msedge" }).catch(() => chromium.launch());
try {
  for (const w of WIDTHS.length ? WIDTHS : [1440, 390, 320]) await run(browser, w);
} finally {
  await browser.close();
  fs.writeFileSync(path.join(OUT, "lightline-settings.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 1));
}
