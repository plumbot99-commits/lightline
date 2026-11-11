// Lightline, the presentation page: the stills it shows, made from the workbench's frame page at 1440 (its cap lifted to
// 1360, on the page's ground): Cinema and the Suite, and the four states (paused, loading by the simulator's stall mid-play, ended,
// error by its error). Each is the player with a margin for its light, saved as JPEG to apps/page/src/stills/.
// Usage: PORT=5187 node checks/page-stills.mjs
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const OUT = path.resolve("apps/page/src/stills");
fs.mkdirSync(OUT, { recursive: true });
const BASE = `http://localhost:${process.env.PORT ?? 5180}/preview.html`;
const browser = await chromium.launch({ channel: "msedge" });
const said = {};
const PARAMS = /PARAMS_MESSAGE = '([^']+)'/.exec(fs.readFileSync("apps/preview/src/shell/messages.ts", "utf8"))[1];

async function open(hash) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}#width=1360&${hash}`, { waitUntil: "load" });
  await page.evaluate(() => localStorage.removeItem("lightline:suite"));
  await page.reload({ waitUntil: "load" });
  // The page's own ground around the player, so its light shows as it will on the page.
  await page.addStyleTag({
    content: `.preview-player { max-width: none !important; } html, body, .preview-page { background: #060a0e !important; }`,
  });
  await page.waitForTimeout(1500);
  return page;
}

async function still(page, name, margin = 24) {
  const box = await page.locator(".media-skin").boundingBox();
  await page.screenshot({
    path: path.join(OUT, `${name}.jpg`),
    type: "jpeg",
    quality: 80,
    clip: { x: Math.max(0, box.x - margin), y: Math.max(0, box.y - margin), width: box.width + 2 * margin, height: box.height + 2 * margin },
  });
  said[name] = await page.evaluate(() => document.querySelector(".lightline-state-pill")?.textContent ?? "");
  await page.close();
}

const at = (page, time) =>
  page.evaluate(async (t) => {
    const v = document.querySelector("video");
    v.currentTime = t;
    await v.play();
  }, time);
const ready = (page) => page.waitForFunction(() => document.querySelector("video")?.readyState >= 1);
const wake = (page) => page.locator(".media-skin").hover({ position: { x: 300, y: 200 } });

// Cinema: playing, the controls up.
let page = await open("film=rogue-render");
await ready(page);
await at(page, 7);
await page.waitForTimeout(2500);
await wake(page);
await page.waitForTimeout(400);
await still(page, "cinema");

// The Suite: the default layout, the music video at the painted room.
page = await open("film=the-only-one-that-fits");
await ready(page);
await page.locator(".lightline-layout-switch button").last().click();
await at(page, 72);
await page.waitForTimeout(2500);
await page.evaluate(() => document.querySelector("video").pause());
await page.waitForTimeout(800);
await still(page, "suite", 0);

// Paused: the orange glow.
page = await open("film=rogue-render");
await ready(page);
await at(page, 20);
await page.waitForTimeout(1500);
await page.evaluate(() => document.querySelector("video").pause());
await page.waitForTimeout(1500);
await still(page, "paused");

// Ended: after the green sweep.
page = await open("film=rogue-render");
await ready(page);
await at(page, 47);
await page.waitForFunction(() => document.querySelector("video").ended, null, { timeout: 15000 });
await page.waitForTimeout(2500);
await still(page, "ended");

// Loading: playing, then the stream held by the simulator's stall (it drops what was buffered ahead).
page = await open("film=rogue-render");
await ready(page);
await at(page, 30);
await page.waitForTimeout(2000);
// As the workbench's shell does: a params message with the new query.
await page.evaluate((type) => {
  const query = location.hash.slice(1).replace(/net=\w+/, "net=stall");
  postMessage({ type, query: /net=/.test(query) ? query : `${query}&net=stall` }, location.origin);
}, PARAMS);
await page.waitForFunction(() => document.querySelector(".lightline-state-pill")?.textContent === "Loading", null, { timeout: 20000 });
await wake(page);
await page.waitForTimeout(600);
await still(page, "loading");

// Error: the stream refused by the simulator.
page = await open("film=rogue-render&net=error");
await page.waitForTimeout(3000);
await still(page, "error");

console.log(JSON.stringify(said));
await browser.close();
