"use client";
// Per-step pipeline status with a retry button (plan/06 6.7 step 2). Polls
// while a step is queued or running and refreshes the page as steps finish.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { errorText, getT, type Locale, type TranslationKey } from "@/lib/i18n";
import type { Job } from "@/lib/db/store";

const POLL_MS = 3000;

export default function PipelineStatus({ slug, initial, locale }: { slug: string; initial: Job[]; locale: Locale }) {
  const router = useRouter(); const t = getT(locale);
  const [jobs, setJobs] = useState(initial); const [busy, setBusy] = useState<string | null>(null); const [msg, setMsg] = useState("");
  const doneCount = useRef(initial.filter((j) => j.status === "done").length);
  const active = jobs.some((j) => j.status === "queued" || j.status === "running");

  const load = useCallback(async () => {
    const res = await fetch(`/api/units/${slug}/pipeline`, { cache: "no-store" });
    if (!res.ok) return;
    const next = ((await res.json()) as { jobs: Job[] }).jobs;
    setJobs(next);
    const done = next.filter((j) => j.status === "done").length;
    if (done !== doneCount.current) { doneCount.current = done; router.refresh(); }
  }, [slug, router]);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [active, load]);

  async function retry(step: string) {
    setBusy(step); setMsg("");
    const res = await fetch(`/api/units/${slug}/pipeline`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step }) });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setMsg(errorText(t, data.error ?? "upload.failed")); return; }
    await load();
  }

  if (!jobs.length) return null;
  const label = (step: string) => step.startsWith("stage:")
    ? t(`viewer.style.${step.slice(6).replace(/_s\d+$/, "")}` as TranslationKey)
    : t(`pipeline.step.${step}` as TranslationKey);
  const badge: Record<Job["status"], string> = { queued: "bg-sheet text-ink/70", running: "bg-mustard text-ink", done: "bg-ink text-sheet", failed: "bg-brick text-white" };
  return (
    <section className="mb-6 border border-ink bg-sheet p-3">
      <h2 className="text-sm font-bold">{t("pipeline.title")}</h2>
      <p className="text-xs text-ink/75 mt-1">{t("pipeline.note")}</p>
      <ul className="mt-2 text-sm">
        {jobs.map((j) => (
          <li key={j.step} className="border-b border-ink/25 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold">{label(j.step)}</span>
              <span className="flex items-center gap-2">
                {j.attempts > 1 && <span className="text-xs text-ink/75">{t("pipeline.attempts", { n: j.attempts })}</span>}
                <span className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 border border-ink ${badge[j.status]}`}>{t(`pipeline.status.${j.status}` as TranslationKey)}</span>
                {j.status === "failed" && <button disabled={!!busy} onClick={() => retry(j.step)} className="btn btn-brick btn-sm">{t("pipeline.retry")}</button>}
              </span>
            </div>
            {j.status === "failed" && j.last_error && <p className="text-xs text-ink/75 mt-1 break-words">{errorText(t, j.last_error)}</p>}
          </li>
        ))}
      </ul>
      {msg && <p className="text-sm font-bold text-brick mt-2">{msg}</p>}
    </section>
  );
}
