// Lightline, the LOADING state: the film's stream is held for five seconds, so the player truly waits for data
// when play is pressed. The film plays from Mux (playback ID CHf85FN1...); every request to Mux's stream hosts
// is held, the storyboard and poster images on image.mux.com are not. Usage: node lightline-loading.mjs <out-dir>
// [film], film a workbench film id (default rogue-render), added for Lightline part 2's three films.
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const OUT = process.argv[2];
const FILM = process.argv[3] ?? "rogue-render";
const browser = await chromium.launch({ channel: "msedge", timeout: 20000 });
const kill = setTimeout(() => { console.log("timed out"); process.exit(2); }, 60000);
try {
  const ctx = await browser.newContext({ viewport: { width: 944, height: 640 } });
  await ctx.route((url) => url.hostname.endsWith("mux.com") && url.hostname !== "image.mux.com", async (route) => {
    await new Promise((r) => setTimeout(r, 5000));
    await route.continue().catch(() => {});
  });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${process.env.PORT ?? 5180}/preview.html#film=${FILM}&width=896&ratio=16:9&scheme=dark`, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForSelector("video", { timeout: 15000 });
  await page.evaluate(() => { const v = document.querySelector("video"); v.muted = true; v.play().catch(() => {}); });
  await page.waitForTimeout(1800);
  const box = await page.locator(".media-skin").boundingBox();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4);
  await page.waitForTimeout(300);
  const facts = await page.evaluate((film) => ({ film, pill: document.querySelector(".lightline-state-pill")?.getAttribute("data-state") ?? null, text: document.querySelector(".lightline-state-pill")?.textContent ?? "", readyState: document.querySelector("video").readyState }), FILM);
  await page.locator(".media-skin").screenshot({ path: path.join(OUT, "lightline-access-loading-896.png") });
  console.log(JSON.stringify(facts));
} finally {
  clearTimeout(kill);
  await browser.close();
}
