// Lightline, the Suite gives the film its width (design/layout.md): the film's size in the Suite at a viewport's size,
// on the page or in the workbench's frame (as suite-fit has it: preview.html, the player's cap lifted), with the
// default layout or the owner's (Guides and Timecode on the left, Stream and the Audio Lab on the right). Records the
// room, the film as drawn (the video letterboxed to the film's shape), which rail each panel shows on, and whether the
// page scrolls sideways; a capture beside it.
// LOOK=<file> picks the page's room (a looks.json entry's file) and waits for its loop; INJECT=<css> adds a style.
// Usage: PORT=5296 node checks/suite-width.mjs <evidence-dir> <page|bench> <width> <height> [--his] [--fullscreen]
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const [OUT, WHERE = "page", W = "1920", H = "1080", ...flags] = process.argv.slice(2);
const his = flags.includes("--his");
const full = flags.includes("--fullscreen");
const look = process.env.LOOK ? `-${process.env.LOOK.replace(/^.*\//, "").replace(/\.\w+$/, "")}` : "";
const tag = `${WHERE}-${W}x${H}${his ? "-his" : ""}${full ? "-fullscreen" : ""}${look}`;
fs.mkdirSync(OUT, { recursive: true });

const HIS = {
  guides: { rail: "left", order: 0, float: null, open: true },
  deck: { rail: "left", order: 1, float: null, open: true },
  telemetry: { rail: "right", order: 0, float: null, open: true },
  lab: { rail: "right", order: 1, float: null, open: true },
};

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: Number(W), height: Number(H) } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && !/status of 404/.test(m.text()) && errors.push(m.text()));
page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
const port = process.env.PORT ?? (WHERE === "page" ? 5296 : 5288);
const url = WHERE === "page" ? `http://localhost:${port}/` : `http://localhost:${port}/preview.html#film=rogue-render&width=1360`;
await page.goto(url, { waitUntil: "load" });
await page.evaluate((panels) => {
  const layout = { mode: "suite", panels: panels ?? undefined };
  if (!panels) delete layout.panels;
  localStorage.setItem("lightline:suite", JSON.stringify(layout));
}, his ? HIS : null);
if (process.env.LOOK) await page.evaluate((file) => localStorage.setItem("lightline-page:look", file), process.env.LOOK);
await page.reload({ waitUntil: "load" });
if (process.env.INJECT) await page.addStyleTag({ content: process.env.INJECT });
if (WHERE !== "page") await page.addStyleTag({ content: `.preview-player { max-width: none !important; }` });
await page.waitForFunction(() => document.querySelector("video")?.readyState >= 1);
await page.waitForTimeout(1500);
const offered = await page.evaluate(() => !!document.querySelector('[data-layout="suite"]'));
if (offered) await page.evaluate(() => document.querySelector('[data-layout="suite"]').scrollIntoView({ block: "start" }));
if (offered && full) {
  await page.locator(".media-fullscreen-button").click();
  await page.waitForTimeout(1200);
}
await page.waitForTimeout(process.env.LOOK ? 9000 : 600);

const report = await page.evaluate(() => {
  const room = document.querySelector('[data-layout="suite"]');
  const scroll = { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth };
  if (!room) return { offered: false, scroll };
  const r = (el) => {
    const b = el.getBoundingClientRect();
    return { left: Math.round(b.left), top: Math.round(b.top), width: Math.round(b.width), height: Math.round(b.height) };
  };
  // The film as drawn: the video's box, letterboxed to the film's own shape.
  const video = room.querySelector("video:not(.lightline-room-loop)");
  const box = video.getBoundingClientRect();
  const shape = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
  const fw = Math.min(box.width, box.height * shape);
  const film = { width: Math.round(fw), height: Math.round(fw / shape) };
  const rails = Object.fromEntries(
    [...room.querySelectorAll(":scope > .lightline-rail")].map((rail) => [
      rail.dataset.rail,
      [...rail.querySelectorAll(":scope > .lightline-panel")].map((p) => p.dataset.panel),
    ])
  );
  return {
    offered: true,
    room: r(room),
    video: r(video),
    film,
    rails,
    under: room.hasAttribute("data-panels-under"),
    // The panels as drawn, and whether any spills out of its rail or the room.
    panels: [...room.querySelectorAll(".lightline-panel")].map((p) => ({ panel: p.dataset.panel, ...r(p) })),
    spills: [...room.querySelectorAll(":scope > .lightline-rail")].some((rail) => rail.scrollWidth > rail.clientWidth + 1) ||
      [...room.querySelectorAll(".lightline-panel")].some((p) => {
        const b = p.getBoundingClientRect();
        const o = room.getBoundingClientRect();
        return b.left < o.left - 0.5 || b.right > o.right + 0.5 || b.bottom > o.bottom + 0.5;
      }),
    roomInView: room.getBoundingClientRect().height <= innerHeight + 0.5,
    scroll,
    sideways: scroll.scrollWidth > scroll.clientWidth,
  };
});
await page.screenshot({ path: path.join(OUT, `${tag}.png`) });
const out = { where: WHERE, viewport: { width: Number(W), height: Number(H) }, his, fullscreen: full, ...report, errors };
fs.writeFileSync(path.join(OUT, `${tag}.json`), JSON.stringify(out, null, 2));
console.log(
  tag,
  report.offered
    ? `room ${report.room.width}x${report.room.height} film ${report.film.width}x${report.film.height} under=${report.under} spills=${report.spills} inView=${report.roomInView} sideways=${report.sideways} rails=${JSON.stringify(report.rails)}`
    : `no Suite (sideways=${report.scroll.scrollWidth > report.scroll.clientWidth})`,
  errors.length ? errors : ""
);
await browser.close();
