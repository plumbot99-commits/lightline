// Lightline, the Glass slider (design/lightline-record.md, "Glass, closer to his picture"). On the page, in the player's
// Options sheet: the slider shows only in the Suite, is a labeled native range over the skin's bounds, moves by keyboard, sets
// `--lightline-glass-opacity` on the player so the docked panels' tint follows, is kept across a reload in the same
// visit, and reduced transparency still makes the panes solid. In the workbench: the Glass option reaches the preview's
// player. Usage: PAGE_PORT=5192 WB_PORT=5184 node checks/glass-slider.mjs <evidence-dir> (WB=<url> for a built workbench)
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const OUT = process.argv[2] ?? "glass-slider";
fs.mkdirSync(OUT, { recursive: true });
const PAGE = `http://localhost:${process.env.PAGE_PORT ?? 5192}${process.env.BASE ?? "/"}`;
const WB = process.env.WB ?? `http://localhost:${process.env.WB_PORT ?? 5184}/`;
const fails = [];
const ok = (cond, what) => (cond ? console.log("ok  ", what) : (fails.push(what), console.log("FAIL", what)));
const errors = [];
const missing = [];
const browser = await chromium.launch({ channel: "msedge" });

async function open(url, opts = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  const page = await context.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(`${m.text()} at ${m.location().url}`));
  page.on("pageerror", (e) => errors.push(String(e)));
  // A failed resource is logged without its address; the response names it.
  page.on("response", (r) => r.status() >= 400 && missing.push(`${r.status()} ${r.url()}`));
  await page.goto(url, { waitUntil: "load" });
  return { context, page };
}
// The tint a docked panel draws: the alpha of its gradient's last color (the custom property itself is not evaluated).
const tint = (page) =>
  page.evaluate(() => {
    const image = getComputedStyle(document.querySelector(".lightline-panel:not([data-floating])")).backgroundImage;
    return image.match(/rgba\(8, 16, 20, ([\d.]+)\)/)?.[1] ?? "solid";
  });
// The slider lives in the player's Options sheet (since the overlay step): open it if it is not open.
const openSheet = async (page) => {
  if (await page.locator(".lightline-options").count()) return;
  await page.locator(".media-skin").hover({ position: { x: 40, y: 40 } });
  await page.locator(".lightline-options-button").click();
  await page.locator(".lightline-options").waitFor();
};
const pane = (page) => page.evaluate(() => {
  const cs = getComputedStyle(document.querySelector(".lightline-panel:not([data-floating])"));
  return { image: cs.backgroundImage, backdrop: cs.backdropFilter };
});

// The page.
{
  const { context, page } = await open(PAGE);
  await page.waitForSelector("video");
  const slider = page.getByRole("slider", { name: "Glass" });
  await openSheet(page);
  ok((await slider.count()) === 0, "page: no Glass slider in Cinema");
  await page.keyboard.press("Escape");
  await page.locator(".lightline-layout-option", { hasText: "Suite" }).click();
  await page.waitForFunction(() => document.querySelector(".media-skin")?.dataset.layout === "suite");
  await openSheet(page);
  await slider.waitFor();
  const attrs = await slider.evaluate((el) => ({ type: el.type, min: el.min, max: el.max, step: el.step, value: el.value, text: el.getAttribute("aria-valuetext") }));
  ok(attrs.type === "range" && attrs.min === "10" && attrs.max === "70" && attrs.value === "58", `page: a native range 10 to 70, at 58 (${JSON.stringify(attrs)})`);
  ok(Math.abs(parseFloat(await tint(page)) - 0.42) < 0.001, `page: the default tint is 0.42 (${await tint(page)})`);
  await slider.focus();
  for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowRight");
  const ring = await slider.evaluate((el) => getComputedStyle(el).outlineStyle + " " + getComputedStyle(el).outlineWidth);
  ok(/solid 2px/.test(ring), `page: a visible focus ring while used by keyboard (${ring})`);
  const v = await slider.inputValue();
  ok(v === "70", `page: arrow keys move it to the see-through end (${v})`);
  ok(Math.abs(parseFloat(await tint(page)) - 0.3) < 0.001, `page: the tint follows to 0.3 (${await tint(page)})`);
  await page.keyboard.press("Home");
  ok((await slider.inputValue()) === "10", "page: Home moves it to the opaque end");
  ok(Math.abs(parseFloat(await tint(page)) - 0.9) < 0.001, `page: the tint follows to 0.9 (${await tint(page)})`);
  // Past the bounds, as a host might write it: the skin holds it.
  await page.evaluate(() => document.querySelector(".page-player").style.setProperty("--lightline-glass-opacity", "0"));
  ok(Math.abs(parseFloat(await tint(page)) - 0.3) < 0.001, `page: a host's 0 is held to 0.3 (${await tint(page)})`);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowRight");
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
  const kept = await slider.inputValue();
  await page.screenshot({ path: path.join(OUT, "page-1440-suite.png") });
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector("video");
  const layout = await page.evaluate(() => document.querySelector(".media-skin")?.dataset.layout);
  if (layout !== "suite") await page.locator(".lightline-layout-option", { hasText: "Suite" }).click();
  await openSheet(page);
  await slider.waitFor();
  ok((await slider.inputValue()) === kept, `page: kept across a reload in the visit (${kept})`);
  await context.close();
}

// Reduced transparency: solid panes whatever the slider says.
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value: "reduce" }] });
  await page.goto(PAGE, { waitUntil: "load" });
  await page.waitForSelector("video");
  await page.locator(".lightline-layout-option", { hasText: "Suite" }).click();
  await openSheet(page);
  const slider = page.getByRole("slider", { name: "Glass" });
  await slider.waitFor();
  await slider.focus();
  await page.keyboard.press("End");
  const p = await pane(page);
  ok(p.backdrop === "none" && /rgb\(8, 16, 20\)\)$/.test(p.image), `reduced transparency: solid panes at 70% see-through (${p.image.slice(0, 70)}, ${p.backdrop})`);
  await context.close();
}

// The workbench: its Glass option reaches the preview's player.
{
  const { context, page } = await open(WB);
  const field = page.getByRole("slider", { name: "Glass" });
  await page.waitForTimeout(1500);
  if (!(await field.isVisible())) await page.getByRole("button", { name: "Options" }).first().click();
  await field.waitFor({ timeout: 10000 });
  await field.focus();
  await page.keyboard.press("End");
  await page.waitForTimeout(800);
  const frameEnd = await page.frameLocator("iframe").first().locator(".preview-player").evaluate((el) => el.style.getPropertyValue("--lightline-glass-opacity"));
  ok((await field.inputValue()) === "70" && frameEnd === "0.30", `workbench: End reaches 70% see-through, the preview's player at 0.30 (${frameEnd})`);
  await page.keyboard.press("Home");
  const frame = page.frameLocator("iframe").first();
  await page.waitForTimeout(800);
  const prop = await frame.locator(".preview-player").evaluate((el) => el.style.getPropertyValue("--lightline-glass-opacity"));
  ok(prop === "0.90", `workbench: the preview's player has --lightline-glass-opacity 0.90 after Home (${prop})`);
  await page.screenshot({ path: path.join(OUT, "workbench-1440.png") });
  await context.close();
}

const favicon = missing.filter((m) => /favicon/.test(m)).length;
const real = errors.filter((e) => !/favicon/.test(e)).slice(favicon);
console.log("missing resources:", missing.join(", ") || "none");
ok(real.length === 0, `no console error (${real.slice(0, 3).join(" | ")})`);
fs.writeFileSync(path.join(OUT, "summary.txt"), `${fails.length ? "FAIL" : "PASS"}\n${fails.join("\n")}\n`);
console.log(fails.length ? "FAIL" : "PASS");
await browser.close();
process.exit(fails.length ? 1 : 0);
