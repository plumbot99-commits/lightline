// Lightline, the states' own colors (design/states.md). The words the paused and ended states color, against the
// lightest pixel behind them, as checks/suite-glass.mjs measures the glass: the words hidden, the ground read, each
// word's color against its lightest pixel. Paused is measured at a frame every --step seconds through the whole film
// (the film can be paused anywhere), each word kept at its worst frame; ended at the film's end. In the workbench
// (the default) all three films, in Cinema; with --page on the page's dev server, its first film in Cinema or, with
// --suite, in the Suite over the room --look names, and the library card's state as well.
// Usage: PORT=5301 node checks/state-colors.mjs <evidence-dir> [width] [--step=<seconds>]
//        PORT=5302 node checks/state-colors.mjs <evidence-dir> [width] --page [--suite] [--look=<file>] [--step=<seconds>]
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const [OUT, W = "1440", ...flags] = process.argv.slice(2);
const width = Number(W);
const flag = (name) => flags.find((f) => f.startsWith(`--${name}=`))?.split("=")[1];
const onPage = flags.includes("--page");
const suite = flags.includes("--suite");
const look = flag("look") ?? "";
const step = Number(flag("step") ?? 1);
const FILMS = onPage ? [null] : ["rogue-render", "the-only-one-that-fits", "likeness-models"];
const tag = `${onPage ? "page" : "workbench"}-${W}${suite ? "-suite" : ""}${look ? `-${look.replace(/\.\w+$/, "").replace(/\//g, "-")}` : ""}`;
fs.mkdirSync(OUT, { recursive: true });

const FILM = "video:not(.lightline-room-loop)";
const browser = await chromium.launch({ channel: "msedge" });
const report = { tag, at: new Date().toString(), step, films: [] };

for (const film of FILMS) {
  const page = await browser.newPage({ viewport: { width, height: width >= 1000 ? (suite ? 1080 : 900) : 844 } });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on("console", (m) => m.type() === "error" && !m.location().url?.endsWith("/favicon.ico") && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  if (onPage) {
    await page.addInitScript((look) => {
      localStorage.setItem("lightline-page:look", look);
      localStorage.removeItem("lightline:suite");
    }, look);
    await page.goto(`http://localhost:${process.env.PORT ?? 5302}/`, { waitUntil: "load" });
  } else {
    await page.goto(`http://localhost:${process.env.PORT ?? 5180}/preview.html#film=${film}&ratio=16:9&scheme=dark${width >= 1000 ? "&width=1200" : ""}`, { waitUntil: "load" });
  }
  await page.waitForSelector(FILM);
  await page.locator(".media-skin").scrollIntoViewIfNeeded();
  if (suite) {
    await page.locator(".lightline-layout-option", { hasText: "Suite" }).click();
    await page.waitForFunction(() => document.querySelector(".media-skin")?.dataset.layout === "suite");
    await page.waitForTimeout(800);
  }
  const duration = await page.evaluate(async (sel) => {
    const v = document.querySelector(sel);
    v.muted = true;
    await v.play();
    await new Promise((r) => setTimeout(r, 600));
    v.pause();
    return v.duration;
  }, FILM);

  // The state's words in the player (the pill) and, on the page, the card's. Their rects, with their color.
  const words = () => page.evaluate(() => {
    const out = [];
    for (const [scope, el] of [["pill", document.querySelector(".lightline-state-pill")], ["card", document.querySelector(".page-card-playing")]]) {
      if (!el || getComputedStyle(el).display === "none") continue;
      const range = document.createRange();
      range.selectNodeContents(el);
      for (const r of range.getClientRects()) {
        if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) continue;
        out.push({ scope, text: el.textContent.trim(), state: el.dataset.state, color: getComputedStyle(el).color, x: r.x, y: r.y, w: r.width, h: r.height });
      }
    }
    return out;
  });
  const HIDE = `.lightline-state-pill, .page-card-playing { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; }`;
  const hide = () => page.evaluate((css) => document.head.append(Object.assign(document.createElement("style"), { id: "hide-state-words", textContent: css })), HIDE);
  const show = () => page.evaluate(() => document.getElementById("hide-state-words")?.remove());

  // Each word's color against the lightest pixel behind it (WCAG luminance), from a screenshot with the words hidden.
  const measure = async (ws) => {
    const bare = (await page.screenshot()).toString("base64");
    return page.evaluate(async ({ bare, ws }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${bare}`;
      await img.decode();
      const c = Object.assign(document.createElement("canvas"), { width: img.width, height: img.height });
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const scale = img.width / innerWidth;
      const lin = (x) => ((x /= 255) <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
      const L = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      return ws.map((w) => {
        const x0 = Math.max(0, Math.floor(w.x * scale));
        const y0 = Math.max(0, Math.floor(w.y * scale));
        const x1 = Math.min(img.width, Math.ceil((w.x + w.w) * scale));
        const y1 = Math.min(img.height, Math.ceil((w.y + w.h) * scale));
        const d = ctx.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data;
        let max = 0;
        let at = [0, 0, 0];
        for (let i = 0; i < d.length; i += 4) {
          const l = L(d[i], d[i + 1], d[i + 2]);
          if (l > max) [max, at] = [l, [d[i], d[i + 1], d[i + 2]]];
        }
        const m = w.color.match(/[\d.]+/g).map(Number);
        const lt = L(m[0], m[1], m[2]);
        return { scope: w.scope, text: w.text, color: w.color, behind: `rgb(${at.join(" ")})`, ratio: +((Math.max(lt, max) + 0.05) / (Math.min(lt, max) + 0.05)).toFixed(2) };
      });
    }, { bare, ws });
  };
  const keepWorst = (worst, got, extra) => {
    for (const r of got) {
      const k = `${r.scope}:${r.text}`;
      if (!worst[k] || r.ratio < worst[k].ratio) worst[k] = { ...r, ...extra };
    }
  };
  // The page's card sits below the player: scrolled to, measured, and back to the player.
  const card = async (worst) => {
    if (!onPage) return;
    await page.locator(".page-card-playing").first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const ws = (await words()).filter((w) => w.scope === "card");
    await hide();
    keepWorst(worst, await measure(ws), {});
    await show();
    await page.locator(".media-skin").scrollIntoViewIfNeeded();
  };

  // Paused, at a frame every `step` seconds through the film.
  const paused = {};
  let frames = 0;
  for (let t = 0.25; t < duration - 0.25; t += step) {
    await page.evaluate(async ([sel, t]) => {
      const v = document.querySelector(sel);
      v.currentTime = t;
      await new Promise((r) => v.addEventListener("seeked", r, { once: true }));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }, [FILM, t]);
    await page.waitForFunction(() => document.querySelector(".lightline-state-pill")?.dataset.state === "paused", null, { timeout: 10000 });
    const ws = await words();
    await hide();
    keepWorst(paused, await measure(ws), { t: +t.toFixed(2) });
    await show();
    frames++;
  }
  await card(paused);

  // Ended: from a little before the end, played out; on the page, Up Next cancelled by keyboard so the film holds.
  await page.evaluate(async ([sel, d]) => {
    const v = document.querySelector(sel);
    v.currentTime = Math.max(0, d - 2.5);
    await v.play();
  }, [FILM, duration]);
  if (onPage) {
    await page.waitForSelector(".lightline-up-next", { state: "attached", timeout: 15000 });
    await page.locator(".lightline-up-next-cancel").focus();
    await page.keyboard.press("Enter");
  }
  await page.waitForFunction((sel) => document.querySelector(sel).ended, FILM, { timeout: 15000 });
  await page.waitForTimeout(1600);
  const ended = {};
  const ws = await words();
  await hide();
  keepWorst(ended, await measure(ws), {});
  await show();
  await card(ended);
  await page.screenshot({ path: path.join(OUT, `${tag}${film ? `-${film}` : ""}-ended.png`) });

  report.films.push({ film: film ?? "the page's first", duration: +duration.toFixed(2), frames, paused: Object.values(paused), ended: Object.values(ended), errors });
  await page.close();
}

const all = report.films.flatMap((f) => [...f.paused, ...f.ended].map((r) => ({ film: f.film, ...r })));
report.minimum = all.reduce((m, r) => (r.ratio < m.ratio ? r : m), { ratio: Infinity });
report.under45 = all.filter((r) => r.ratio < 4.5);
report.ok = report.under45.length === 0 && report.films.every((f) => f.errors.length === 0 && f.paused.length && f.ended.length);
fs.writeFileSync(path.join(OUT, `${tag}.json`), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
await browser.close();
process.exit(report.ok ? 0 : 1);
