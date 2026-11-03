"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { errorText, getT, localeHref, type Locale } from "@/lib/i18n";

function newSlug(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

interface Frame { blob: Blob; url: string; t: number }
// Mirrors CAPS in lib/guard.ts (server enforces the byte cap via the Blob token).
const MAX_BYTES = 80 * 1024 * 1024;
const MAX_SECONDS = 45;
// "Try it with a sample walkthrough": our own 20 s filmed walkthrough of the furnished
// demo office ("full"), public on Blob (CORS *). It runs the same flow as a picked file.
const SAMPLE_VIDEO_URL = process.env.NEXT_PUBLIC_SAMPLE_VIDEO_URL || "https://tadysmzbjdkmgzem.public.blob.vercel-storage.com/demo/full/walkthrough.mp4";
const SAMPLE_FIELDS = { district: "New Administrative Capital", location: "30.036687, 31.681687", rent: "14500", daily: "800", floor: "2nd", kind: "furnished" };
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

async function extractFrames(file: File): Promise<Frame[]> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true; video.playsInline = true; video.preload = "auto"; video.src = objectUrl;
    await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error("video load failed")); });
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error("video has no duration");
    if (duration > MAX_SECONDS) throw new Error("VIDEO_TOO_LONG");
    // ~1 frame per second (6-30) so the survey sees every room (docs/RUBRIC.md).
    const count = Math.min(30, Math.max(6, Math.round(duration)));
    const scale = Math.min(1, 1024 / (video.videoWidth || 1024));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round((video.videoWidth || 1024) * scale);
    canvas.height = Math.round((video.videoHeight || 720) * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    const frames: Frame[] = [];
    for (let i = 0; i < count; i++) {
      const t = ((i + 0.5) * duration) / count;
      video.currentTime = t;
      await new Promise<void>((resolve, reject) => { video.onseeked = () => resolve(); video.onerror = () => reject(new Error("seek failed")); });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
      if (!blob) throw new Error("frame capture failed");
      frames.push({ blob, url: URL.createObjectURL(blob), t: Math.round(t * 10) / 10 });
    }
    return frames;
  } finally { URL.revokeObjectURL(objectUrl); }
}

// Browser -> Vercel Blob directly, or (local media fallback, no Blob token) PUT to our
// local-only route that writes public/uploads/<slug>/. Returns the stored URL.
async function store(pathname: string, body: Blob, contentType: string, localMedia: boolean, multipart = false): Promise<string> {
  if (!localMedia) return (await upload(pathname, body, { access: "public", handleUploadUrl: "/api/blob/upload", contentType, multipart })).url;
  const res = await fetch(`/api/blob/local?pathname=${encodeURIComponent(pathname)}`, { method: "PUT", headers: { "Content-Type": contentType }, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || typeof data.url !== "string") throw new Error(data.error ?? "upload.failed");
  return data.url;
}

export default function UploadForm({ locale, localMedia = false }: { locale: Locale; localMedia?: boolean }) {
  const router = useRouter(); const t = getT(locale);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [district, setDistrict] = useState(""); const [location, setLocation] = useState(""); const [rent, setRent] = useState(""); const [daily, setDaily] = useState("");
  const [floor, setFloor] = useState(""); const [availableFrom, setAvailableFrom] = useState(""); const [kind, setKind] = useState("furnished");
  const [msg, setMsg] = useState(""); const [extracting, setExtracting] = useState(false); const [busy, setBusy] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null); const [sampleLoading, setSampleLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onVideo(file: File | undefined) {
    setMsg(""); setFrames([]); setVideoFile(file ?? null);
    if (!file) return;
    if (!file.type.startsWith("video/")) { setMsg(t("upload.failed")); return; }
    if (file.size > MAX_BYTES) { setMsg(errorText(t, "VIDEO_TOO_BIG")); return; }
    setExtracting(true);
    try { setFrames(await extractFrames(file)); }
    catch (e) { setMsg((e as Error).message === "VIDEO_TOO_LONG" ? errorText(t, "VIDEO_TOO_LONG") : t("upload.failed")); }
    finally { setExtracting(false); }
  }

  // Fetch the sample video as a File, pre-fill editable sample details, then the normal path.
  async function trySample() {
    setMsg(""); setSampleLoading(true);
    try {
      const res = await fetch(SAMPLE_VIDEO_URL, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error("sample fetch failed");
      const file = new File([await res.blob()], "sample-walkthrough.mp4", { type: "video/mp4" });
      if (inputRef.current) inputRef.current.value = "";
      setDistrict(SAMPLE_FIELDS.district); setLocation(SAMPLE_FIELDS.location); setRent(SAMPLE_FIELDS.rent); setDaily(SAMPLE_FIELDS.daily);
      setFloor(SAMPLE_FIELDS.floor); setKind(SAMPLE_FIELDS.kind); setAvailableFrom((v) => v || localToday());
      setSampleLoading(false);
      await onVideo(file);
    } catch { setMsg(t("upload.sampleFailed")); setSampleLoading(false); }
  }

  async function submit() {
    setBusy(true); setMsg("");
    try {
      const slug = newSlug();
      // Browser -> Blob directly; only URLs go to our API (no 4.5 MB limit).
      const frameUrls: string[] = [];
      for (let i = 0; i < frames.length; i++) {
        frameUrls.push(await store(`uploads/${slug}/frame-${i}.jpg`, frames[i].blob, "image/jpeg", localMedia));
      }
      let videoUrl: string | null = null;
      if (videoFile) {
        const ext = videoFile.type === "video/quicktime" ? "mov" : videoFile.type === "video/webm" ? "webm" : "mp4";
        videoUrl = await store(`uploads/${slug}/source.${ext}`, videoFile, videoFile.type, localMedia, true);
      }
      const res = await fetch("/api/units/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug, district, location, rent_egp: rent, daily_egp: daily || null,
          floor_text: floor, available_from: availableFrom, kind, frameUrls, frameTimes: frames.map((f) => f.t), videoUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("upload.failed"));
      router.push(localeHref(`/units/${data.slug}/edit`, locale)); // pipeline status shows there
    } catch (e) { setMsg(errorText(t, (e as Error).message)); setBusy(false); }
  }

  const inputCls = "field mt-1";
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm">{t("upload.video")}
          <input ref={inputRef} type="file" accept="video/*" onChange={(e) => onVideo(e.target.files?.[0])} className="field mt-1 text-sm" />
        </label>
        <p className="text-xs text-ink/75 mt-1">{t("upload.videoHint")}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" onClick={trySample} disabled={busy || extracting || sampleLoading} className="btn btn-sm">{sampleLoading ? t("upload.sampleLoading") : t("upload.sampleButton")}</button>
          <p className="text-xs text-ink/75">{t("upload.sampleHint")}</p>
        </div>
      </div>
      {extracting && <p className="inline-block bg-ink text-sheet text-[11px] uppercase tracking-wide px-2 py-0.5">{t("upload.extracting")}</p>}
      {busy && <p className="inline-block bg-ink text-sheet text-[11px] uppercase tracking-wide px-2 py-0.5">{t("upload.processing")}</p>}
      {frames.length > 0 && (
        <div>
          <p className="text-sm font-medium">{t("upload.framesReady", { count: frames.length })} · {t("upload.autoHero")}</p>
          <div className="mt-2 grid grid-cols-6 gap-1">
            {frames.map((f) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={f.url} src={f.url} alt="" className="aspect-square w-full object-cover border border-ink/40" />
            ))}
          </div>
        </div>
      )}
      <label className="block text-sm">{t("upload.district")}<input value={district} onChange={(e) => setDistrict(e.target.value)} className={inputCls} /></label>
      <div>
        <label className="block text-sm">{t("upload.location")}<input value={location} onChange={(e) => setLocation(e.target.value)} dir="ltr" inputMode="url" placeholder="https://maps.app.goo.gl/…" className={inputCls} /></label>
        <p className="text-xs text-ink/75 mt-1">{t("upload.locationHint")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">{t("upload.rent")}<input type="number" min={1} value={rent} onChange={(e) => setRent(e.target.value)} className={inputCls} /></label>
        <label className="block text-sm">{t("upload.dailyRent")}<input type="number" min={1} value={daily} onChange={(e) => setDaily(e.target.value)} className={inputCls} /></label>
        <label className="block text-sm">{t("upload.floor")}<input value={floor} onChange={(e) => setFloor(e.target.value)} className={inputCls} /></label>
        <label className="block text-sm">{t("upload.availableFrom")}<input type="date" value={availableFrom} onChange={(e) => setAvailableFrom(e.target.value)} className={inputCls} /></label>
      </div>
      <label className="block text-sm">{t("upload.kind")}
        <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls}>
          <option value="furnished">{t("upload.furnished")}</option>
          <option value="semifinished">{t("upload.semifinished")}</option>
        </select></label>
      {msg && <p className="text-sm font-bold text-brick">{msg}</p>}
      <button disabled={busy || extracting || frames.length < 3 || !district || !location.trim() || !rent || !floor || !availableFrom} onClick={submit} className="btn btn-brick btn-md w-full">{busy ? t("upload.processing") : t("upload.submit")}</button>
    </div>
  );
}
