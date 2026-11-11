// Lightline part 4: the Suite by keyboard. At 1440 on the workbench's frame page (its cap lifted): every Tab stop in
// the room with its name, its focus outline and its place on screen, so the source order can be read against the
// visual one; the player's hotkeys kept out of the panels (an arrow on the speed radios, the timeline's arrow);
// a tap on a panel's body; the grip menu's Escape and Tab. Usage: PORT=5181 node checks/suite-access.mjs <dir> [film]
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const [OUT, FILM = "rogue-render"] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && !/favicon/.test(m.location()?.url ?? "") && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`http://localhost:${process.env.PORT ?? 5180}/preview.html#film=${FILM}&width=1360`, { waitUntil: "load" });
await page.addStyleTag({ content: `.preview-player { max-width: none !important; }` });
await page.waitForSelector(".lightline-layout-option");
await page.locator(".lightline-layout-option", { hasText: "Suite" }).click();
await page.waitForTimeout(600);
const report = { film: FILM };

// Every stop from the room's first focusable thing, with where it sits.
await page.locator(".media-skin").focus();
const stops = [];
for (let i = 0; i < 80; i++) {
  await page.keyboard.press("Tab");
  const s = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || !el.closest(".media-skin")) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const chip = el.closest(".lightline-lab-chip, .lightline-timeline");
    const ring = chip ? getComputedStyle(chip) : cs;
    return {
      name: el.getAttribute("aria-label") || el.closest("label")?.textContent?.trim() || el.textContent.trim().slice(0, 30) || el.tagName,
      where: el.closest("[data-rail]")?.dataset.rail ?? (el.closest(".video-controls-top") ? "top row" : el.closest(".video-controls-bottom") ? "bar" : "room"),
      x: Math.round(r.x),
      y: Math.round(r.y),
      outline: `${ring.outlineStyle} ${ring.outlineWidth} ${ring.outlineColor}`,
    };
  });
  if (!s) break;
  stops.push(s);
}
report.stops = stops;
const groups = [];
for (const s of stops) if (groups.at(-1) !== s.where) groups.push(s.where);
report.order = groups;
report.unlit = stops.filter((s) => !/solid 2px/.test(s.outline)).map((s) => `${s.where}:${s.name}:${s.outline}`);

// The hotkeys stay out: an arrow on the speed radios moves the speed, not the film or the volume.
const before = await page.evaluate(() => ({ t: document.querySelector("video").currentTime, v: document.querySelector("video").volume }));
await page.locator(".lightline-deck input[type=radio]:checked").focus();
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(200);
report.speedArrow = await page.evaluate((b) => {
  const v = document.querySelector("video");
  return { rate: v.playbackRate, seeked: Math.abs(v.currentTime - b.t) > 1, volumeMoved: v.volume !== b.v, said: document.querySelector(".media-status-announcer").textContent };
}, before);
await page.keyboard.press("ArrowLeft");

// The timeline seeks a second a key, not the player's ten.
await page.evaluate(() => (document.querySelector("video").currentTime = 20));
await page.waitForTimeout(400);
await page.locator(".lightline-timeline-input").focus();
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(400);
report.timelineArrow = await page.evaluate(() => ({ time: Math.round(document.querySelector("video").currentTime * 10) / 10, valuetext: document.querySelector(".lightline-timeline-input").getAttribute("aria-valuetext") }));

// A tap on a panel's body neither plays nor pauses.
const paused = await page.evaluate(() => document.querySelector("video").paused);
const body = await page.locator(".lightline-panel-telemetry .lightline-telemetry").boundingBox();
await page.mouse.click(body.x + body.width - 10, body.y + 10);
await page.waitForTimeout(400);
report.tapOnPanel = { pausedBefore: paused, pausedAfter: await page.evaluate(() => document.querySelector("video").paused) };

// The grip menu: Escape gives the grip its focus back; Tab leaves the menu closed.
const grip = page.locator(".lightline-panel-telemetry .lightline-panel-grip");
await grip.focus();
await page.keyboard.press("Enter");
await page.waitForTimeout(200);
const opened = await page.evaluate(() => ({ focus: document.activeElement.textContent, role: document.activeElement.getAttribute("role"), items: document.activeElement.parentElement.querySelectorAll("[role^=menuitem]").length }));
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
const escaped = await page.evaluate(() => ({ focus: document.activeElement.getAttribute("aria-label"), expanded: document.activeElement.getAttribute("aria-expanded") }));
await page.keyboard.press("Enter");
await page.waitForTimeout(200);
await page.keyboard.press("Tab");
await page.waitForTimeout(200);
const tabbed = await page.evaluate(() => ({ menuOpen: !!document.querySelector(".lightline-grip-menu:popover-open"), focus: document.activeElement.getAttribute("aria-label") || document.activeElement.textContent.slice(0, 30) }));
report.gripMenu = { opened, escaped, tabbed };
await page.locator(".lightline-panel-telemetry .lightline-panel-grip").focus();
await page.keyboard.press("Enter");
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(OUT, `suite-access-${FILM}-menu.png`) });
await page.keyboard.press("Escape");

report.errors = errors;
fs.writeFileSync(path.join(OUT, `suite-access-${FILM}.json`), JSON.stringify(report, null, 1));
console.log("order:", report.order.join(" > "));
console.log("stops:", stops.length, stops.map((s) => s.name).join(" | "));
console.log("unlit:", report.unlit.length ? report.unlit : "none");
for (const k of ["speedArrow", "timelineArrow", "tapOnPanel", "gripMenu"]) console.log(k, JSON.stringify(report[k]));
console.log("errors:", errors.length ? errors : "none");
await browser.close();
