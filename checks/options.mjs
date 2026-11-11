// Lightline, the Options button and its sheet (design/lightline-record.md, "Glass, closer to his picture"). On the
// page: the button sits in the top row between the state pill and the Cinema | Suite switch, named and with a visible
// focus ring; it opens an opaque sheet over the player whose controls are all labeled; Tab stays inside; Space in the
// sheet does not play the film; Escape and the close button shut it and give focus back to the button; Room and Glass
// show only in the Suite; the simulated network stalls and fails the film and recovers; it works in fullscreen; the
// page's tools row and its workbench link are gone. Usage: PORT=5192 node checks/options.mjs <evidence-dir> [width]
//   [--forced] [--reduced-motion] [--locale=<tag>]
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const [OUT = "options", WIDTH = "1440", ...flags] = process.argv.slice(2);
const width = Number(WIDTH);
const flag = (name) => flags.find((f) => f.startsWith(`--${name}=`))?.split("=")[1];
const forced = flags.includes("--forced");
const locale = flag("locale");
const tag = [width, forced && "forced", flags.includes("--reduced-motion") && "reduced-motion", locale].filter(Boolean).join("-");
fs.mkdirSync(OUT, { recursive: true });
const fails = [];
const ok = (cond, what) => (cond ? console.log("ok  ", what) : (fails.push(what), console.log("FAIL", what)));

const browser = await chromium.launch({ channel: "msedge" });
const context = await browser.newContext({
  viewport: { width, height: width >= 1100 ? 900 : 800 },
  forcedColors: forced ? "active" : "none",
  reducedMotion: flags.includes("--reduced-motion") ? "reduce" : "no-preference",
});
const page = await context.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(`${m.text()} at ${m.location().url}`));
page.on("pageerror", (e) => errors.push(String(e)));
await page.addInitScript((locale) => {
  localStorage.removeItem("lightline:suite");
  sessionStorage.removeItem("lightline-page:glass");
  if (locale) sessionStorage.setItem("lightline-page:locale", locale);
  else sessionStorage.removeItem("lightline-page:locale");
}, locale);
await page.goto(`http://localhost:${process.env.PORT ?? 5192}${process.env.BASE ?? "/"}`, { waitUntil: "load" });
await page.waitForSelector("video");
await page.locator(".media-skin").scrollIntoViewIfNeeded();

ok((await page.locator(".page-tools").count()) === 0, "page: the tools row above the player is gone");
ok((await page.locator('a[href="./workbench"]').count()) === 0, "page: the Try every option link is gone");

const skin = page.locator(".media-skin");
const button = skin.locator(".lightline-options-button");
const sheet = skin.locator(".lightline-options");
await skin.hover();
ok((await button.count()) === 1, "the Options button is in the player");
const name = await button.getAttribute("aria-label");
ok(!!name, `the button is named (${name})`);
// Source order and visual order in the top row: the pill, then Options, then the switch when it is offered.
const order = await page.evaluate(() => {
  const top = document.querySelector(".video-controls-top");
  const pill = top.querySelector(".lightline-state-pill, [class*='state-pill']");
  const options = top.querySelector(".lightline-options-button");
  const sw = top.querySelector(".lightline-layout-switch");
  const after = (a, b) => !!(a && b) && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  const x = (el) => el?.getBoundingClientRect().left;
  // The row's own flow, read from two controls that were there before: the top row keeps its left-to-right layout in
  // a right-to-left language (the fullscreen button stays at the far right), so the page's direction does not say it.
  const fullscreen = top.querySelector(".media-fullscreen-button");
  const flowsLeft = !!(sw && fullscreen) && x(sw) > x(fullscreen);
  const visual = (a, b) => (flowsLeft ? x(a) > x(b) : x(a) < x(b));
  const drawn = (el) => !!el && el.getBoundingClientRect().width > 0;
  return {
    pillFirst: after(pill, options) && (!drawn(pill) || visual(pill, options)),
    switchAfter: sw ? after(options, sw) && visual(options, sw) : null,
    inside: (() => { const r = options.getBoundingClientRect(); const s = document.querySelector(".media-skin").getBoundingClientRect(); return r.left >= s.left && r.right <= s.right + 0.5; })(),
  };
});
ok(order.pillFirst, "the button comes after the state pill, in source and on screen");
ok(order.switchAfter !== false, `the Cinema | Suite switch comes after it (${order.switchAfter === null ? "not offered at this width" : "yes"})`);
ok(order.inside, "the button is inside the player at this width");

// By keyboard: focus it, see the ring, open it.
await button.focus();
await page.keyboard.press("Shift+Tab");
await page.keyboard.press("Tab");
const ring = await button.evaluate((el) => { const s = getComputedStyle(el); return `${s.outlineStyle} ${s.outlineWidth} ${s.boxShadow}`; });
ok(!/^none 0px none$/.test(ring) && (/solid|auto/.test(ring) || /rgb/.test(ring)), `a visible focus ring on the button (${ring.slice(0, 60)})`);
await page.keyboard.press("Enter");
await sheet.waitFor();
const look = await sheet.evaluate((el) => {
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const p = el.closest(".media-skin").getBoundingClientRect();
  return { bg: s.backgroundColor, role: el.getAttribute("role"), modal: el.getAttribute("aria-modal"), label: document.getElementById(el.getAttribute("aria-labelledby"))?.textContent, covers: Math.abs(r.width - p.width) < 2 && Math.abs(r.height - p.height) < 2 };
});
ok(look.role === "dialog" && look.modal === "true" && !!look.label, `a modal dialog named ${look.label}`);
// Opaque in the skin's ground, which the page hands as black (apps/page/src/page.css); #060A0E is the skin's own.
ok(forced || /^rgb\(\d+, \d+, \d+\)$/.test(look.bg), `opaque (${look.bg})`);
ok(look.covers, "it covers the whole player");
const active = await page.evaluate(() => document.activeElement?.closest(".lightline-options") !== null);
ok(active, "focus moves into the sheet");
const fields = await sheet.evaluate((el) => [...el.querySelectorAll("select, input")].map((c) => ({ label: c.labels?.[0]?.textContent ?? "", type: c.type })));
ok(fields.length >= 4 && fields.every((f) => f.label), `every control labeled: ${fields.map((f) => f.label).join(", ")}`);
const labels = fields.map((f) => f.label);
await page.screenshot({ path: path.join(OUT, `${tag}-cinema-open.png`) });

// Tab stays inside, both ways.
let escaped = false;
for (let i = 0; i < fields.length + 3; i++) {
  await page.keyboard.press("Tab");
  if (!(await page.evaluate(() => !!document.activeElement?.closest(".lightline-options")))) escaped = true;
}
for (let i = 0; i < 3; i++) {
  await page.keyboard.press("Shift+Tab");
  if (!(await page.evaluate(() => !!document.activeElement?.closest(".lightline-options")))) escaped = true;
}
ok(!escaped, "Tab and Shift+Tab stay inside the sheet");

// The player's keys do not act from inside: Space on the close button closes it (a button's own action) but must not play.
const pausedBefore = await page.evaluate(() => document.querySelector("video").paused);
await sheet.locator("select").first().focus();
await page.keyboard.press("k");
await page.waitForTimeout(300);
ok((await page.evaluate(() => document.querySelector("video").paused)) === pausedBefore, "K inside the sheet does not play or pause the film");

// Escape closes, focus back on the button.
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
ok((await sheet.count()) === 0, "Escape closes it");
ok(await button.evaluate((el) => el === document.activeElement), "focus is back on the Options button");

// The close button too.
await page.keyboard.press("Enter");
await sheet.waitFor();
await sheet.locator(".lightline-options-close").click();
ok((await sheet.count()) === 0, "the close button closes it");
ok(await button.evaluate((el) => el === document.activeElement), "focus is back on the Options button after the close button");

// Room and Glass: only in the Suite.
ok(!labels.some((l) => /room|glass/i.test(l)) || width < 1100, "no Room or Glass in Cinema");
if (width >= 1100) {
  await page.locator(".lightline-layout-option").nth(1).click().catch(() => {});
  await page.waitForFunction(() => document.querySelector(".media-skin")?.dataset.layout === "suite");
  await button.click();
  await sheet.waitFor();
  const suiteLabels = await sheet.evaluate((el) => [...el.querySelectorAll("label")].map((l) => l.textContent));
  ok(suiteLabels.some((l) => /glass/i.test(l)), `Glass in the Suite (${suiteLabels.join(", ")})`);
  const glass = sheet.getByRole("slider", { name: /glass/i });
  await glass.focus();
  await page.keyboard.press("End");
  const tint = await page.evaluate(() => getComputedStyle(document.querySelector(".lightline-panel:not([data-floating])")).backgroundImage.match(/rgba\(8, 16, 20, ([\d.]+)\)/)?.[1]);
  ok(forced || tint === "0.3", `the Glass slider reaches the panes (tint ${tint})`);
  await page.screenshot({ path: path.join(OUT, `${tag}-suite-open.png`) });
  // Fullscreen: the sheet over the whole screen.
  await page.keyboard.press("Escape");
  await page.evaluate(() => document.querySelector(".media-skin").requestFullscreen());
  await page.waitForTimeout(800);
  await button.click();
  await sheet.waitFor();
  const fs = await sheet.evaluate((el) => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), full: !!document.fullscreenElement }; });
  ok(fs.full && fs.w === width && fs.h >= 800, `in fullscreen it covers the screen (${fs.w} by ${fs.h})`);
  await page.screenshot({ path: path.join(OUT, `${tag}-fullscreen-open.png`) });
  await page.keyboard.press("Escape");
  ok((await sheet.count()) === 0 && !!(await page.evaluate(() => document.fullscreenElement)), "Escape closes the sheet and stays in fullscreen");
  await page.evaluate(() => document.exitFullscreen());
  await page.waitForTimeout(500);
  await page.locator(".lightline-layout-option").nth(0).click().catch(() => {});
}

// The simulated network: stalled says Loading, network error shows the error, normal recovers.
const pill = async () => page.evaluate(() => document.querySelector(".media-skin")?.querySelector("[class*='state-pill']")?.textContent?.trim());
const pickNet = async (value) => {
  // The controls hide while the film plays; a viewer's pointer over the player brings them back.
  // The error dialog holds the player until its OK is pressed, as a viewer would, before Options is in reach again.
  const dismiss = skin.locator(".media-dialog-popup button").first();
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
  await skin.hover({ position: { x: 40, y: 40 } });
  await button.click();
  await sheet.waitFor();
  await sheet.locator("select").filter({ has: page.locator('option[value="stall"]') }).selectOption(value);
  await page.keyboard.press("Escape");
};
await page.evaluate(async () => { const v = document.querySelector("video"); v.muted = true; await v.play().catch(() => {}); });
await page.waitForTimeout(2500);
await pickNet("stall");
await page.waitForTimeout(6000);
const stalled = { pill: await pill(), waiting: await page.evaluate(() => document.querySelector("video").readyState < 3) };
ok(stalled.waiting, `stalled: the film runs dry (pill ${stalled.pill})`);
await page.screenshot({ path: path.join(OUT, `${tag}-stalled.png`) });
await pickNet("error");
await page.waitForTimeout(5000);
const failed = await page.evaluate(() => !!document.querySelector(".media-skin [role='alertdialog'], .media-skin .media-error-dialog, .media-skin [data-error], .media-skin [class*='error-dialog']") || document.querySelector(".media-skin")?.textContent.includes("Error"));
ok(failed, "network error: the player shows its error");
await page.screenshot({ path: path.join(OUT, `${tag}-error.png`) });
await pickNet("normal");
await page.waitForTimeout(6000);
const recovered = await page.evaluate(() => document.querySelector("video").readyState >= 2);
ok(recovered, "normal: the film loads again");

// The simulator's own failures (refused stream requests) are the point of the error state, not faults of the page.
const real = errors.filter((e) => !/favicon|127\.0\.0\.1:9|ERR_CONNECTION_REFUSED|ERR_FAILED|Failed to fetch|mux\.com/.test(e));
ok(real.length === 0, `no console error outside the simulated failures (${real.slice(0, 3).join(" | ")})`);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
ok(!overflow, "no sideways overflow");
fs.writeFileSync(path.join(OUT, `${tag}.txt`), `${fails.length ? "FAIL" : "PASS"}\n${fails.join("\n")}\n`);
console.log(fails.length ? "FAIL" : "PASS");
await browser.close();
process.exit(fails.length ? 1 : 0);
