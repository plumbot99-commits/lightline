// Lightline part 4: a first look at the Suite. Opens the workbench's frame page at a width, switches to the Suite,
// plays a little, and reports the boxes (room, frame, picture, rails, panels) with any overlap of the picture.
// Usage: node checks/suite-look.mjs <evidence-dir> <film> <viewport-width> [label]
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const [OUT, FILM = "rogue-render", W = "1440", LABEL = "look"] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const width = Number(W);

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width, height: width >= 1900 ? 1080 : 900 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && !/favicon/.test(m.location()?.url ?? "") && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`http://localhost:${process.env.PORT ?? 5180}/preview.html#film=${FILM}&width=1360`, { waitUntil: "load" });
// The workbench caps its player at 1360 px; for the room at the viewport's width the cap is lifted here only.
await page.addStyleTag({ content: `.preview-player { max-width: none !important; }` });
await page.waitForSelector("video");
await page.evaluate(() => localStorage.removeItem("lightline:suite"));
await page.waitForTimeout(1500);
const sw = page.locator(".lightline-layout-option", { hasText: "Suite" });
console.log("switch offered:", await sw.count());
await sw.click();
await page.waitForTimeout(800);
await page.evaluate(async () => {
  const v = document.querySelector("video");
  v.muted = true;
  v.currentTime = 12;
  await v.play();
});
await page.waitForTimeout(2500);
const boxes = await page.evaluate(() => {
  const r = (el) => el && (({ x, y, width, height }) => ({ x: Math.round(x), y: Math.round(y), w: Math.round(width), h: Math.round(height) }))(el.getBoundingClientRect());
  const q = (s) => document.querySelector(s);
  const pic = q(".lightline-suite-picture").getBoundingClientRect();
  const overlap = (el) => {
    const b = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(b.right, pic.right) - Math.max(b.left, pic.left));
    const y = Math.max(0, Math.min(b.bottom, pic.bottom) - Math.max(b.top, pic.top));
    return Math.round(x * y);
  };
  const panels = [...document.querySelectorAll(".lightline-panel")].map((p) => ({ id: p.dataset.panel, rail: p.parentElement.dataset.rail, box: r(p), overPicture: overlap(p) }));
  const controls = [".video-controls-top", ".video-controls-bottom"].map((s) => ({ s, box: r(q(s)), overPicture: overlap(q(s)) }));
  return { room: r(q(".media-skin")), frame: r(q(".lightline-suite-frame")), picture: r(q(".lightline-suite-picture")), video: r(q("video")), rails: Object.fromEntries([...document.querySelectorAll(".lightline-rail")].map((x) => [x.dataset.rail, r(x)])), panels, controls, layout: document.querySelector(".media-skin").dataset.layout };
});
console.log(JSON.stringify(boxes, null, 1));
await page.screenshot({ path: path.join(OUT, `${LABEL}-${FILM}-${W}.png`) });
console.log("errors:", errors.length ? errors : "none");
await browser.close();
