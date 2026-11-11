// Lightline part 3: the Audio Lab, measured. Taps the lab's graph from outside (an init script wraps
// createMediaElementSource and connect, so the skin carries no test hooks) and reads analysers on the film's own
// sound: before the lab (the element's source) and after it (the node that feeds the speakers). Usage:
//   node checks/audio-lab.mjs <evidence-dir> [film] [--scan]
// film is a workbench film id (default the-only-one-that-fits). --scan plays the whole film at 4x first to
// find its loudest four seconds, the worst case for peaks. --firefox runs it in Playwright's Firefox instead of Edge.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium, firefox } = require("playwright");

const OUT = process.argv[2];
const FILM = process.argv.slice(3).find((a) => !a.startsWith("--")) ?? "the-only-one-that-fits";
const SCAN = process.argv.includes("--scan");
const FIREFOX = process.argv.includes("--firefox");
fs.mkdirSync(OUT, { recursive: true });
const BASE = `http://localhost:${process.env.PORT ?? 5180}/preview.html`;
// A lit stretch of each film for the spectrum (the record's part 2 windows), and the default loud window.
const WINDOW = { "the-only-one-that-fits": 60, "rogue-render": 5, "likeness-models": 5 };
const report = { at: new Date().toString(), film: FILM, browser: FIREFOX ? "firefox" : "msedge", console: [] };

const browser = FIREFOX ? await firefox.launch() : await chromium.launch({ channel: "msedge" });
process.on("unhandledRejection", (e) => {
  fs.writeFileSync(path.join(OUT, `audio-${FILM}.partial.json`), JSON.stringify({ ...report, error: String(e) }, null, 2));
  console.log(String(e).split(String.fromCharCode(10))[0]);
  console.log(JSON.stringify(report).slice(0, 3000));
  process.exit(1);
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => {
  const tap = (window.__lab = { made: 0, ctx: null, source: null, out: null });
  const make = AudioContext.prototype.createMediaElementSource;
  AudioContext.prototype.createMediaElementSource = function (element) {
    const node = make.call(this, element);
    tap.made++;
    tap.ctx = this;
    tap.source = node;
    return node;
  };
  const Ctx = window.AudioContext;
  window.__contexts = 0;
  window.AudioContext = class extends Ctx {
    constructor(...args) {
      super(...args);
      window.__contexts++;
    }
  };
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (destination, ...rest) {
    if (destination instanceof AudioDestinationNode) tap.out = this;
    return connect.call(this, destination, ...rest);
  };
});
const page = await context.newPage();
page.setDefaultTimeout(20000);
page.on("console", (m) => m.type() === "error" && report.console.push(`${m.text()} ${m.location()?.url ?? ""}`));
page.on("pageerror", (e) => report.console.push(`page error ${e}`));
page.on("response", (r) => r.status() >= 400 && report.console.push(`${r.status()} ${r.url()}`));

await page.goto(`${BASE}#film=${FILM}&width=960&ratio=16:9&scheme=dark`, { waitUntil: "load" });
await page.waitForSelector("video");
await page.evaluate(
  () =>
    new Promise((r) => {
      const v = document.querySelector("video");
      v.readyState >= 1 ? r() : v.addEventListener("loadedmetadata", r, { once: true });
    })
);
await page.waitForTimeout(500);

report.beforeGesture = await page.evaluate(() => ({
  contexts: window.__contexts,
  routed: window.__lab.made,
  src: document.querySelector("video").currentSrc.slice(0, 5),
  button: !!document.querySelector(".lightline-lab-button"),
}));

// A real click: the lab opens and builds its graph inside the gesture.
await page.click(".lightline-lab-button");
await page.waitForFunction(() => window.__lab.ctx?.state === "running" && window.__lab.out);
report.afterOpen = await page.evaluate(() => ({
  contexts: window.__contexts,
  routed: window.__lab.made,
  state: window.__lab.ctx.state,
  sampleRate: window.__lab.ctx.sampleRate,
  open: document.querySelector(".lightline-lab").matches(":popover-open"),
  focus: document.activeElement?.closest(".lightline-lab") ? document.activeElement.outerHTML.slice(0, 80) : null,
}));

await page.evaluate(() => {
  const { ctx, source, out } = window.__lab;
  const pair = (node) => {
    const split = ctx.createChannelSplitter(2);
    node.connect(split);
    return [0, 1].map((side) => {
      const a = ctx.createAnalyser();
      a.fftSize = 8192;
      a.smoothingTimeConstant = 0;
      split.connect(a, side);
      return a;
    });
  };
  const taps = { in: pair(source), out: pair(out) };
  // Left minus right and the mono sum, formed in the graph so the two sides are sample-aligned.
  const formed = (sign) => {
    const split = ctx.createChannelSplitter(2);
    const left = ctx.createGain();
    const right = ctx.createGain();
    right.gain.value = sign;
    const sum = ctx.createGain();
    sum.channelCount = 1;
    sum.channelCountMode = "explicit";
    out.connect(split);
    split.connect(left, 0).connect(sum);
    split.connect(right, 1).connect(sum);
    const a = ctx.createAnalyser();
    a.fftSize = 8192;
    sum.connect(a);
    return a;
  };
  const diffTap = formed(-1);
  const sumTap = formed(1);
  const BANDS = [60, 250, 1000, 4000, 12000];
  /** Levels and the spectrum, in and out, over `ms` of whatever is playing. */
  window.__measure = (ms) =>
    new Promise((done) => {
      const n = 8192;
      const t = new Float32Array(n);
      const f = new Float32Array(n / 2);
      const short = { in: [], out: [] };
      const acc = { in: [0, 0], out: [0, 0], peakIn: [0, 0], peakOut: [0, 0], diff: 0, sumOut: 0, frames: 0 };
      const power = { in: new Float64Array(n / 2), out: new Float64Array(n / 2) };
      const stop = performance.now() + ms;
      const step = () => {
        const sides = {};
        for (const where of ["in", "out"]) {
          sides[where] = taps[where].map((a, side) => {
            a.getFloatTimeDomainData(t);
            let sum = 0;
            let peak = 0;
            for (const s of t) {
              sum += s * s;
              peak = Math.max(peak, Math.abs(s));
            }
            acc[where][side] += sum / n;
            const key = where === "in" ? "peakIn" : "peakOut";
            acc[key][side] = Math.max(acc[key][side], peak);
            a.getFloatFrequencyData(f);
            for (let i = 0; i < f.length; i++) power[where][i] += 10 ** (f[i] / 10);
            return Float32Array.from(t);
          });
        }
        for (const where of ["in", "out"]) {
          let e = 0;
          for (const side of sides[where]) for (const s of side) e += s * s;
          short[where].push(10 * Math.log10(e / (2 * n) + 1e-12));
        }
        // Left minus right, and the mono sum (halved), after the lab.
        const ms = (a, scale) => {
          a.getFloatTimeDomainData(t);
          let e = 0;
          for (const s of t) e += (s * scale) ** 2;
          return e / n;
        };
        acc.diff += ms(diffTap, 1);
        acc.sumOut += ms(sumTap, 0.5);
        acc.frames++;
        if (performance.now() < stop) setTimeout(step, 50);
        else finish();
      };
      const db = (x) => (x > 0 ? +(10 * Math.log10(x)).toFixed(2) : -Infinity);
      const finish = () => {
        const k = acc.frames;
        const binHz = ctx.sampleRate / n;
        const band = (where, hz) => {
          let p = 0;
          let c = 0;
          for (let i = Math.floor(hz / 2 ** (1 / 6) / binHz); i <= Math.ceil((hz * 2 ** (1 / 6)) / binHz); i++) {
            p += power[where][i];
            c++;
          }
          return p / c / k;
        };
        const range = (list) => {
          const sorted = [...list].sort((a, b) => a - b);
          const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
          return { p10: +at(0.1).toFixed(2), p95: +at(0.95).toFixed(2), range: +(at(0.95) - at(0.1)).toFixed(2) };
        };
        done({
          frames: k,
          rangeIn: range(short.in),
          rangeOut: range(short.out),
          rmsInDb: [0, 1].map((s) => db(acc.in[s] / k)),
          rmsOutDb: [0, 1].map((s) => db(acc.out[s] / k)),
          levelChangeDb: +(db((acc.out[0] + acc.out[1]) / k) - db((acc.in[0] + acc.in[1]) / k)).toFixed(2),
          peakIn: acc.peakIn.map((p) => +p.toFixed(4)),
          peakOut: acc.peakOut.map((p) => +p.toFixed(4)),
          leftMinusRightDb: db(acc.diff / k),
          monoSumDb: db(acc.sumOut / k),
          bandsOutMinusInDb: Object.fromEntries(BANDS.map((hz) => [hz, +(db(band("out", hz)) - db(band("in", hz))).toFixed(2)])),
        });
      };
      step();
    });
});

// What each preset should do at the five bands: the filters' own response there plus the level trim, computed
// the way the engine does (the same biquads on an offline context, the trim over a log-spaced spectrum).
const GAINS = { Flat: [0, 0, 0, 0, 0], Cinema: [5, 1, 0, 2, 3], Dialogue: [-6, -2, 3, 4, -2], Music: [4, -1, -2, 1, 4], "Late Night": [-3, 0, 2, 2, 0] };
report.expected = await page.evaluate((GAINS) => {
  const rate = window.__lab.ctx.sampleRate;
  const off = new OfflineAudioContext(1, 1, rate);
  const types = ["lowshelf", "peaking", "peaking", "peaking", "highshelf"];
  const bands = [60, 250, 1000, 4000, 12000];
  const response = (gains, freqs) => {
    const total = new Float32Array(freqs.length);
    const mag = new Float32Array(freqs.length);
    const ph = new Float32Array(freqs.length);
    bands.forEach((hz, i) => {
      const f = new BiquadFilterNode(off, { type: types[i], frequency: hz, Q: 1, gain: gains[i] });
      f.getFrequencyResponse(freqs, mag, ph);
      for (let j = 0; j < freqs.length; j++) total[j] += 20 * Math.log10(mag[j]);
    });
    return total;
  };
  const log = Float32Array.from({ length: 64 }, (_, i) => 20 * 1000 ** (i / 63));
  return Object.fromEntries(
    Object.entries(GAINS).map(([name, gains]) => {
      const curve = response(gains, log);
      // The owner's rule: min(0, the curve's loudness change), only ever downward.
      const trim = Math.min(0, 10 * Math.log10(curve.reduce((s, db) => s + 10 ** (db / 10), 0) / curve.length));
      const at = response(gains, Float32Array.from(bands));
      return [name, { trimDb: +trim.toFixed(2), bands: Object.fromEntries(bands.map((hz, i) => [hz, +(at[i] + trim).toFixed(2)])) }];
    })
  );
}, GAINS);

const media = (fn, arg) => page.evaluate(fn, arg);
const playFrom = async (at, rate = 1) => {
  await media(
    async ({ at, rate }) => {
      const v = document.querySelector("video");
      v.pause();
      v.playbackRate = rate;
      v.currentTime = at;
      await new Promise((r) => v.addEventListener("seeked", r, { once: true }));
      await v.play();
    },
    { at, rate }
  );
  await page.waitForTimeout(400);
};
const pause = () => media(() => document.querySelector("video").pause());
const measure = (ms) => page.evaluate((ms) => window.__measure(ms), ms);
const chip = (name) => page.locator(".lightline-lab-chip", { hasText: new RegExp(`^${name}$`) }).click();

await media(() => {
  const v = document.querySelector("video");
  v.muted = false;
  v.volume = 1;
});

if (SCAN) {
  // Per-second input peaks over the whole film at 4x: the loudest four seconds is the peak test.
  const duration = await media(() => document.querySelector("video").duration);
  await playFrom(0, 4);
  const peaks = [];
  for (let s = 0; s < duration / 4 - 0.5; s++) {
    const m = await measure(1000);
    peaks.push({ at: Math.round(s * 4), peak: Math.max(...m.peakIn) });
  }
  await pause();
  peaks.sort((a, b) => b.peak - a.peak);
  report.scan = peaks.slice(0, 5);
}
const loud = report.scan?.[0]?.at ?? WINDOW[FILM];
const lit = WINDOW[FILM];
report.windows = { lit, loud };

// Sound flows through the lab: Flat, Stereo, centered.
await playFrom(lit);
report.flows = await measure(2000);

report.presets = {};
// Stretches with quiet and loud in them, for Late Night's evening: the song's intro into its first verse, and the
// short film's opening.
const RANGE = { "the-only-one-that-fits": 4, "rogue-render": 0, "likeness-models": 0 };
for (const name of ["Flat", "Cinema", "Dialogue", "Music", "Late Night"]) {
  report.presets[name] = {};
  await chip(name);
  await playFrom(lit);
  const spectrum = await measure(4000);
  await playFrom(loud);
  const peak = await measure(4000);
  if (name === "Flat" || name === "Late Night") {
    await playFrom(RANGE[FILM]);
    const r = await measure(12000);
    report.presets[name].range = { in: r.rangeIn, out: r.rangeOut, levelChangeDb: r.levelChangeDb, peakOut: r.peakOut };
  }
  report.presets[name] = { ...report.presets[name], spectrum, loudWindow: { peakOut: peak.peakOut, peakIn: peak.peakIn, levelChangeDb: peak.levelChangeDb } };
}
await chip("Flat");

// The owner's test: a cut at 1 kHz must lower the output, a boost must raise it. By keyboard on the 1 kHz node,
// 6 dB each way, against Flat on the same stretch.
const node = page.locator(".lightline-lab-node").nth(2);
report.oneK = {};
await playFrom(lit);
report.oneK.flat = (await measure(4000)).levelChangeDb;
for (const [name, key] of [["cut", "ArrowDown"], ["boost", "ArrowUp"]]) {
  await node.focus();
  await page.keyboard.press("Home");
  for (let i = 0; i < 6; i++) await page.keyboard.press(key);
  report.oneK[`${name}Node`] = await node.evaluate((el) => el.getAttribute("aria-valuetext"));
  await playFrom(lit);
  const m = await measure(4000);
  report.oneK[name] = m.levelChangeDb;
  report.oneK[`${name}Band`] = m.bandsOutMinusInDb[1000];
  report.oneK[`${name}Peak`] = m.peakOut;
}
await node.focus();
await page.keyboard.press("Home");
report.oneK.presetAfterHome = await page.evaluate(() => document.querySelector(".lightline-lab-chip input:checked")?.value);
await chip("Flat");

report.outputs = {};
for (const name of ["Stereo", "Mono", "Wide"]) {
  await chip(name);
  await playFrom(lit);
  report.outputs[name] = await measure(3000);
}
await chip("Stereo");

// The balance at either end, by keyboard: Home is all left, End all right.
const balance = page.locator(".lightline-lab-balance");
report.balance = {};
await playFrom(lit);
await balance.focus();
await page.keyboard.press("Home");
await page.waitForTimeout(800);
report.balance.left = await measure(1500);
await page.keyboard.press("End");
await page.waitForTimeout(800);
report.balance.right = await measure(1500);
for (let i = 0; i < 20; i++) await page.keyboard.press("ArrowLeft");
report.balance.back = await balance.evaluate((el) => ({ value: el.value, text: el.getAttribute("aria-valuetext") }));
await pause();

// The pings, with the film paused: each must come out of the side it names, quietly.
report.pings = {};
await page.waitForTimeout(500);
for (const side of ["L", "R"]) {
  const measuring = measure(700);
  await page.locator(".lightline-lab-test", { hasText: `Test ${side}` }).click();
  report.pings[side] = await measuring;
  await page.waitForTimeout(300);
}

// Volume and mute with the lab on: the same stretch at full volume, at half, and muted from the bar's button.
report.volume = {};
await playFrom(lit);
report.volume.full = await measure(2000);
await media(() => (document.querySelector("video").volume = 0.5));
await playFrom(lit);
report.volume.half = await measure(2000);
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
report.afterEscape = await page.evaluate(() => ({
  open: document.querySelector(".lightline-lab").matches(":popover-open"),
  focus: document.activeElement?.className ?? null,
}));
report.volume.mutedBefore = await media(() => document.querySelector("video").muted);
await page.hover(".media-skin", { position: { x: 200, y: 100 } });
await page.locator(".media-mute-button").first().click();
await playFrom(lit);
report.volume.muted = await measure(2000);
report.volume.mutedState = await media(() => document.querySelector("video").muted);
await page.hover(".media-skin", { position: { x: 220, y: 100 } });
await page.locator(".media-mute-button").first().click();
report.volume.unmutedAgain = await media(() => !document.querySelector("video").muted);
await media(() => (document.querySelector("video").volume = 1));
await pause();

fs.writeFileSync(path.join(OUT, `audio-${FILM}${FIREFOX ? "-firefox" : ""}.json`), JSON.stringify(report, null, 2));
await browser.close();

const p = report.presets;
console.log(`${FILM}: before gesture contexts=${report.beforeGesture.contexts} routed=${report.beforeGesture.routed} src=${report.beforeGesture.src} button=${report.beforeGesture.button}`);
console.log(`after open: ${JSON.stringify(report.afterOpen)}`);
console.log(`flows: out ${report.flows.rmsOutDb} dB, change ${report.flows.levelChangeDb} dB, peaks ${report.flows.peakOut}`);
for (const [name, r] of Object.entries(p))
  console.log(`${name.padEnd(10)} expected ${JSON.stringify(report.expected[name].bands)} ${r.range ? `range in ${r.range.in.range} out ${r.range.out.range} change ${r.range.levelChangeDb} peak ${r.range.peakOut} | ` : ""}bands ${JSON.stringify(r.spectrum.bandsOutMinusInDb)} change ${r.spectrum.levelChangeDb} | loud: change ${r.loudWindow.levelChangeDb} peakIn ${r.loudWindow.peakIn} peakOut ${r.loudWindow.peakOut}`);
console.log(`1 kHz: flat ${report.oneK.flat} dB | cut (${report.oneK.cutNode}) ${report.oneK.cut} dB, band ${report.oneK.cutBand} | boost (${report.oneK.boostNode}) ${report.oneK.boost} dB, band ${report.oneK.boostBand}, peak ${report.oneK.boostPeak} | after Home: ${report.oneK.presetAfterHome}`);
for (const [name, r] of Object.entries(report.outputs))
  console.log(`${name.padEnd(7)} L-R ${r.leftMinusRightDb} dB, L ${r.rmsOutDb[0]} R ${r.rmsOutDb[1]}, mono sum ${r.monoSumDb}, change ${r.levelChangeDb}`);
console.log(`balance left: L ${report.balance.left.rmsOutDb[0]} R ${report.balance.left.rmsOutDb[1]} | right: L ${report.balance.right.rmsOutDb[0]} R ${report.balance.right.rmsOutDb[1]} | back ${JSON.stringify(report.balance.back)}`);
for (const [side, r] of Object.entries(report.pings)) console.log(`ping ${side}: peak L ${r.peakOut[0]} R ${r.peakOut[1]}`);
console.log(`volume full ${report.volume.full.rmsOutDb} half ${report.volume.half.rmsOutDb} muted ${report.volume.muted.rmsOutDb} (muted before=${report.volume.mutedBefore} after click=${report.volume.mutedState} unmuted again=${report.volume.unmutedAgain}) peak ${report.volume.muted.peakOut}`);
console.log(`escape: ${JSON.stringify(report.afterEscape)}`);
if (report.scan) console.log(`scan: ${JSON.stringify(report.scan)}`);
console.log(`console: ${report.console.length ? report.console.join(" | ") : "none"}`);
