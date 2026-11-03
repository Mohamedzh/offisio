// Web mic turn (docs/plan/07 7.3): browser recording -> WAV (ffmpeg) ->
// muse-voice-transcribe-1.0 on meta.product (PII path, never contributor) ->
// the same agent turn as /api/chat, plus the transcript. Every limit runs
// before the paid transcription. Audio bytes, transcript and error text are
// never logged: only fixed codes.
import { CAPS, deny, limit, spendBlocked } from "@/lib/guard";
import { toTranscribableWav, wavDurationMs, WEB_AUDIO_MIMES } from "@/lib/audio";
import { meta, MetaError } from "@/lib/meta/client";
import { chatGate, webSession, webTurn } from "@/lib/web-chat";

// ffmpeg (<=10 s) + transcription (<=20 s) + the agent turn.
export const maxDuration = 90;

const fail = (code: string, status: number) => Response.json({ error: code }, { status });
const codeOf = (e: unknown) =>
  e instanceof MetaError ? `META_${e.status}` : /^[A-Z0-9_]+$/.test((e as Error)?.message ?? "") ? (e as Error).message : "VOICE_ERROR";

export async function POST(req: Request) {
  // Size cap before reading the body (multipart overhead is small). Browsers
  // always send Content-Length with FormData; a missing or invalid one is refused
  // so req.formData() never buffers an unbounded body.
  const len = Number(req.headers.get("content-length"));
  if (!Number.isFinite(len) || len <= 0 || len > CAPS.voiceBytes + 16 * 1024) return fail("VOICE_TOO_BIG", 413);
  let form: FormData;
  try { form = await req.formData(); } catch { return fail("VOICE_EMPTY", 400); }
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) return fail("VOICE_EMPTY", 400);
  if (audio.size > CAPS.voiceBytes) return fail("VOICE_TOO_BIG", 413);
  const session = webSession(form.get("session_id"));
  const locale = form.get("locale");

  // Limits first: transcription is billed per audio second.
  if (await spendBlocked()) return deny("DEMO_QUOTA");
  const denied = await chatGate(session, req);
  if (denied) return denied;
  // Runs after chatGate, so a voice-denied attempt still uses one chat count (intended:
  // the caller did try a turn). A per-IP voice cap maps to VOICE_LIMIT; the global one stays DEMO_QUOTA.
  const voice = await limit("voice", req);
  if (!voice.ok) return deny(voice.code === "DEMO_QUOTA" ? "DEMO_QUOTA" : "VOICE_LIMIT");

  let wav: Uint8Array;
  try {
    wav = await toTranscribableWav(new Uint8Array(await audio.arrayBuffer()), audio.type, WEB_AUDIO_MIMES);
  } catch (e) {
    const code = codeOf(e);
    console.error("[chat/voice] convert failed", code);
    if (code === "FFMPEG_OUTPUT_TOO_LARGE") return fail("VOICE_TOO_LONG", 413);
    if (code === "AUDIO_FORMAT_UNSUPPORTED" || code.startsWith("FFMPEG_EXIT") || code === "FFMPEG_BAD_WAV") return fail("VOICE_FORMAT", 415);
    return fail("VOICE_FAILED", 502);
  }
  const ms = wavDurationMs(wav);
  if (ms > CAPS.voiceSeconds * 1000 + 500) return fail("VOICE_TOO_LONG", 413);
  if (ms < 300) return fail("VOICE_UNCLEAR", 422); // too short to hold a word; skip the paid call

  let text = "";
  try {
    text = (await meta.product.transcribe(wav)).text.trim();
  } catch (e) {
    console.error("[chat/voice] transcribe failed", codeOf(e));
    return fail("VOICE_FAILED", 502);
  }
  if (!text) return fail("VOICE_UNCLEAR", 422);
  if (text.length > CAPS.chatChars) return fail("VOICE_TOO_LONG", 413);
  return webTurn(session, text, locale, { transcript: text });
}
