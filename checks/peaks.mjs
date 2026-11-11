// Lightline part 4: the waveform's peaks, computed once per film from the master Mux holds, so the timing matches.
// ffmpeg decodes the sound to 32-bit float at 8 kHz, keeping its channels; each bucket of 1/RATE seconds keeps the
// largest absolute sample of any channel, 0 to 1, three decimals. A film without sound gets a flat line, said so.
// Usage: node checks/peaks.mjs <master.mp4> <out.json>
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const [SRC, OUT] = process.argv.slice(2);
const RATE = 20;
const HZ = 8000;

const probe = JSON.parse(
  spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,channels,r_frame_rate", "-of", "json", SRC], { encoding: "utf8" }).stdout,
);
const duration = Number(probe.format.duration);
const audio = probe.streams.find((s) => s.codec_type === "audio");
const video = probe.streams.find((s) => s.codec_type === "video");
const buckets = Math.ceil(duration * RATE);
const peaks = new Array(buckets).fill(0);

if (audio) {
  const channels = audio.channels;
  const run = spawnSync("ffmpeg", ["-v", "error", "-i", SRC, "-vn", "-ar", String(HZ), "-f", "f32le", "-acodec", "pcm_f32le", "-"], { maxBuffer: 1 << 30 });
  const pcm = new Float32Array(run.stdout.buffer, run.stdout.byteOffset, run.stdout.byteLength / 4);
  const per = HZ / RATE;
  for (let i = 0; i < pcm.length; i++) {
    const b = Math.floor(i / channels / per);
    const v = Math.abs(pcm[i]);
    if (b < buckets && v > peaks[b]) peaks[b] = v;
  }
}

const out = {
  rate: RATE,
  duration: Math.round(duration * 1000) / 1000,
  silent: !audio || peaks.every((p) => p < 1e-4),
  peaks: peaks.map((p) => Math.round(Math.min(1, p) * 1000) / 1000),
};
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`${OUT}: ${buckets} peaks over ${out.duration} s, max ${Math.max(...out.peaks)}, silent ${out.silent}, audio ${audio ? `${audio.channels} ch` : "none"}, video ${video?.r_frame_rate}, ${fs.statSync(OUT).size} bytes`);
