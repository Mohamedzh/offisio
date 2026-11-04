"use client";
import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { errorText, formatEgp, getT, localeHref, type Locale, type TranslationKey } from "@/lib/i18n";
import ChatText, { textDir } from "./ChatText";

interface Card { slug: string; title_en: string; title_ar: string; district: string; rent_egp: number; daily_egp: number | null; image: string; synthetic: boolean }
interface Msg { role: "user" | "assistant"; content: string; units?: Card[] }
interface Reply { session_id: string; reply: string; units?: Card[]; booking_id?: string; transcript?: string; error?: string }

// Web mic (docs/plan/07 7.3). The server caps a voice turn at 60 s; stop a second early.
const VOICE_MAX_S = 60;
const REC_MIMES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"];
const noSubscribe = () => () => {};
const micSupported = () => typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
interface Rec { rec: MediaRecorder; stream: MediaStream; timer: number }
// Near me: browser location, rounded to ~100 m before it leaves the page (the server rounds again).
const geoSupported = () => typeof navigator !== "undefined" && !!navigator.geolocation && window.isSecureContext;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const GEO_ERRORS: Record<number, TranslationKey> = { 1: "nearme.denied", 3: "nearme.timeout" };
const sameSlugs = (a: Card[], b: Card[]) => a.length === b.length && b.every((u) => a.some((x) => x.slug === u.slug));
// Input problems read as plain guidance, without the "Something went wrong" prefix.
const PLAIN_ERRORS = new Set(["EMPTY_MESSAGE", "BAD_REQUEST", "MESSAGE_TOO_LONG"]);
// Slow-reply hints: after ~10 s, then ~25 s of waiting.
const SLOW_HINTS: [number, TranslationKey][] = [[10_000, "chat.stillWorking"], [25_000, "chat.almostThere"]];
// A proxy 413/504 page is not JSON: map it to a fixed code instead of a parse error.
async function readReply(res: Response, fallback: (status: number) => string): Promise<Reply> {
  try { return await res.json() as Reply; } catch { return { error: fallback(res.status) } as Reply; }
}

export default function ChatBox({ locale }: { locale: Locale }) {
  const t = getT(locale);
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "assistant", content: t("chat.greeting") }]);
  const [input, setInput] = useState(""); const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  // Keep the newest message (and its photo cards) in view.
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [msgs]);
  const [session, setSession] = useState<string | undefined>(); const [bookingId, setBookingId] = useState<string | null>(null);
  const canRecord = useSyncExternalStore(noSubscribe, micSupported, () => false);
  const recRef = useRef<Rec | null>(null);
  const startingRef = useRef(false); // getUserMedia pending: ignore extra taps
  const [recSec, setRecSec] = useState<number | null>(null); // null: not recording
  const [listening, setListening] = useState(false);
  const canLocate = useSyncExternalStore(noSubscribe, geoSupported, () => false);
  const [locating, setLocating] = useState(false);
  const inputRef = useRef(""); // the input at the moment the location arrives
  const locatingRef = useRef(false); // a reading is pending: ignore rapid extra taps before the re-render
  // Release the mic if the page unmounts mid-recording (nothing is sent).
  useEffect(() => () => { const r = recRef.current; if (!r) return; r.rec.onstop = null; clearInterval(r.timer); if (r.rec.state !== "inactive") r.rec.stop(); r.stream.getTracks().forEach((k) => k.stop()); }, []);

  const [slowHint, setSlowHint] = useState<TranslationKey | null>(null);
  useEffect(() => {
    if (!busy) return;
    const timers = SLOW_HINTS.map(([ms, key]) => window.setTimeout(() => setSlowHint(key), ms));
    return () => timers.forEach((id) => clearTimeout(id));
  }, [busy]);
  const startBusy = () => { setSlowHint(null); setBusy(true); };

  const say = (content: string) => setMsgs((m) => [...m, { role: "assistant", content }]);
  // Voice codes have their own friendly lines; others reuse the shared error dictionary.
  const failText = (code: string) => code.startsWith("VOICE_") ? t(`voice.error.${code}` as TranslationKey)
    : code.startsWith("LOCATION_") || PLAIN_ERRORS.has(code) ? errorText(t, code) : `${t("chat.errorPrefix")}${errorText(t, code)}`;
  function applyReply(data: Reply) {
    setSession(data.session_id);
    setMsgs((m) => {
      // The agent often re-sends the cards it just showed: skip a set identical to the last one shown.
      const units = data.units ?? [];
      const last = [...m].reverse().find((x) => x.units && x.units.length > 0)?.units;
      const repeat = !!last && sameSlugs(last, units);
      return [...m, ...(data.transcript ? [{ role: "user" as const, content: `🎙️ ${data.transcript}` }] : []), { role: "assistant", content: data.reply, units: repeat ? [] : units }];
    });
    if (data.booking_id) setBookingId(data.booking_id);
  }

  const setText = (v: string) => { inputRef.current = v; setInput(v); };
  async function send() {
    if (!input.trim() || busy || recSec !== null || locating) return;
    const text = input; setText("");
    await post(text);
  }
  async function post(text: string, location?: { lat: number; lng: number }) {
    startBusy();
    setMsgs((m) => [...m, { role: "user", content: location ? `📍 ${text}` : text }]);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: session, message: text, locale, ...(location ? { location } : {}) }) });
      const data = await readReply(res, (st) => (st === 413 ? "MESSAGE_TOO_LONG" : `HTTP_${st}`));
      if (!res.ok) throw new Error(data.error);
      applyReply(data);
    } catch (e) { say(failText((e as Error).message)); }
    setBusy(false);
  }

  async function sendVoice(blob: Blob) {
    if (blob.size === 0) { say(t("voice.error.VOICE_EMPTY")); return; }
    startBusy(); setListening(true);
    const fd = new FormData();
    const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
    fd.append("audio", blob, `voice.${ext}`);
    if (session) fd.append("session_id", session);
    fd.append("locale", locale);
    try {
      const res = await fetch("/api/chat/voice", { method: "POST", body: fd });
      const data = await readReply(res, (st) => (st === 413 ? "VOICE_TOO_BIG" : "VOICE_FAILED"));
      if (!res.ok) throw new Error(data.error);
      applyReply(data);
    } catch (e) { say(failText((e as Error).message)); }
    setBusy(false); setListening(false);
  }

  // 📍: one location reading, sent with the typed text or the default near-me request.
  function locate() {
    if (busy || locating || locatingRef.current || recRef.current || startingRef.current) return;
    locatingRef.current = true; setLocating(true);
    const done = () => { locatingRef.current = false; setLocating(false); };
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        done();
        const text = inputRef.current.trim() ? inputRef.current : t("nearme.defaultMessage");
        setText("");
        void post(text, { lat: round3(pos.coords.latitude), lng: round3(pos.coords.longitude) });
      },
      (err) => { done(); say(t(GEO_ERRORS[err.code] ?? "nearme.unavailable")); },
      { timeout: 10_000, maximumAge: 5 * 60_000, enableHighAccuracy: false });
  }

  // Tap to record, tap again to stop and send; auto-stops at the cap.
  async function toggleMic() {
    const cur = recRef.current;
    if (cur) { if (cur.rec.state !== "inactive") cur.rec.stop(); return; }
    if (busy || locating || startingRef.current) return;
    startingRef.current = true;
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { say(t((e as Error).name === "NotFoundError" ? "voice.noMic" : "voice.denied")); return; }
    finally { startingRef.current = false; }
    // Belt and braces: never run two recorders; release the extra stream.
    if (recRef.current) { stream.getTracks().forEach((k) => k.stop()); return; }
    const mimeType = REC_MIMES.find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32_000 });
    const chunks: Blob[] = [];
    let ticks = 0; // 250 ms ticks (no Date.now: the React compiler flags it as impure here)
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      const r = recRef.current; recRef.current = null;
      if (r) clearInterval(r.timer);
      stream.getTracks().forEach((k) => k.stop());
      setRecSec(null);
      void sendVoice(new Blob(chunks, { type: rec.mimeType || mimeType || "audio/webm" }));
    };
    const timer = window.setInterval(() => {
      const s = Math.floor(++ticks / 4);
      setRecSec(s);
      if (s >= VOICE_MAX_S - 1 && rec.state !== "inactive") rec.stop();
    }, 250);
    recRef.current = { rec, stream, timer };
    rec.start(); setRecSec(0);
  }
  const recording = recSec !== null;

  return (
    // Phones: 70dvh. Desktop: fill the viewport below the page title, never under 36rem.
    <div className="flex flex-col border border-ink bg-board/40 h-[70dvh] min-h-[24rem] md:h-[calc(100dvh-17rem)] md:min-h-[36rem]">
      <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {msgs.map((m, i) => (
          <Fragment key={i}>
          <div className={`max-w-[85%] px-3 py-2 text-sm leading-relaxed ${m.role === "user" ? "ms-auto bg-chalk text-white whitespace-pre-line" : "me-auto bg-sheet border border-ink text-ink"}`}>{m.role === "assistant" ? <ChatText text={m.content} /> : <span dir={textDir(m.content)} className="block wrap-break-word">{m.content}</span>}</div>
          {m.units && m.units.length > 0 && (
            <div className="me-auto grid w-full max-w-[85%] grid-cols-1 gap-2 sm:grid-cols-3">
              {m.units.map((u) => { const cl: Locale = textDir(m.content) === "rtl" ? "ar" : "en"; const ct = getT(cl); return (
                // Card language follows the reply (an Arabic reply on the English page gets Arabic cards).
                <Link key={u.slug} dir={cl === "ar" ? "rtl" : "ltr"} href={localeHref(`/units/${u.slug}`, locale)} target="_blank" className="block border border-ink bg-sheet text-ink transition-transform hover:-translate-y-0.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u.image} alt={cl === "ar" ? u.title_ar : u.title_en} loading="lazy" onLoad={() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight })} className="aspect-[4/3] w-full object-cover" />
                  <div className="p-2 text-xs">
                    <p className="font-bold line-clamp-2">{cl === "ar" ? u.title_ar : u.title_en}</p>
                    <p className="tnum text-ink/75 mt-0.5">{u.daily_egp ? `${formatEgp(cl, u.daily_egp)}${ct("unit.perDay")}` : `${formatEgp(cl, u.rent_egp)}${ct("unit.perMonth")}`}</p>
                    {u.synthetic && <p className="mt-1 text-[10px] text-ink/60">{ct("chat.aiPhotos")}</p>}
                  </div>
                </Link>
              ); })}
            </div>
          )}
          </Fragment>
        ))}
        {busy && <p role="status" className="text-xs text-ink/75">{listening ? t("voice.transcribing") : t("chat.typing")}{slowHint && <span className="ms-2 text-ink/60">{t(slowHint)}</span>}</p>}
        {locating && <p role="status" className="text-xs text-ink/75">{t("nearme.locating")}</p>}
      </div>
      {bookingId && <Link href={localeHref(`/booking/${bookingId}`, locale)} className="btn btn-chalk btn-sm mx-4 mb-2">{t("chat.completePayment")}</Link>}
      <div className="border-t border-ink bg-sheet">
        {recording && <p role="status" className="px-3 pt-2 text-xs font-bold text-brick"><span aria-hidden="true" className="me-1 inline-block size-2 animate-pulse rounded-full bg-brick" />{t("voice.recording", { s: recSec, max: VOICE_MAX_S })}</p>}
        <div className="flex gap-2 p-3">
          <input value={input} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder={t("chat.placeholder")} className="field flex-1 w-auto! min-w-0" />
          {canLocate && (
            // Busy state uses chalk (not paper) so it keeps contrast on hover.
            <button type="button" onClick={locate} disabled={(busy || recording) && !locating} aria-busy={locating} aria-label={t("nearme.button")} title={t("nearme.button")} className={`btn shrink-0 px-3 ${locating ? "btn-chalk" : "btn-paper"}`}>
              <span aria-hidden="true" className={`text-base leading-none ${locating ? "animate-pulse" : (busy || recording) ? "opacity-45" : ""}`}>📍</span>
            </button>
          )}
          {canRecord && (
            <button type="button" onClick={toggleMic} disabled={(busy || locating) && !recording} aria-pressed={recording} aria-label={recording ? t("voice.stop") : t("voice.record")} title={recording ? t("voice.stop") : t("voice.record")} className={`btn shrink-0 px-3 ${recording ? "btn-brick" : "btn-paper"}`}>
              {recording
                ? <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 fill-current"><rect x="6" y="6" width="12" height="12" /></svg>
                : <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 fill-none stroke-current" strokeWidth="2" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>}
            </button>
          )}
          <button onClick={send} disabled={busy || recording || locating} className="btn btn-brick shrink-0 px-4">{t("chat.send")}</button>
        </div>
        {canRecord && <p className="px-3 pb-2 -mt-1 text-xs text-ink/70">{t(canLocate ? "voice.hint" : "voice.hintNoGeo")}</p>}
      </div>
    </div>
  );
}
