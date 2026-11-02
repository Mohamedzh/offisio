// Audio prep for muse-voice-transcribe-1.0, which only accepts RIFF/WAVE,
// mono, 16-bit PCM at 16 or 24 kHz. WhatsApp voice notes are OGG/Opus, so they
// are converted with ffmpeg first. Audio bytes and ffmpeg stderr are PII-adjacent:
// never log them, only fixed error codes.
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

export const WAV_RATES = [16000, 24000] as const;

// Mono 16-bit PCM samples -> a RIFF/WAVE file.
export function pcm16ToWav(samples: Int16Array, sampleRate: number): Uint8Array {
  const dataBytes = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const ascii = (at: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i)); };
  ascii(0, "RIFF"); v.setUint32(4, 36 + dataBytes, true); ascii(8, "WAVE");
  ascii(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  ascii(36, "data"); v.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, samples[i], true);
  return new Uint8Array(buf);
}

// True for a canonical WAV the API accepts (PCM, mono, 16-bit, 16/24 kHz).
export function isSupportedWav(b: Uint8Array): boolean {
  if (b.byteLength < 44) return false;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tag = (at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE" || tag(12) !== "fmt ") return false;
  const rate = v.getUint32(24, true);
  return v.getUint16(20, true) === 1 && v.getUint16(22, true) === 1 && v.getUint16(34, true) === 16
    && (WAV_RATES as readonly number[]).includes(rate);
}

// ffmpeg writing to a pipe can't seek back, so it leaves the RIFF and data
// chunk sizes as 0xFFFFFFFF. Patch them from the real length.
function fixWavSizes(wav: Uint8Array): Uint8Array {
  if (wav.byteLength < 44) return wav;
  const v = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  v.setUint32(4, wav.byteLength - 8, true);
  for (let at = 12; at + 8 <= wav.byteLength;) {
    const id = String.fromCharCode(wav[at], wav[at + 1], wav[at + 2], wav[at + 3]);
    if (id === "data") { v.setUint32(at + 4, wav.byteLength - at - 8, true); break; }
    at += 8 + v.getUint32(at + 4, true) + (v.getUint32(at + 4, true) % 2);
  }
  return wav;
}

// WhatsApp audio types that ffmpeg can read from a pipe. audio/mp4 (m4a) is left
// out: its moov atom is often at the end, which needs a seekable input. Voice
// notes are OGG/Opus anyway.
export const WHATSAPP_AUDIO_MIMES = ["audio/ogg", "audio/opus", "audio/mpeg", "audio/aac", "audio/amr", "audio/wav"];
// Meta's documented conversion (dev.meta.ai/docs/speech-to-text): mono, 24 kHz, 16-bit PCM WAV.
// +bitexact keeps ffmpeg from writing a LIST (encoder) chunk, so data starts at offset 36.
const FFMPEG_ARGS = ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact", "-f", "wav", "pipe:1"];
const FFMPEG_TIMEOUT_MS = 10_000; // inputs are <= 1 MB; keeps the voice turn inside maxDuration
const MAX_WAV_BYTES = 8 * 1024 * 1024; // inputs are capped at 1 MB, so real output is far smaller

// Any routed WhatsApp audio (OGG/Opus voice notes, mp3, aac, amr) -> supported WAV.
export function audioToWav(bytes: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error("FFMPEG_MISSING"));
    const p = spawn(ffmpegPath, FFMPEG_ARGS, { stdio: ["pipe", "pipe", "ignore"], windowsHide: true });
    const chunks: Buffer[] = [];
    let size = 0;
    let failed: string | null = null;
    const stop = (code: string) => { failed ??= code; p.kill("SIGKILL"); };
    const timer = setTimeout(() => stop("FFMPEG_TIMEOUT"), FFMPEG_TIMEOUT_MS);
    p.stdout.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_WAV_BYTES) stop("FFMPEG_OUTPUT_TOO_LARGE"); else chunks.push(c);
    });
    p.on("error", () => { clearTimeout(timer); failed ??= "FFMPEG_SPAWN_FAILED"; reject(new Error(failed)); });
    p.on("close", (code) => {
      clearTimeout(timer);
      if (failed) return reject(new Error(failed));
      if (code !== 0) return reject(new Error(`FFMPEG_EXIT_${code ?? "SIGNAL"}`));
      const wav = fixWavSizes(new Uint8Array(Buffer.concat(chunks)));
      if (!isSupportedWav(wav)) return reject(new Error("FFMPEG_BAD_WAV"));
      resolve(wav);
    });
    p.stdin.on("error", () => {}); // EPIPE when ffmpeg exits early; the exit code reports it
    p.stdin.end(bytes);
  });
}

// WhatsApp media -> WAV bytes for transcription.
export async function toTranscribableWav(bytes: Uint8Array, mimeType: string): Promise<Uint8Array> {
  if (isSupportedWav(bytes)) return bytes;
  const base = mimeType.split(";")[0].trim().toLowerCase();
  if (!WHATSAPP_AUDIO_MIMES.includes(base)) throw new Error("AUDIO_FORMAT_UNSUPPORTED");
  return audioToWav(bytes);
}
