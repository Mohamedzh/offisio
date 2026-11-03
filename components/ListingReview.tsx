"use client";
// AI review of the listing text (lib/pipeline/review.ts), owner only. Advisory:
// publishing never waits for it. Polls lightly while the review step is queued
// or running; "Use the fixes" writes the reviewer's corrected text, then refreshes.
// "Review again" re-queues the step when the current text has no review.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { errorText, getT, type Locale, type TranslationKey } from "@/lib/i18n";
import type { ListingReview as Review, ReviewField } from "@/lib/pipeline/review";

const POLL_MS = 4000;
const MAX_POLLS = 60; // ~4 minutes, then stop quietly
const NULL_POLLS = 3; // a few polls while no review row exists yet (listing just finished)

type State = { pending: true; job: string | null } | { pending: false; job: string | null; review: Review };

export default function ListingReview({ slug, locale, className = "" }: { slug: string; locale: Locale; className?: string }) {
  const router = useRouter(); const t = getT(locale);
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [polls, setPolls] = useState(0); // each bump re-fetches

  useEffect(() => {
    let off = false;
    fetch(`/api/units/${encodeURIComponent(slug)}/review`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<State>) : null))
      .then((next) => { if (!off && next) setState(next); })
      .catch(() => {});
    return () => { off = true; };
  }, [slug, polls]);
  const running = state?.pending === true && (state.job === "queued" || state.job === "running");
  const active = running || (state?.pending === true && state.job === null && polls < NULL_POLLS);
  useEffect(() => {
    if (!active || polls >= MAX_POLLS) return;
    const id = setTimeout(() => setPolls((n) => n + 1), POLL_MS);
    return () => clearTimeout(id);
  }, [active, polls]);

  async function post(path: string, body: unknown): Promise<{ res: Response | null; data: Record<string, unknown> }> {
    const res = await fetch(`/api/units/${encodeURIComponent(slug)}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    return { res, data: res ? await res.json().catch(() => ({})) : {} };
  }

  async function apply(fields: ReviewField[]) {
    setBusy(true); setMsg(null);
    const { res, data } = await post("review/apply", { fields });
    setBusy(false);
    if (!res?.ok) { setMsg({ text: typeof data.error === "string" ? errorText(t, data.error) : t("review.applyFailed"), error: true }); return; }
    setState({ pending: false, job: state?.job ?? null, review: data.review as Review });
    setMsg({ text: t("review.applied"), error: false });
    router.refresh();
  }

  async function again() {
    setBusy(true); setMsg(null);
    const { res, data } = await post("review", {});
    setBusy(false);
    if (res?.status !== 202) { setMsg({ text: typeof data.error === "string" ? errorText(t, data.error) : t("review.applyFailed"), error: true }); return; }
    setState({ pending: true, job: "queued" }); setPolls(0);
  }

  if (!state) return null;
  const review = state.pending ? null : state.review;
  const n = review?.issues.length ?? 0;
  const fields = [...new Set(review?.issues.map((i) => i.field) ?? [])];
  const canAgain = state.pending && (state.job === "done" || state.job === "failed");
  const status = state.pending
    ? t(running ? "review.pending" : state.job === "failed" ? "review.failed" : "review.none")
    : n === 0 ? t("review.ok") : n === 1 ? t("review.foundOne") : n === 2 ? t("review.foundTwo") : t("review.found", { n });
  return (
    <section className={`border border-ink bg-sheet p-3 ${className}`}>
      <h2 className="text-sm font-bold">{t("review.title")}</h2>
      <p className="text-xs text-ink/75 mt-1">{t("review.note")}</p>
      <p className={`text-sm mt-2 ${n > 0 ? "font-bold text-brick" : review ? "font-bold" : ""}`} role="status" aria-live="polite">{status}</p>
      {canAgain && <button type="button" disabled={busy} onClick={again} className="btn btn-sm mt-2">{t("review.again")}</button>}
      {review && n > 0 && (
        <>
          <ul className="mt-2 text-sm">
            {review.issues.map((i, k) => (
              <li key={k} className="border-b border-ink/25 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 border border-ink bg-mustard/40">{t(`review.kind.${i.kind}` as TranslationKey)}</span>
                  <span className="text-xs text-ink/75">{t(`review.field.${i.field}` as TranslationKey)}</span>
                </div>
                <p className="mt-1">{locale === "en" ? i.note_en : i.note_ar}</p>
                <p className="text-xs text-ink/75 mt-1">
                  {t("review.fix")}: {i.fix
                    ? <bdi dir={i.field.endsWith("_ar") ? "rtl" : "ltr"} className="font-bold text-ink">{i.fix}</bdi>
                    : <span className="font-bold text-ink">{t("review.fixDelete")}</span>}
                </p>
                {fields.length > 1 && (
                  <button type="button" disabled={busy} onClick={() => apply([i.field])} className="btn btn-sm mt-2">{t("review.applyOne")}</button>
                )}
              </li>
            ))}
          </ul>
          <button type="button" disabled={busy} onClick={() => apply(fields)} className="btn btn-ink btn-sm mt-3">{t("review.applyAll")}</button>
        </>
      )}
      {msg && <p className={`text-sm mt-2 ${msg.error ? "font-bold text-brick" : "text-ink/75"}`} role={msg.error ? "alert" : "status"} aria-live={msg.error ? "assertive" : "polite"}>{msg.text}</p>}
    </section>
  );
}
