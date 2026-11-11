// Lightline, the owner's finding of 2026-11-09 ("the guidw and timeline is shorter than the other boxes", in
// design/glass-polish.md): in the Suite, the docked panels on one line of the top or bottom rail end on one line, the
// side rails' last panels end level with each other and with the bar, and the timeline's film strip and waveform fill
// the timeline's width, the waveform's quietest part drawn thick enough to see. For each locale, in the default layout
// and the stacked one (two panels a side rail), at a size, and in fullscreen with --fullscreen.
// Usage: PORT=5184 node checks/suite-level.mjs <evidence-dir> <WxH> [--fullscreen] <locale...>
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const [OUT, SIZE = "1920x1080", ...rest] = process.argv.slice(2);
const fullscreen = rest.includes("--fullscreen");
const TAGS = rest.filter((a) => !a.startsWith("--"));
const [width, height] = SIZE.split("x").map(Number);
fs.mkdirSync(OUT, { recursive: true });
const BASE = `http://localhost:${process.env.PORT ?? 5184}/preview.html`;
const browser = await chromium.launch({ channel: "msedge" });
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

for (const tag of TAGS.length ? TAGS : ["en"])
for (const layout of ["default", "stacked"]) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && !/favicon/.test(m.location()?.url ?? "") && errors.push(m.text()));
  await page.goto(`${BASE}#film=the-only-one-that-fits&width=1360&locale=${tag}`, { waitUntil: "load" });
  await page.evaluate((l) => (l ? localStorage.setItem("lightline:suite", JSON.stringify(l)) : localStorage.removeItem("lightline:suite")), layout === "stacked" ? STACKED : null);
  await page.reload({ waitUntil: "load" });
  await page.addStyleTag({ content: `.preview-player { max-width: none !important; }` });
  await page.waitForSelector("video");
  await page.waitForTimeout(1200);
  if (layout === "default") await page.locator(".lightline-layout-option").nth(1).click();
  await page.waitForFunction(() => document.querySelector(".media-skin")?.dataset.layout === "suite");
  if (fullscreen) {
    await page.evaluate(() => document.querySelector(".media-skin").requestFullscreen());
    await page.waitForTimeout(600);
  }
  await page.evaluate(async () => {
    const v = document.querySelector("video");
    v.muted = true;
    v.currentTime = 60;
    await v.play();
  });
  await page.waitForTimeout(2500);

  const m = await page.evaluate(() => {
    const skin = document.querySelector(".media-skin");
    const box = (el) => el.getBoundingClientRect();
    const docked = (rail) => [...skin.querySelectorAll(`.lightline-rail-${rail} > .lightline-panel:not([data-floating])`)];
    const lines = {};
    for (const rail of ["top", "bottom"]) {
      const rows = new Map();
      for (const p of docked(rail)) {
        const b = box(p);
        const key = Math.round(b.top);
        rows.set(key, [...(rows.get(key) ?? []), { id: p.dataset.panel, bottom: Math.round(b.bottom) }]);
      }
      lines[rail] = [...rows.values()].map((row) => ({ row, spread: Math.max(...row.map((p) => p.bottom)) - Math.min(...row.map((p) => p.bottom)) }));
    }
    const lastBottom = (rail) => {
      const ps = docked(rail);
      return ps.length ? Math.round(box(ps.at(-1)).bottom) : null;
    };
    const bar = Math.round(box(skin.querySelector(".video-controls-bottom")).bottom);
    const sides = { left: lastBottom("left"), right: lastBottom("right"), bar };
    const sideSpread = [sides.left, sides.right].filter((v) => v !== null);
    const timeline = skin.querySelector(".lightline-timeline");
    let fill = null;
    if (timeline) {
      const t = box(timeline);
      const strip = skin.querySelector(".lightline-timeline-strip");
      const tiles = [...strip.children].reduce((sum, el) => sum + box(el).width, 0);
      const svg = skin.querySelector(".lightline-timeline-wave svg");
      const panelBody = box(timeline.closest(".lightline-panel-body"));
      // The waveform's thinnest column, in pixels: the path's mirrored halves at their closest.
      let thinnest = null;
      if (svg) {
        const d = svg.querySelector("path").getAttribute("d").slice(1, -1).split("L").map((p) => p.split(",").map(Number));
        const half = d.length / 2;
        let min = 1;
        for (let i = 0; i < half; i++) min = Math.min(min, d[d.length - 1 - i][1] - d[i][1]);
        thinnest = +(min * box(svg).height).toFixed(2);
      }
      fill = {
        timeline: Math.round(t.width),
        bodyInner: Math.round(panelBody.width - 8),
        tiles: Math.round(tiles),
        wave: svg ? Math.round(box(svg).width) : null,
        thinnestWavePx: thinnest,
        waveHeight: svg ? Math.round(box(svg).height) : null,
      };
    }
    return { lines, sides, sideSpread: sideSpread.length === 2 ? Math.abs(sideSpread[0] - sideSpread[1]) : 0, fill, room: Math.round(box(skin).bottom), viewport: innerHeight };
  });
  const lineOk = Object.values(m.lines).every((rows) => rows.every((r) => r.spread <= 1));
  const sideOk = m.sideSpread <= 1 && [m.sides.left, m.sides.right].every((b) => b === null || Math.abs(b - m.sides.bar) <= 1);
  const fillOk = !m.fill || (Math.abs(m.fill.tiles - m.fill.timeline) <= 1 && (m.fill.wave === null || Math.abs(m.fill.wave - m.fill.timeline) <= 2) && (m.fill.thinnestWavePx ?? 1) >= 1);
  const ok = lineOk && sideOk && fillOk && !errors.length;
  const label = `${SIZE}${fullscreen ? "-fullscreen" : ""}-${tag}-${layout}`;
  await page.screenshot({ path: path.join(OUT, `${label}.png`) });
  results.push({ label, ok, lineOk, sideOk, fillOk, ...m, errors });
  console.log(label, ok ? "PASS" : "FAIL", JSON.stringify({ lines: m.lines, sides: m.sides, fill: m.fill }));
  await page.close();
}
fs.writeFileSync(path.join(OUT, `level-${SIZE}${fullscreen ? "-fullscreen" : ""}.json`), JSON.stringify(results, null, 1));
console.log(results.every((r) => r.ok) ? "ALL PASS" : "SOME FAIL");
await browser.close();
