// Lightline part 4, the room against the screen: at a viewport's size and in fullscreen, the room (default layout:
// the lab left, Stream right, Timecode and Guides below) must end inside the viewport, and so must the last
// chapter pill (Timecode is the panel `deck`). Where the side rails' panels are under the film (design/layout.md) the
// bottom rail is held and a panel scrolls its body: there a pill counts when scrolling its panel's body brings it
// inside the room. The bar keeps one line with the five guides in its middle or folded into its Guides button, and the
// timeline scrolls nothing (design/guides-bar-timeline.md).
// Usage: PORT=5181 node checks/suite-fit.mjs <evidence-dir> <film> [width] [height]
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const [OUT, FILM = "the-only-one-that-fits", W = "1920", H = "1080"] = process.argv.slice(2);
const width = Number(W);
const height = Number(H);
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width, height } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const url = `http://localhost:${process.env.PORT ?? 5180}/preview.html#film=${FILM}&width=1360`;
await page.goto(url, { waitUntil: "load" });
await page.evaluate(() => localStorage.removeItem("lightline:suite"));
await page.reload({ waitUntil: "load" });
await page.addStyleTag({ content: `.preview-player { max-width: none !important; }` });
await page.waitForFunction(() => document.querySelector("video")?.readyState >= 1);
await page.getByRole("button", { name: "Suite", exact: true }).click();
await page.waitForTimeout(900);

const measure = () =>
  page.evaluate(() => {
    const room = document.querySelector('[data-layout="suite"]');
    const r = (el) => {
      const b = el.getBoundingClientRect();
      return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), width: Math.round(b.width), height: Math.round(b.height) };
    };
    const pills = [...room.querySelectorAll('[data-panel="deck"] button')].filter((b) => /Outro|Final Chorus/.test(b.textContent));
    const foot = () => room.getBoundingClientRect().bottom + 0.5;
    // A pill in a body that scrolls: scrolled to, within its body only, it must end inside the room.
    const reached = pills.map((p) => {
      const body = p.closest(".lightline-panel-body");
      if (p.getBoundingClientRect().bottom <= foot() || !body || body.scrollHeight <= body.clientHeight + 1) return false;
      const was = body.scrollTop;
      body.scrollTop += p.getBoundingClientRect().bottom - body.getBoundingClientRect().bottom + 4;
      const ok = p.getBoundingClientRect().bottom <= foot() && p.getBoundingClientRect().top >= body.getBoundingClientRect().top - 0.5;
      body.scrollTop = was;
      return ok;
    });
    // The bar (design/guides-bar-timeline.md): the five guides in its middle at their own width, or folded into the
    // Guides button where the middle is narrower; nothing leaves the bar, nothing overlaps, the bar stays one line.
    const row = room.querySelector(".video-controls-row");
    const rb = row.getBoundingClientRect();
    const seen = (el) => {
      const b = el.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== "hidden";
    };
    const slot = row.querySelector(".lightline-bar-guides");
    const items = [...row.querySelectorAll("button, label, .media-time-group")].filter((el) => seen(el) && !el.closest("[popover]"));
    const parts = [...row.children].filter(seen).map((el) => el.getBoundingClientRect());
    const bar = {
      width: Math.round(rb.width),
      height: Math.round(rb.height),
      need: slot ? Math.round(slot.querySelector(".lightline-bar-guides-list").offsetWidth) : null,
      middle: slot ? Math.round(slot.clientWidth) : null,
      folded: slot ? slot.hasAttribute("data-folded") : null,
      pills: [...row.querySelectorAll(".lightline-bar-guide")].filter(seen).length,
      button: !!row.querySelector(".lightline-bar-guides-button"),
      out: items
        .filter((el) => {
          const b = el.getBoundingClientRect();
          return b.left < rb.left - 0.5 || b.right > rb.right + 0.5 || b.top < rb.top - 0.5 || b.bottom > rb.bottom + 0.5;
        })
        .map((el) => el.getAttribute("aria-label") || el.textContent.trim().slice(0, 30)),
      overlap: parts.some((b, i) => i > 0 && parts[i - 1].right > b.left + 0.5),
      oneLine: rb.height <= Math.max(...parts.map((b) => b.height)) + 0.5,
    };
    bar.ok = !!slot && !bar.out.length && !bar.overlap && bar.oneLine && (bar.folded ? bar.button && !bar.pills : bar.pills === 5);
    // The timeline, held under the film, scrolls nothing.
    const tlBody = room.querySelector('[data-panel="guides"] .lightline-panel-body');
    const timeline = tlBody && {
      height: Math.round(tlBody.closest(".lightline-panel").getBoundingClientRect().height),
      share: +(tlBody.closest(".lightline-panel").getBoundingClientRect().height / innerHeight).toFixed(3),
      scrolls: tlBody.scrollHeight > tlBody.clientHeight + 1,
    };
    return {
      under: room.hasAttribute("data-panels-under"),
      bar,
      timeline,
      reached,
      viewport: { width: innerWidth, height: innerHeight },
      room: r(room),
      picture: r(room.querySelector(".lightline-suite-picture")),
      video: r(room.querySelector("video")),
      lastPills: pills.map((p) => ({ text: p.textContent, ...r(p) })),
      inside:
        room.getBoundingClientRect().height <= innerHeight + 0.5 &&
        pills.every((p, i) => p.getBoundingClientRect().bottom <= foot() || reached[i]) &&
        bar.ok &&
        !timeline?.scrolls,
    };
  });

await page.evaluate(() => document.querySelector('[data-layout="suite"]').scrollIntoView({ block: "start" }));
const windowed = await measure();
console.log("windowed", JSON.stringify(windowed));
await page.screenshot({ path: path.join(OUT, `${FILM}-${W}x${H}-fit.png`) });

await page.locator(".media-fullscreen-button").click();
await page.waitForTimeout(900);
const full = await measure();
console.log("fullscreen", JSON.stringify(full));
await page.screenshot({ path: path.join(OUT, `${FILM}-${W}x${H}-fit-fullscreen.png`) });

const report = { film: FILM, windowed, fullscreen: full, errors, ok: windowed.inside && full.inside && !errors.length };
fs.writeFileSync(path.join(OUT, `${FILM}-${W}x${H}-fit.json`), JSON.stringify(report, null, 2));
console.log("ok", report.ok, errors);
await browser.close();
