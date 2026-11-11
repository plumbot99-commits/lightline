// Lightline part 5, the owner's finding of 11:42: every Suite panel fits its content in the longest locales. For each
// locale and viewport, the room in its default layout (the lab left, Stream right, Timecode and Guides below): every
// control and label in a panel must sit inside the panel's box, or inside what the panel or its rail scrolls to, and a
// box that scrolls must show its scrollbar and be reached by Tab (a control inside it, or the box itself). The room must
// end inside the viewport. Two layouts: the default, and "stacked" (the lab and Timecode on the left rail, Stream and
// Guides on the right), where two panels share a rail. Edge runs with its scrollbars drawn (Playwright hides them). The
// bar keeps one line, the five guides in its middle or folded into its Guides button (design/guides-bar-timeline.md).
// Usage: PORT=5187 node checks/suite-panels-fit.mjs <evidence-dir> <WxH> <tag...>
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const [OUT, SIZE = "1920x1080", ...TAGS] = process.argv.slice(2);
const [width, height] = SIZE.split("x").map(Number);
fs.mkdirSync(OUT, { recursive: true });
const BASE = `http://localhost:${process.env.PORT ?? 5180}/preview.html`;
const browser = await chromium.launch({ channel: "msedge", ignoreDefaultArgs: ["--hide-scrollbars"] });
const STACKED = {
  mode: "suite",
  panels: {
    lab: { rail: "left", order: 0, float: null, open: true },
    deck: { rail: "left", order: 1, float: null, open: true },
    telemetry: { rail: "right", order: 0, float: null, open: true },
    guides: { rail: "right", order: 1, float: null, open: true },
  },
};
const results = [];

for (const tag of TAGS.length ? TAGS : ["lv", "fi", "de", "ru", "el", "hu"])
for (const layout of ["default", "stacked"]) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}#film=the-only-one-that-fits&width=1360&locale=${tag}`, { waitUntil: "load" });
  await page.evaluate((l) => (l ? localStorage.setItem("lightline:suite", JSON.stringify(l)) : localStorage.removeItem("lightline:suite")), layout === "stacked" ? STACKED : null);
  await page.reload({ waitUntil: "load" });
  await page.addStyleTag({ content: `.preview-player { max-width: none !important; }` });
  await page.waitForFunction(() => document.querySelector("video")?.readyState >= 1);
  await page.waitForTimeout(1200);
  if (layout === "default") await page.locator(".lightline-layout-switch button").last().click();
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelector('[data-layout="suite"]').scrollIntoView({ block: "start" }));

  const report = await page.evaluate(() => {
    const room = document.querySelector('[data-layout="suite"]');
    const box = (el) => el.getBoundingClientRect();
    const scrolls = (el) => {
      const s = getComputedStyle(el);
      return /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1;
    };
    const leaves = (panel) =>
      [...panel.querySelectorAll("button, input, label, legend, h2, h3, p, span, dt, dd, output, svg")].filter((el) => {
        const r = box(el);
        if (!r.width || !r.height) return false;
        if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") return false;
        return getComputedStyle(el).visibility !== "hidden";
      });
    const panels = [...room.querySelectorAll(".lightline-panel")].map((panel) => {
      const p = box(panel);
      const rail = panel.closest(".lightline-rail");
      const railBox = rail ? box(rail) : null;
      const body = panel.querySelector(".lightline-panel-body");
      const panelScrolls = scrolls(panel) || scrolls(body);
      const railScrolls = rail ? scrolls(rail) : false;
      const out = [];
      for (const el of leaves(panel)) {
        const r = box(el);
        // Inside the panel's box, or, where the panel scrolls, inside its scrolled content.
        const right = r.right <= p.right + 0.5 && r.left >= p.left - 0.5;
        const below = r.bottom - p.bottom;
        const inside = right && (below <= 0.5 || panelScrolls) && r.top >= p.top - 0.5;
        if (!inside) out.push({ el: el.tagName.toLowerCase(), cls: el.className?.baseVal ?? el.className, text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 40), right: Math.round(r.right - p.right), below: Math.round(below) });
      }
      // The panel's own bottom inside its rail (or the rail scrolls to it), and the rail inside the room.
      const panelOut = railBox && !railScrolls && p.bottom > railBox.bottom + 0.5;
      const scrollBoxes = [scrolls(panel) && panel, scrolls(body) && body, railScrolls && rail].filter(Boolean).map((el) => ({
        which: el === panel ? "panel" : el === body ? "body" : "rail",
        scrollbar: getComputedStyle(el).scrollbarWidth !== "none" && el.offsetWidth - el.clientWidth > 0,
        // The box itself a tab stop: a control below the fold scrolls into view, but words need the box.
        keyboard: el.tabIndex >= 0,
        overflow: el.scrollHeight - el.clientHeight,
      }));
      return {
        id: panel.dataset.panel,
        rail: rail?.className.match(/lightline-rail-(\w+)/)?.[1] ?? "float",
        size: [Math.round(p.width), Math.round(p.height)],
        outside: out,
        panelOut,
        scrollBoxes,
        ok: !out.length && !panelOut && scrollBoxes.every((s) => s.scrollbar && s.keyboard),
      };
    });
    const r = box(room);
    // The bar in the locale's words (design/guides-bar-timeline.md): the five guides at their width against the bar's
    // middle, in it or folded into the Guides button; nothing leaves the bar or overlaps, and it stays one line.
    const row = room.querySelector(".video-controls-row");
    const rb = box(row);
    const seen = (el) => box(el).width > 0 && box(el).height > 0 && getComputedStyle(el).visibility !== "hidden";
    const slot = row.querySelector(".lightline-bar-guides");
    const items = [...row.querySelectorAll("button, label, .media-time-group")].filter((el) => seen(el) && !el.closest("[popover]"));
    const parts = [...row.children].filter(seen).map(box);
    const bar = {
      width: Math.round(rb.width),
      height: Math.round(rb.height),
      need: slot ? Math.round(slot.querySelector(".lightline-bar-guides-list").offsetWidth) : null,
      middle: slot ? Math.round(slot.clientWidth) : null,
      folded: slot ? slot.hasAttribute("data-folded") : null,
      pills: [...row.querySelectorAll(".lightline-bar-guide")].filter(seen).map((el) => el.textContent.trim()),
      button: row.querySelector(".lightline-bar-guides-button")?.textContent.trim() ?? null,
      out: items
        .filter((el) => box(el).left < rb.left - 0.5 || box(el).right > rb.right + 0.5 || box(el).top < rb.top - 0.5 || box(el).bottom > rb.bottom + 0.5)
        .map((el) => el.getAttribute("aria-label") || el.textContent.trim().slice(0, 30)),
      overlap: parts.some((b, i) => i > 0 && parts[i - 1].right > b.left + 0.5),
      oneLine: rb.height <= Math.max(...parts.map((b) => b.height)) + 0.5,
    };
    bar.ok = !!slot && !bar.out.length && !bar.overlap && bar.oneLine && (bar.folded ? !!bar.button && !bar.pills.length : bar.pills.length === 5);
    return { room: [Math.round(r.width), Math.round(r.height)], roomInside: r.height <= innerHeight + 0.5, bar, panels };
  });
  report.tag = tag;
  report.layout = layout;
  report.errors = errors;
  report.ok = report.roomInside && report.bar.ok && report.panels.every((p) => p.ok) && !errors.length;
  results.push(report);
  console.log(tag, layout, SIZE, report.ok ? "ok" : "FAIL", JSON.stringify({ room: report.room, bar: report.bar, panels: report.panels.filter((p) => !p.ok || p.scrollBoxes.length) }));
  await page.screenshot({ path: path.join(OUT, `${tag}-${layout}-${SIZE}.png`) });
  await page.close();
}

fs.writeFileSync(path.join(OUT, `panels-${SIZE}.json`), JSON.stringify(results, null, 2));
console.log("all ok", results.every((r) => r.ok));
await browser.close();
