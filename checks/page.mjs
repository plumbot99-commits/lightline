// Lightline, the presentation page (design/page.md). At a width: no horizontal overflow, no console error or failed
// request; the whole page by Tab (the player, the drawer's button, the chapter pills, the library cards), with the
// order on screen; the drawer by keyboard (Enter opens it with focus inside, Escape closes it and gives focus back);
// Up Next at a film's end (said once, both buttons by Tab, Cancel holds the ended film, the count plays the next);
// a pick from the drawer in fullscreen keeps fullscreen; then forced colors and reduced motion (the count a number,
// a card's preview a still). --suite runs it all in the Suite; --lang=<tag> sets the page's lang after load, so the
// player's words change (the card and the drawer are measured for words outside their boxes).
// Usage: PORT=5188 node checks/page.mjs <evidence-dir> <width> [--forced] [--reduced] [--suite] [--lang=<tag>]
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const [OUT, W = "1440", ...flags] = process.argv.slice(2);
const width = Number(W);
const forced = flags.includes("--forced");
const reduced = flags.includes("--reduced");
const suite = flags.includes("--suite");
const lang = flags.find((f) => f.startsWith("--lang="))?.slice(7);
const tag = `${W}${forced ? "-forced" : ""}${reduced ? "-reduced" : ""}${suite ? "-suite" : ""}${lang ? `-${lang}` : ""}`;
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({
  viewport: { width, height: width >= 1000 ? 900 : 760 },
  forcedColors: forced ? "active" : "none",
  reducedMotion: reduced ? "reduce" : "no-preference",
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
// BASE serves the page from a subpath, as it is published (frederickdesign.studio/lightline/).
await page.goto(`http://localhost:${process.env.PORT ?? 5188}${process.env.BASE ?? "/"}`);
await page.waitForFunction(() => document.querySelector("video")?.readyState >= 1);
await page.waitForTimeout(1500);
if (lang) await page.evaluate((t) => (document.documentElement.lang = t), lang);
if (suite) await page.locator(".lightline-layout-switch button").last().click();
await page.waitForTimeout(lang || suite ? 1200 : 0);
const report = { width, forced, reduced, suite, lang };
// Words or buttons standing out of a box (the card, the drawer).
const outside = (selector) =>
  page.evaluate((sel) => {
    const box = document.querySelector(sel);
    if (!box) return null;
    const b = box.getBoundingClientRect();
    return [...box.querySelectorAll("button, span, h3")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width && (r.left < b.left - 0.5 || r.right > b.right + 0.5 || el.scrollWidth > el.clientWidth + 1);
      })
      .map((el) => el.textContent.trim().slice(0, 30));
  }, selector);
const shot = (name, full = false) => page.screenshot({ path: path.join(OUT, `${tag}-${name}.png`), fullPage: full });

// Opening: sound on, no autoplay, no overflow.
report.open = await page.evaluate(() => {
  const v = document.querySelector("video");
  return { paused: v.paused, muted: v.muted, volume: v.volume, overflow: document.documentElement.scrollWidth - innerWidth };
});
await shot("page", true);

// The whole page by Tab, from the top.
const describe = () =>
  page.evaluate(() => {
    const el = document.activeElement;
    const r = el.getBoundingClientRect();
    const name = (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
    const outline = getComputedStyle(el).outlineStyle !== "none" || el.matches(":has(:focus-visible)");
    const queue = el.classList.contains("lightline-queue-button");
    return { name, cls: String(el.className).split(" ")[0], queue, top: Math.round(r.top + scrollY), left: Math.round(r.left), outline };
  });
await page.evaluate(() => document.activeElement?.blur());
const stops = [];
for (let i = 0; i < 90; i++) {
  await page.keyboard.press("Tab");
  if (await page.evaluate(() => document.activeElement === document.body)) break;
  const d = await describe();
  if (stops.length && d.name === stops[0].name && d.top === stops[0].top) break;
  stops.push(d);
}
// Tab past the last stop leaves the document; a click on the page's margin brings it back (fullscreen needs it).
await page.bringToFront();
await page.mouse.click(4, 4);
report.tab = {
  count: stops.length,
  queueButton: stops.some((s) => s.queue),
  chapterPills: stops.filter((s) => s.cls === "page-pill").length,
  cards: stops.filter((s) => s.cls === "page-card").length,
  play: lang ? true : stops.some((s) => /^Play$/i.test(s.name)),
  noOutline: stops.filter((s) => !s.outline).map((s) => s.name),
  order: stops.map((s) => `${s.name} @${s.top}`),
};

// The drawer by keyboard.
await page.locator(".lightline-queue-button").focus();
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
const inside = await page.evaluate(() => !!document.activeElement.closest(".lightline-queue-drawer"));
const drawerItems = await page.locator(".lightline-queue-drawer button").count();
const drawerOutside = await outside(".lightline-queue-drawer");
const drawerInPicture = await page.evaluate(() => {
  const d = document.querySelector(".lightline-queue-drawer").getBoundingClientRect();
  const pic = (document.querySelector(".lightline-suite-picture") ?? document.querySelector(".media-skin")).getBoundingClientRect();
  return d.left >= pic.left - 0.5 && d.right <= pic.right + 0.5 && d.top >= pic.top - 0.5 && d.bottom <= pic.bottom + 0.5;
});
await shot("drawer");
await page.keyboard.press("Tab");
const tabbedInside = await page.evaluate(() => !!document.activeElement.closest(".lightline-queue-drawer"));
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
report.drawer = {
  focusInside: inside,
  items: drawerItems,
  outside: drawerOutside,
  inPicture: drawerInPicture,
  tabbedInside,
  closed: (await page.locator(".lightline-queue-drawer").count()) === 0,
  focusBack: await page.evaluate(() => document.activeElement.classList.contains("lightline-queue-button")),
};

// A pick from the drawer in fullscreen keeps fullscreen.
// The controls step back while the film plays: a move over the player brings them up.
const wake = async () => {
  await page.locator(".media-skin").hover({ position: { x: 40, y: 40 } });
  await page.mouse.move(60, 60, { steps: 2 });
  await page.locator(".media-skin").hover({ position: { x: 80, y: 60 } });
};
await wake();
await page.locator(".media-fullscreen-button").focus();
await page.keyboard.press("Enter");
await page.waitForTimeout(800);
await page.locator(".lightline-queue-button").focus();
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
await shot("fullscreen-drawer");
await page.locator(".lightline-queue-film").first().focus();
await page.keyboard.press("Enter");
await page.waitForTimeout(2500);
report.fullscreen = await page.evaluate(() => ({
  fullscreen: !!document.fullscreenElement,
  title: document.querySelector(".page-info-title").textContent,
  playing: !document.querySelector("video").paused,
}));
await page.evaluate(() => document.fullscreenElement && document.exitFullscreen()).catch(() => {});
await page.waitForTimeout(500);

// A chapter pill seeks the player.
const pills = page.locator(".page-chapter");
if (await pills.count()) {
  const third = pills.nth(2);
  await third.click();
  await page.waitForTimeout(600);
  report.chapterSeek = await page.evaluate(() => ({
    time: Math.round(document.querySelector("video").currentTime * 10) / 10,
    current: document.querySelector('.page-chapter[aria-current="true"]')?.textContent,
  }));
}

// Up Next: to the last seconds, play, and watch the card.
const said = () => page.evaluate(() => [...document.querySelectorAll('[aria-live], [role="status"]')].map((n) => n.textContent).join(" | "));
const toEnd = async () => {
  await page.evaluate(() => {
    const v = document.querySelector("video");
    v.currentTime = v.duration - 8;
  });
  await page.evaluate(() => document.querySelector("video").play());
  await page.waitForSelector(".lightline-up-next", { state: "attached", timeout: 12000 }).catch(async (e) => {
    console.log(await page.evaluate(() => {
      const v = document.querySelector("video");
      return JSON.stringify({ t: v.currentTime, d: v.duration, paused: v.paused, ended: v.ended, title: document.querySelector(".page-info-title").textContent });
    }));
    throw e;
  });
};
await toEnd();
await page.waitForTimeout(400);
const card = await page.evaluate(() => {
  const c = document.querySelector(".lightline-up-next");
  const ring = c.querySelector(".lightline-up-next-ring");
  return {
    title: c.querySelector(".lightline-up-next-title")?.textContent,
    number: c.querySelector(".lightline-up-next-number")?.textContent,
    ringShown: getComputedStyle(ring).display !== "none",
    inPicture: (() => {
      const r = c.getBoundingClientRect();
      const s = (document.querySelector(".lightline-suite-picture") ?? document.querySelector(".media-skin")).getBoundingClientRect();
      return r.left >= s.left && r.right <= s.right && r.top >= s.top && r.bottom <= s.bottom;
    })(),
  };
});
await shot("up-next");
card.outside = await outside(".lightline-up-next");
const firstSaid = await said();
await page.locator(".lightline-up-next-play").focus();
await page.keyboard.press("Tab");
const tabToCancel = await page.evaluate(() => document.activeElement.classList.contains("lightline-up-next-cancel"));
await page.keyboard.press("Enter");
await page.waitForTimeout(6500);
report.upNext = {
  ...card,
  said: firstSaid,
  tabToCancel,
  cancelled: await page.evaluate(() => ({
    card: !!document.querySelector(".lightline-up-next"),
    ended: document.querySelector("video").ended,
    title: document.querySelector(".page-info-title").textContent,
    focus: document.activeElement.getAttribute("aria-label"),
  })),
};
// Again, and let the count run out: the next film plays.
await toEnd();
const before = await page.locator(".page-info-title").textContent();
await page.waitForFunction((t) => document.querySelector(".page-info-title").textContent !== t, before, { timeout: 15000 });
await page.waitForTimeout(2500);
report.upNext.advanced = await page.evaluate(() => ({
  title: document.querySelector(".page-info-title").textContent,
  playing: !document.querySelector("video").paused,
  time: Math.round(document.querySelector("video").currentTime),
  lit: document.querySelector('.page-card[aria-current="true"] .page-card-title')?.textContent,
}));

// A card's preview while hovered: animated, or a still under reduced motion.
const firstCard = page.locator(".page-card").first();
await firstCard.hover();
await page.waitForTimeout(300);
report.preview = await firstCard.locator("img").getAttribute("src");

report.errors = errors;
report.ok =
  report.open.paused && !report.open.muted && report.open.overflow <= 0 &&
  report.tab.queueButton && report.tab.cards === 4 && report.tab.play && !report.tab.noOutline.length &&
  report.drawer.focusInside && report.drawer.closed && report.drawer.focusBack &&
  !report.drawer.outside.length && report.drawer.inPicture && !card.outside.length &&
  card.inPicture && card.ringShown === !reduced && (lang ? firstSaid.includes(card.title) : /Up next/.test(firstSaid)) && tabToCancel &&
  !report.upNext.cancelled.card && report.upNext.cancelled.ended && report.upNext.advanced.playing &&
  report.fullscreen.fullscreen &&
  /animated/.test(report.preview) === !reduced &&
  !errors.length;
fs.writeFileSync(path.join(OUT, `${tag}.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, tab: { ...report.tab, order: report.tab.order.length } }));
console.log("ok", report.ok);
await browser.close();
