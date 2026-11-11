// Lightline part 5: the skin's words in the viewer's language. For each locale, by one route (page: the page's
// `lang`, set after load on a page without one; browser: Playwright's `locale`, the page without a `lang`; option:
// the workbench's `locale`), at a width: 1440 opens the Suite and Settings, 320 opens Settings, its shortcuts and the
// lab. It lists any English string the locale's pack translates that still shows (text or aria-label), and any label
// clipped in its box or standing out of its panel or menu. Packs are read from the dev server, as the skin reads them.
// Usage: PORT=5181 node checks/languages.mjs <evidence-dir> <route> <width> <tag...>
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const [OUT, ROUTE = "option", W = "1440", ...TAGS] = process.argv.slice(2);
const width = Number(W);
fs.mkdirSync(OUT, { recursive: true });
const BASE = `http://localhost:${process.env.PORT ?? 5180}/preview.html`;
// The workbench is the dev server's root; the skin's files are reached through Vite's /@fs/.
const SRC = `/@fs/${path.resolve("src").split(path.sep).join("/")}`;
const browser = await chromium.launch({ channel: "msedge" });
const results = [];

for (const tag of TAGS.length ? TAGS : ["en", "de", "ja", "ar", "pt-BR"]) {
  const context = await browser.newContext({
    viewport: { width, height: width >= 1000 ? 900 : 640 },
    ...(ROUTE === "browser" ? { locale: tag } : {}),
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}#film=the-only-one-that-fits&width=1360&locale=${ROUTE === "option" ? tag : "auto"}`);
  await page.addStyleTag({ content: `.preview-player { max-width: none !important; }` });
  await page.waitForFunction(() => document.querySelector("video")?.readyState >= 1);
  if (ROUTE === "page")
    await page.evaluate((t) => {
      document.documentElement.lang = t;
      if (/^(ar|he|fa)/.test(t)) document.documentElement.dir = "rtl";
    }, tag);
  await page.waitForTimeout(1500);

  const opened = [];
  const click = async (locator, name) => {
    if (await locator.count()) {
      await locator.first().click();
      await page.waitForTimeout(500);
      opened.push(name);
    }
  };
  if (width >= 1100) await click(page.locator(".lightline-layout-switch button").last(), "suite");
  await click(page.locator('.video-controls-row button[aria-haspopup="menu"]').last(), "settings");

  const scan = () =>
    page.evaluate(async ({ tag, SRC }) => {
      const flat = (o, p = "", out = {}) => {
        for (const [k, v] of Object.entries(o)) typeof v === "string" ? (out[p + k] = v) : flat(v, `${p}${k}.`, out);
        return out;
      };
      const en = flat((await import(`${SRC}/i18n/en.ts`)).en);
      const pack = tag === "en" ? en : flat((await import(`${SRC}/i18n/locales/${tag}.ts`)).default);
      // English words this pack changes, whole strings only (templates are checked through their filled forms below).
      const english = new Set(Object.keys(en).filter((k) => !en[k].includes("{") && pack[k] !== en[k]).map((k) => en[k]));
      const root = document.querySelector(".media-container");
      const seen = [...root.querySelectorAll("*"), ...document.querySelectorAll(".media-popup, [popover]")];
      const left = new Set();
      const clipped = [];
      for (const el of seen) {
        const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").trim();
        const box = el.getBoundingClientRect();
        // Skipped: what is not drawn, a screen reader's 1 px copy, and a key cap (a letter is the key, not a word).
        if (box.width <= 1 || getComputedStyle(el).visibility === "hidden" || el.closest("kbd")) continue;
        for (const text of [own, el.getAttribute("aria-label") ?? ""]) if (english.has(text)) left.add(text);
        if (!own) continue;
        if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== "visible")
          clipped.push({ text: own, why: "clipped", w: el.clientWidth, need: el.scrollWidth });
        const frame = el.closest(".lightline-panel, .media-menu-content, .lightline-lab, .lightline-layout-switch");
        if (frame) {
          const f = frame.getBoundingClientRect();
          if (box.right > f.right + 1 || box.left < f.left - 1)
            clipped.push({ text: own, why: "out of its panel", by: Math.round(Math.max(box.right - f.right, f.left - box.left)) });
        }
      }
      return {
        lang: document.documentElement.lang,
        dir: root.dir || getComputedStyle(root).direction,
        switch: [...document.querySelectorAll(".lightline-layout-switch button")].map((b) => b.textContent),
        untranslated: [...left],
        clipped,
      };
    }, { tag, SRC });

  const first = await scan();
  await page.screenshot({ path: path.join(OUT, `${tag}-${ROUTE}-${W}-${opened.join("-") || "player"}.png`) });
  const report = { tag, route: ROUTE, width, opened, ...first };
  // The shortcuts panel (Settings' last row), then, narrow, the lab from its row in Settings (found by its title).
  const row = page.locator(".media-menu-popup .media-menu-item").last();
  if (await row.count()) {
    await row.click();
    await page.waitForTimeout(500);
    const inner = await scan();
    report.shortcuts = { untranslated: inner.untranslated, clipped: inner.clipped };
    await page.screenshot({ path: path.join(OUT, `${tag}-${ROUTE}-${W}-shortcuts.png`) });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }
  if (width < 1100) {
    await page.evaluate(async ({ tag, SRC }) => {
      const pack = tag === "en" ? (await import(`${SRC}/i18n/en.ts`)).en : (await import(`${SRC}/i18n/locales/${tag}.ts`)).default;
      const rows = [...document.querySelectorAll(".media-menu-popup .media-menu-item")];
      rows.find((r) => r.textContent.startsWith(pack.lab.title))?.click();
    }, { tag, SRC });
    await page.waitForTimeout(800);
    const lab = page.locator('.lightline-lab[role="dialog"]');
    if (await lab.count()) {
      const inLab = await scan();
      report.lab = { shown: await lab.first().isVisible(), untranslated: inLab.untranslated, clipped: inLab.clipped };
      await page.screenshot({ path: path.join(OUT, `${tag}-${ROUTE}-${W}-lab.png`) });
    }
  }
  report.errors = errors;
  results.push(report);
  console.log(JSON.stringify(report));
  await context.close();
}

fs.writeFileSync(path.join(OUT, `${ROUTE}-${W}.json`), JSON.stringify(results, null, 2));
await browser.close();
