// Lightline, the page's language menu (design/glass-polish.md, polish 8; since glass-2, in the player's Options sheet).
// At a width: the menu is reached by keyboard through the Options button,
// and is named; its first option is Automatic, then every locale the skin ships, each named in its own
// language. Picking a locale by keyboard sets the player's words and direction only (the page's own words and its
// <html lang> stay English); the pick is kept across a reload (for the visit). No horizontal overflow, no console error.
// Usage: PORT=5192 node checks/page-language.mjs <evidence-dir> <width> <tag...>
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const [OUT, W = "1440", ...TAGS] = process.argv.slice(2);
const width = Number(W);
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width, height: width >= 1000 ? 900 : 760 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`http://localhost:${process.env.PORT ?? 5192}${process.env.BASE ?? "/"}`, { waitUntil: "load" });
await page.evaluate(() => sessionStorage.clear());
await page.reload({ waitUntil: "load" });
await page.waitForSelector("video");
await page.waitForTimeout(1200);

const words = () =>
  page.evaluate(() => {
    const skin = document.querySelector(".media-skin");
    return {
      htmlLang: document.documentElement.lang,
      pageTitle: document.querySelector(".page-title").textContent,
      intro: document.querySelector(".page-intro").textContent.slice(0, 40),
      library: document.querySelector("#page-library").textContent,
      playerLang: skin.getAttribute("lang"),
      playerDir: getComputedStyle(skin).direction,
      play: document.querySelector(".media-skin .media-play-button, .media-skin [class*=play-button]")?.getAttribute("aria-label"),
      overflowX: document.documentElement.scrollWidth > innerWidth,
    };
  });

// The menu is in the player's Options sheet: Tab from the top of the page until the Options button has focus, open it
// with Enter, and go to the menu.
let tabs = 0;
let reached = false;
for (; tabs < 40 && !reached; tabs++) {
  await page.keyboard.press("Tab");
  reached = await page.evaluate(() => document.activeElement?.classList.contains("lightline-options-button") ?? false);
}
const openMenu = async () => {
  const sheet = page.locator(".lightline-options");
  if (!(await sheet.count())) {
    await page.locator(".media-skin").hover({ position: { x: 40, y: 40 } });
    await page.locator(".lightline-options-button").click();
  }
  await sheet.waitFor();
  return page.getByLabel("Player language");
};
if (reached) await page.keyboard.press("Enter");
await page.locator(".lightline-options").waitFor();
for (let i = 0; i < 12; i++) {
  if (await page.evaluate(() => [...(document.activeElement?.labels ?? [])].some((l) => l.textContent === "Player language"))) break;
  await page.keyboard.press("Tab");
}
const menu = await page.evaluate(() => {
  const select = document.activeElement;
  const box = select.getBoundingClientRect();
  const player = document.querySelector(".media-skin").getBoundingClientRect();
  const options = [...select.options].map((o) => ({ value: o.value, name: o.textContent, lang: o.lang }));
  return {
    name: [...select.labels].map((l) => l.textContent).join(" "),
    outline: getComputedStyle(select).outlineStyle,
    inPlayer: box.top >= player.top && box.bottom <= player.bottom + 1,
    count: options.length,
    first: options.slice(0, 4),
    picked: options.filter((o) => ["ar", "de", "ja", "pt-BR", "zh-TW"].includes(o.value)),
  };
});
const before = await words();
const results = { width, tabs, reached, menu, before, picks: [] };

for (const tag of TAGS.length ? TAGS : ["ar", "de"]) {
  await (await openMenu()).selectOption(tag);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1500);
  const after = await words();
  await page.screenshot({ path: path.join(OUT, `language-${W}-${tag}.png`) });
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector("video");
  await page.waitForTimeout(1500);
  const kept = await (await openMenu()).inputValue();
  await page.keyboard.press("Escape");
  const afterReload = await words();
  results.picks.push({ tag, after, kept, afterReload });
}
const ok =
  reached &&
  menu.outline !== "none" &&
  menu.first[0]?.name === "Automatic" &&
  menu.name === "Player language" &&
  results.picks.every(
    (p) =>
      p.after.playerLang === p.tag &&
      p.after.htmlLang === "en" &&
      p.after.pageTitle === before.pageTitle &&
      p.after.library === before.library &&
      p.after.play !== before.play &&
      !p.after.overflowX &&
      p.kept === p.tag &&
      p.afterReload.playerLang === p.tag
  ) &&
  (results.picks.find((p) => p.tag === "ar")?.after.playerDir ?? "rtl") === "rtl" &&
  !errors.length;
console.log(JSON.stringify({ ...results, errors }, null, 1));
console.log(ok ? "PASS" : "FAIL");
fs.writeFileSync(path.join(OUT, `language-${W}.json`), JSON.stringify({ ...results, errors, ok }, null, 1));
await browser.close();
