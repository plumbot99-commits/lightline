// Lightline, the page's link preview (design/glass-polish.md, polish 4): a 1200 by 630 still of the player made from the
// workbench's frame page, as the page's stills were (checks/page-stills.mjs). Cinema, The Rogue Render playing in its
// war room with the controls up and the film's light spilling past the frame, centered on the page's ground. Saved as
// apps/page/public/og.jpg, which the page's build copies to its root.
// Usage: PORT=5184 node checks/og-image.mjs
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const OUT = path.resolve("apps/page/public/og.jpg");
const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1400, height: 820 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`http://localhost:${process.env.PORT ?? 5184}/preview.html#film=rogue-render&width=1000`, { waitUntil: "load" });
await page.evaluate(() => localStorage.removeItem("lightline:suite"));
await page.reload({ waitUntil: "load" });
await page.addStyleTag({
  content: `.preview-player { max-width: 1000px !important; } html, body, .preview-page { background: #060a0e !important; }`,
});
await page.waitForSelector("video");
await page.waitForTimeout(1500);
await page.evaluate(async () => {
  const v = document.querySelector("video");
  v.muted = true;
  v.currentTime = 17.6;
  await v.play();
});
await page.waitForTimeout(1800);
const box = await page.locator(".media-skin").boundingBox();
await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.9);
await page.waitForTimeout(1200);
const W = 1200;
const H = 630;
await page.screenshot({
  path: OUT,
  type: "jpeg",
  quality: 85,
  clip: { x: Math.round(box.x + box.width / 2 - W / 2), y: Math.round(box.y + box.height / 2 - H / 2), width: W, height: H },
});
console.log("player", JSON.stringify(box), "saved", OUT, "errors:", errors.length ? errors : "none");
await browser.close();
