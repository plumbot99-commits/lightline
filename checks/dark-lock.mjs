// Lightline part 3, the owner's finding of 2026-11-09: on the light scheme the glow cannot be seen. The workbench on
// scheme=light, the music video lit at 1:00: what Scaffold's light-dark() values resolve to inside the skin, and
// the page just outside the frame (24 px left of it, 24 px above it), without and with theater mode, from a
// screenshot. Usage: node checks/dark-lock.mjs <evidence-dir> <label>
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const [OUT, LABEL = "now"] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && !/favicon/.test(m.location()?.url ?? "") && errors.push(m.text()));
await page.goto(`http://localhost:${process.env.PORT ?? 5180}/?film=the-only-one-that-fits&scheme=light&width=896`, { waitUntil: "load" });
await page.waitForSelector("iframe");
const frame = await (await page.$("iframe")).contentFrame();
await frame.waitForSelector("video");
await frame.evaluate(async () => {
  const v = document.querySelector("video");
  await new Promise((r) => (v.readyState >= 1 ? r() : v.addEventListener("loadedmetadata", r, { once: true })));
  v.muted = true;
  v.currentTime = 60;
  await v.play();
});
await page.waitForTimeout(2500);

const tokens = () =>
  frame.evaluate(() => {
    const skin = document.querySelector(".media-skin");
    const cs = getComputedStyle(skin);
    return {
      pageScheme: getComputedStyle(document.documentElement).colorScheme,
      skinScheme: cs.colorScheme,
      foreground: cs.getPropertyValue("--media-foreground").trim(),
      muted: cs.getPropertyValue("--media-muted").trim(),
      frameBorder: cs.getPropertyValue("--media-frame-border").trim(),
      pageBackground: getComputedStyle(document.body).backgroundColor,
    };
  });

async function sample(name) {
  const file = path.join(OUT, `${LABEL}-${name}.png`);
  const shot = await page.screenshot({ path: file });
  const player = await frame.locator(".media-skin").boundingBox();
  // Playwright gives a framed element's box in the page's own coordinates.
  const { x, y } = player;
  const points = { left: [x - 24, y + player.height / 2], above: [x + player.width / 2, y - 24] };
  const pixels = await page.evaluate(
    async ({ b64, points }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      return Object.fromEntries(Object.entries(points).map(([k, [px, py]]) => [k, [...g.getImageData(Math.round(px), Math.round(py), 1, 1).data].slice(0, 3)]));
    },
    { b64: shot.toString("base64"), points }
  );
  return { file: path.basename(file), pixels };
}

const report = { at: new Date().toString(), label: LABEL, tokens: await tokens(), plain: await sample("plain") };
// Theater mode from the settings menu.
await frame.locator(".media-skin").hover();
await frame.locator('.video-controls-row button[aria-haspopup="menu"]').click();
await frame.getByRole("menuitemcheckbox", { name: /Theater mode/ }).click();
await page.keyboard.press("Escape");
await page.waitForTimeout(1500);
report.theater = { on: await frame.evaluate(() => document.querySelector(".media-skin").hasAttribute("data-theater")), ...(await sample("theater")) };
report.console = errors;
fs.writeFileSync(path.join(OUT, `${LABEL}.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
await browser.close();
