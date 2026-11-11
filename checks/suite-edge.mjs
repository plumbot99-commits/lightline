// Lightline part 4: the room at the edge of being offered (a 1100 px container, and 1099), and a drag caught in the
// middle (its ghost and the mark on the frame's edge). Usage: PORT=5181 node checks/suite-edge.mjs <dir>
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const [OUT] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "msedge" });
for (const container of [1100, 1099]) {
  const page = await browser.newPage({ viewport: { width: container + 48, height: 900 } });
  await page.goto(`http://localhost:${process.env.PORT ?? 5180}/preview.html#film=rogue-render&width=1360`, { waitUntil: "load" });
  await page.addStyleTag({ content: `.preview-player { max-width: none !important; }` });
  await page.waitForSelector("video", { state: "attached" });
  await page.waitForTimeout(1200);
  const offered = await page.locator(".lightline-layout-option").count();
  let picture = null;
  if (offered) {
    await page.locator(".lightline-layout-option", { hasText: "Suite" }).click();
    await page.waitForTimeout(600);
    picture = await page.locator(".lightline-suite-picture").boundingBox();
    await page.screenshot({ path: path.join(OUT, `edge-${container}.png`) });
  }
  const width = await page.locator(".media-skin").evaluate((el) => el.getBoundingClientRect().width);
  console.log(JSON.stringify({ container: width, offered: offered > 0, picture: picture && [Math.round(picture.width), Math.round(picture.height)] }));
  if (container === 1100) {
    // A drag held over the right of the frame.
    const grip = await page.locator(".lightline-panel-lab .lightline-panel-grip").boundingBox();
    const frame = await page.locator(".lightline-suite-frame").boundingBox();
    await page.mouse.move(grip.x + 10, grip.y + 10);
    await page.mouse.down();
    await page.mouse.move(frame.x + frame.width + 60, frame.y + 120, { steps: 10 });
    await page.screenshot({ path: path.join(OUT, "drag-held.png") });
    console.log(JSON.stringify({ ghost: await page.locator(".lightline-suite-ghost").textContent(), mark: await page.locator(".lightline-suite-mark").boundingBox() }));
    await page.mouse.up();
    await page.waitForTimeout(300);
    console.log("said:", await page.locator(".media-status-announcer").textContent());
  }
  await page.close();
}
await browser.close();
