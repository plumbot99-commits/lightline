// Lightline, the guide buttons in the bar and the timeline made readable (design/guides-bar-timeline.md): the Suite on
// the page or in the workbench's frame (as suite-fit has it), the film playing from a time. Records the bar (its
// controls, the guide pills in its middle or the guides button they fold into, whether anything leaves the bar or
// wraps it taller), the timeline (the strip and its tiles, the waveform, the ruler, the chapter marks, the playhead and
// its timecode, the panel's share of the screen) and the film's light past the frame (the container's shadow, the
// room's tint); a capture of the room and crops of the bar and the timeline beside them.
// LOOK=<file> picks the page's room (a looks.json entry's file) and waits for its loop.
// Usage: PORT=5330 node checks/suite-timeline.mjs <evidence-dir> <page|bench> <width> <height>
//          [--film=<id>] [--at=<seconds>] [--locale=<tag>] [--ambient=<off|low|medium|high>] [--fullscreen] [--paused]
//          [--forced] [--reduced] [--cinema] (Cinema instead, to see its light unchanged)
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const [OUT, WHERE = "page", W = "1920", H = "1080", ...flags] = process.argv.slice(2);
const flag = (name) => flags.find((f) => f.startsWith(`--${name}=`))?.split("=")[1];
const film = flag("film") ?? "rogue-render";
const at = Number(flag("at") ?? 20);
const locale = flag("locale");
const ambient = flag("ambient");
const full = flags.includes("--fullscreen");
const paused = flags.includes("--paused");
const forced = flags.includes("--forced");
const reduced = flags.includes("--reduced");
const cinema = flags.includes("--cinema");
const look = process.env.LOOK ? `-${process.env.LOOK.replace(/^.*\//, "").replace(/\.\w+$/, "")}` : "";
const tag = `${WHERE}-${W}x${H}${WHERE === "bench" ? `-${film}` : ""}${locale ? `-${locale}` : ""}${ambient ? `-ambient-${ambient}` : ""}${full ? "-fullscreen" : ""}${paused ? "-paused" : ""}${forced ? "-forced" : ""}${reduced ? "-reduced" : ""}${cinema ? "-cinema" : ""}${look}`;
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "msedge", args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({
  viewport: { width: Number(W), height: Number(H) },
  forcedColors: forced ? "active" : "none",
  reducedMotion: reduced ? "reduce" : "no-preference",
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && !/status of 404/.test(m.text()) && errors.push(m.text()));
page.on("response", (r) => r.status() >= 400 && !/favicon/.test(r.url()) && errors.push(`${r.status()} ${r.url()}`));
const port = process.env.PORT ?? (WHERE === "page" ? 5330 : 5331);
const url =
  WHERE === "page"
    ? `http://localhost:${port}/`
    : `http://localhost:${port}/preview.html#film=${film}&width=1360${locale ? `&locale=${locale}` : ""}`;
await page.goto(url, { waitUntil: "load" });
await page.evaluate(
  ({ ambient, cinema }) => {
    localStorage.setItem("lightline:suite", JSON.stringify({ mode: cinema ? "cinema" : "suite" }));
    if (ambient) localStorage.setItem("lightline:ambient", ambient);
  },
  { ambient, cinema }
);
if (process.env.LOOK) await page.evaluate((file) => localStorage.setItem("lightline-page:look", file), process.env.LOOK);
await page.reload({ waitUntil: "load" });
if (WHERE !== "page") await page.addStyleTag({ content: `.preview-player { max-width: none !important; }` });
await page.waitForFunction(() => document.querySelector("video:not(.lightline-room-loop)")?.readyState >= 1);
await page.waitForTimeout(1500);
const offered = await page.evaluate(() => !!document.querySelector(".media-skin"));
if (offered) await page.evaluate(() => document.querySelector(".media-skin").scrollIntoView({ block: "start" }));
if (offered && full) {
  await page.locator(".media-fullscreen-button").click();
  await page.waitForTimeout(1200);
}
// The film from a time, muted (the light needs it playing); paused, it holds there.
await page.evaluate(async ({ at, paused }) => {
  const v = document.querySelector("video:not(.lightline-room-loop)");
  v.muted = true;
  v.currentTime = at;
  await new Promise((done) => v.addEventListener("seeked", done, { once: true }));
  if (!paused) await v.play().catch(() => {});
}, { at, paused });
await page.waitForTimeout(process.env.LOOK ? 9000 : 3500);

const report = await page.evaluate(() => {
  const room = document.querySelector(".media-skin");
  if (!room) return { offered: false };
  const suite = room.dataset.layout === "suite";
  const r = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { left: Math.round(b.left), top: Math.round(b.top), width: Math.round(b.width), height: Math.round(b.height) };
  };
  const shown = (el) => {
    const b = el.getBoundingClientRect();
    return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== "hidden";
  };
  const video = room.querySelector("video:not(.lightline-room-loop)");

  // The bar: its row, every control in it in source order, and whether any leaves the row or the row wraps.
  const row = room.querySelector(".video-controls-row");
  const rowBox = row.getBoundingClientRect();
  const controls = [...row.querySelectorAll("button, label, .media-time-group")].filter((el) => shown(el) && !el.closest("[popover]"));
  const outside = controls
    .filter((el) => {
      const b = el.getBoundingClientRect();
      return b.left < rowBox.left - 0.5 || b.right > rowBox.right + 0.5 || b.top < rowBox.top - 0.5 || b.bottom > rowBox.bottom + 0.5;
    })
    .map((el) => el.getAttribute("aria-label") || el.textContent.trim().slice(0, 30));
  const tops = new Set(
    [...row.children].flatMap((g) => [...g.children]).filter(shown).map((el) => Math.round(el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2))
  );
  const pills = [...row.querySelectorAll(".lightline-bar-guide")].filter(shown);
  const guidesButton = row.querySelector(".lightline-bar-guides-button");
  const overlaps = [];
  const groups = [...row.querySelectorAll(":scope > *")].filter(shown);
  for (let i = 1; i < groups.length; i++) {
    const a = groups[i - 1].getBoundingClientRect();
    const b = groups[i].getBoundingClientRect();
    if (a.right > b.left + 0.5) overlaps.push([i - 1, i]);
  }
  const bar = {
    row: r(row),
    lines: tops.size,
    groups: groups.map((g) => ({ cls: g.className, ...r(g) })),
    overlaps,
    outside,
    pills: pills.map((p) => ({ text: p.textContent.trim(), pressed: p.querySelector("input")?.checked ?? p.getAttribute("aria-pressed"), ...r(p) })),
    guidesButton: guidesButton && shown(guidesButton) ? { label: guidesButton.getAttribute("aria-label") ?? guidesButton.textContent.trim(), ...r(guidesButton) } : null,
    tabOrder: [...row.querySelectorAll("button, input, [tabindex]")]
      .filter((el) => shown(el) && el.tabIndex >= 0 && !el.closest("[popover]"))
      .map((el) => el.getAttribute("aria-label") || el.closest("label")?.textContent.trim() || el.textContent.trim().slice(0, 24)),
  };

  // The timeline.
  const tl = room.querySelector(".lightline-timeline");
  const panel = tl?.closest(".lightline-panel");
  const strip = room.querySelector(".lightline-timeline-strip");
  const tiles = [...room.querySelectorAll(".lightline-timeline-tile")];
  const wave = room.querySelector(".lightline-timeline-wave");
  const ruler = room.querySelector(".lightline-timeline-ruler");
  const ticks = [...room.querySelectorAll(".lightline-timeline-tick")];
  const marks = [...room.querySelectorAll(".lightline-timeline-chapter")];
  const head = room.querySelector(".lightline-timeline-head");
  const headTime = room.querySelector(".lightline-timeline-time");
  const played = room.querySelector(".lightline-timeline-played");
  const timeline = tl && {
    panel: r(panel),
    panelTitle: panel?.querySelector(".lightline-panel-title")?.textContent,
    panelShareOfScreen: panel ? +(panel.getBoundingClientRect().height / innerHeight).toFixed(3) : null,
    panelScrolls: panel ? panel.querySelector(".lightline-panel-body").scrollHeight > panel.querySelector(".lightline-panel-body").clientHeight + 1 : null,
    timeline: r(tl),
    strip: r(strip),
    tiles: tiles.length,
    tile: r(tiles[0]),
    wave: r(wave),
    waveFill: wave?.querySelector("path") ? getComputedStyle(wave.querySelector("path")).fill : null,
    played: played ? { ...r(played), fill: getComputedStyle(played.querySelector("path") ?? played).fill } : null,
    ruler: r(ruler),
    ticks: ticks.map((t) => t.textContent.trim()).filter(Boolean),
    tickFont: ticks[0] ? getComputedStyle(ticks[0]).fontFamily : null,
    chapters: marks.map((m) => ({ text: m.textContent.trim(), ...r(m) })),
    chapterOverTiles: marks.some((m) => {
      const b = m.getBoundingClientRect();
      const s = strip?.getBoundingClientRect();
      const label = m.querySelector(".lightline-timeline-chapter-name")?.getBoundingClientRect();
      return s && label && label.bottom > s.top + 0.5 && label.top < s.bottom - 0.5 && b.width > 0;
    }),
    head: r(head),
    headTime: headTime ? { text: headTime.textContent, ...r(headTime) } : null,
    current: video?.currentTime,
  };

  // The film's light past the frame and on the room.
  const cs = getComputedStyle(room);
  const roomLight = room.querySelector(".lightline-room-light");
  const light = {
    ambient: room.dataset.ambient,
    containerShadow: cs.boxShadow,
    spill: cs.getPropertyValue("--lightline-spill").trim(),
    ambientColor: cs.getPropertyValue("--lightline-ambient").trim(),
    corner: cs.getPropertyValue("--lightline-room-tl").trim(),
    roomLight: roomLight ? { display: getComputedStyle(roomLight).display, opacity: getComputedStyle(roomLight).opacity } : null,
    hostRoomLight: cs.getPropertyValue("--lightline-room-light").trim() || null,
  };

  return {
    offered: true,
    suite,
    viewport: { width: innerWidth, height: innerHeight },
    room: r(room),
    under: room.hasAttribute("data-panels-under"),
    video: r(video),
    playing: video ? !video.paused : null,
    time: video?.currentTime,
    bar,
    timeline,
    light,
    scroll: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
  };
});

report.where = WHERE;
report.film = film;
report.locale = locale ?? null;
report.look = process.env.LOOK ?? null;
report.fullscreen = full;
report.errors = errors;
const b = report.bar;
report.ok =
  !!report.offered &&
  report.suite === !cinema &&
  !errors.length &&
  b.lines === 1 &&
  !b.outside.length &&
  !b.overlaps.length &&
  report.scroll.scrollWidth <= report.scroll.clientWidth;
fs.writeFileSync(path.join(OUT, `${tag}.json`), JSON.stringify(report, null, 2));
await page.screenshot({ path: path.join(OUT, `${tag}.png`) });
const clip = async (box, name, pad = 8) => {
  if (!box) return;
  const x = Math.max(0, box.left - pad);
  const y = Math.max(0, box.top - pad);
  await page.screenshot({
    path: path.join(OUT, `${tag}-${name}.png`),
    clip: { x, y, width: Math.min(Number(W) - x, box.width + 2 * pad), height: Math.min(Number(H) - y, box.height + 2 * pad) },
  });
};
if (report.offered) {
  await clip(report.bar.row, "bar");
  await clip(report.timeline?.panel, "timeline");
}
// Folded, the Guides menu opened from the keyboard, with one guide turned on from it.
if (report.bar?.guidesButton) {
  await page.locator(".lightline-bar-guides-button").focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");
  await page.waitForTimeout(300);
  report.menu = await page.evaluate(() => ({
    focus: document.activeElement?.textContent,
    items: [...document.querySelectorAll(".lightline-guides-menu [role=menuitemcheckbox]")].map((i) => `${i.textContent} ${i.getAttribute("aria-checked")}`),
    lines: document.querySelectorAll(".lightline-guides-line line").length,
  }));
  fs.writeFileSync(path.join(OUT, `${tag}.json`), JSON.stringify(report, null, 2));
  await page.screenshot({ path: path.join(OUT, `${tag}-menu.png`) });
  console.log("menu", JSON.stringify(report.menu));
}
console.log(tag, report.ok ? "ok" : "FAIL", JSON.stringify({ bar: { lines: b?.lines, outside: b?.outside, overlaps: b?.overlaps, pills: b?.pills.length, guidesButton: !!b?.guidesButton }, light: report.light, errors }));
await browser.close();
