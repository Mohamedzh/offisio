// U5 probe (docs/DESIGN.md): transcribe one local audio file with
// muse-voice-transcribe-1.0 on the PII-safe path (meta.product).
// Usage: pnpm tsx scripts/test-transcribe.ts <audio-file>
// The API takes WAV only (mono, 16-bit PCM, 16/24 kHz); other WhatsApp audio
// types (OGG/Opus voice notes, mp3, aac, amr) are converted with ffmpeg
// exactly as in the webhook (lib/audio.ts). Use only our own recordings;
// the transcript is printed to this terminal only.
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { isSupportedWav, toTranscribableWav } from "../lib/audio";
import { loadEnvLocal, meta } from "../lib/meta/client";

const MIME: Record<string, string> = {
  ".ogg": "audio/ogg", ".oga": "audio/ogg", ".opus": "audio/ogg", ".wav": "audio/wav", ".mp3": "audio/mpeg",
  ".aac": "audio/aac", ".amr": "audio/amr",
};

async function main() {
  const [file] = process.argv.slice(2);
  if (!file) { console.error("usage: pnpm tsx scripts/test-transcribe.ts <audio-file>"); process.exit(1); }
  loadEnvLocal();
  const bytes = new Uint8Array(await readFile(file));
  const mimeType = MIME[extname(file).toLowerCase()] ?? "application/octet-stream";
  console.log(`file: ${basename(file)} (${bytes.byteLength} bytes, ${mimeType}, supported WAV: ${isSupportedWav(bytes)})`);
  const c0 = Date.now();
  const wav = await toTranscribableWav(bytes, mimeType);
  if (wav !== bytes) console.log(`converted to WAV: ${wav.byteLength} bytes in ${Date.now() - c0}ms`);
  const t0 = Date.now();
  const out = await meta.product.transcribe(wav);
  console.log(`latency: ${Date.now() - t0}ms, audioDurationMs: ${out.durationMs ?? "?"}`);
  console.log(`raw keys: ${Object.keys(out.raw).join(", ") || "(none)"}`);
  console.log(`transcript: ${out.text || "(empty)"}`);
}

main().catch((e) => { console.error("FAILED:", (e as Error).message); process.exit(1); });
