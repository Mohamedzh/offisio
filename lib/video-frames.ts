// Server-side keyframes for a WhatsApp walkthrough video (plan/08 8.1). Mirrors the
// browser upload (components/UploadForm.tsx): <= 45 s, frames evenly spaced, width
// <= 1024 px (no upscaling), JPEG. Same ffmpeg-static binary and input hardening as
// lib/audio.ts: no stdin, local file protocol only, only MP4/3GP demuxers. The video
// is owner content: bytes and ffmpeg stderr are never logged, only fixed error codes.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { CAPS } from "./guard";

export const VIDEO_MIMES = ["video/mp4", "video/3gpp"] as const;
export const MAX_FRAMES = 20;
export const MIN_FRAMES = 6; // same floor as the browser path (~1 frame per second)
export const FRAME_WIDTH = 1024; // browser path: scale = min(1, 1024 / videoWidth)
const MAX_TOTAL_FRAME_BYTES = 12 * 1024 * 1024;
const PROBE_TIMEOUT_MS = 5_000;
const EXTRACT_TIMEOUT_MS = 25_000;
const INPUT_FORMATS = "mov,mp4,m4a,3gp,3g2,mj2";
const HARDEN = ["-hide_banner", "-nostdin", "-protocol_whitelist", "file", "-format_whitelist", INPUT_FORMATS];

export type VideoErrorCode = "VIDEO_INVALID" | "VIDEO_TOO_LONG" | "VIDEO_TIMEOUT" | "VIDEO_FRAMES_TOO_LARGE" | "VIDEO_NO_FRAMES" | "FFMPEG_MISSING";
export class VideoError extends Error {
  constructor(readonly code: VideoErrorCode) { super(code); this.name = "VideoError"; }
}
export interface VideoFrames { durationS: number; frames: { jpg: Buffer; t: number }[] }

// Runs ffmpeg; resolves with exit code and stderr (kept in memory for parsing, never logged).
function run(args: string[], timeoutMs: number): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new VideoError("FFMPEG_MISSING"));
    const p = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    let stderr = ""; let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; p.kill("SIGKILL"); }, timeoutMs);
    p.stderr.on("data", (c: Buffer) => { if (stderr.length < 64 * 1024) stderr += c.toString("utf8"); });
    p.on("error", () => { clearTimeout(timer); reject(new VideoError("FFMPEG_MISSING")); });
    p.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(new VideoError("VIDEO_TIMEOUT"));
      resolve({ code, stderr });
    });
  });
}

// "Duration: 00:00:20.23" from `ffmpeg -i` (no output file: exits 1, which is expected).
export function parseDuration(stderr: string): number | null {
  const m = stderr.match(/Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/);
  if (!m) return null;
  const s = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  return Number.isFinite(s) && s > 0 ? s : null;
}

// Frame count like the browser: ~1 per second, MIN_FRAMES..MAX_FRAMES.
export const frameCount = (durationS: number) => Math.min(MAX_FRAMES, Math.max(MIN_FRAMES, Math.round(durationS)));

/** Video bytes -> up to 20 evenly spaced JPEG keyframes. Throws VideoError with a fixed code. */
export async function extractFrames(bytes: Uint8Array, mimeType: string): Promise<VideoFrames> {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  if (!(VIDEO_MIMES as readonly string[]).includes(base) || bytes.byteLength < 64) throw new VideoError("VIDEO_INVALID");
  // MP4 keeps its index (moov) anywhere, so ffmpeg needs a seekable file, not a pipe.
  const dir = join(tmpdir(), `offisio-video-${randomUUID()}`);
  const input = join(dir, "in.mp4");
  try {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await writeFile(input, bytes, { mode: 0o600 });
    const probe = await run([...HARDEN, "-i", input], PROBE_TIMEOUT_MS);
    const durationS = parseDuration(probe.stderr);
    if (!durationS || !/Stream #\d+:\d+[^\n]*: Video:/.test(probe.stderr)) throw new VideoError("VIDEO_INVALID");
    if (durationS > CAPS.videoSeconds) throw new VideoError("VIDEO_TOO_LONG");
    const n = frameCount(durationS);
    // fps = n / duration: one frame per slot of duration / n seconds.
    const vf = `fps=${n}/${durationS.toFixed(3)},scale='min(${FRAME_WIDTH},iw)':-2`;
    const out = await run([...HARDEN, "-loglevel", "error", "-i", input, "-an", "-sn", "-dn", "-vf", vf, "-frames:v", String(n),
      "-q:v", "4", "-map_metadata", "-1", "-f", "image2", join(dir, "frame-%02d.jpg")], EXTRACT_TIMEOUT_MS);
    if (out.code !== 0) throw new VideoError("VIDEO_INVALID");
    const names = (await readdir(dir)).filter((f) => /^frame-\d{2}\.jpg$/.test(f)).sort().slice(0, n);
    if (names.length < CAPS.framesMin) throw new VideoError("VIDEO_NO_FRAMES");
    const frames: VideoFrames["frames"] = []; let total = 0;
    for (const [i, name] of names.entries()) {
      const jpg = await readFile(join(dir, name));
      total += jpg.length;
      if (jpg.length > CAPS.frameBytes || total > MAX_TOTAL_FRAME_BYTES) throw new VideoError("VIDEO_FRAMES_TOO_LARGE");
      frames.push({ jpg, t: Math.round((i * durationS / n) * 10) / 10 });
    }
    return { durationS, frames };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
