"use client";
// "Draft, not listed yet" on a guest upload. Its uploader gets the Publish action:
// signed in -> publish now; local mock (WhatsApp not configured) -> publish without
// an owner number; otherwise sign in with WhatsApp first and come back here.
// On success the page reloads with ?published=ready|processing (PublishedNotice).
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getT, type Locale } from "@/lib/i18n";
import type { PublishMode } from "@/lib/owner";

export default function DraftBanner({ slug, locale, publish, loginHref, className = "", children }: {
  slug: string; locale: Locale; publish: PublishMode | null; loginHref: string; className?: string;
  children?: ReactNode; // owner extras under the Publish action (e.g. ListingReview)
}) {
  const router = useRouter(); const pathname = usePathname(); const t = getT(locale);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  async function onPublish() {
    setBusy(true); setMsg("");
    const res = await fetch(`/api/units/${encodeURIComponent(slug)}/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok) { router.replace(`${pathname}?published=${data.ready ? "ready" : "processing"}`); router.refresh(); return; }
    setBusy(false);
    if (data.error === "SIGN_IN_REQUIRED") { router.push(loginHref); return; }
    setMsg(t(data.error === "NOT_DRAFT_OWNER" ? "publish.notOwner" : "publish.failed"));
  }
  return (
    <div className={`border border-ink bg-mustard/40 p-3 ${className}`}>
      <p className="font-display font-black">{t("draft.badge")}</p>
      <p className="text-sm text-ink/80 mt-1">{t(publish ? "draft.ownerNote" : "draft.visitorNote")}</p>
      {publish === "sign_in" && (
        <div className="mt-2">
          <Link href={loginHref} className="btn btn-brick btn-sm inline-block">{t("publish.withWhatsApp")}</Link>
          <p className="text-xs text-ink/75 mt-1">{t("publish.signInNote")}</p>
        </div>
      )}
      {publish === "unavailable" && <p className="text-xs text-ink/75 mt-2">{t("publish.unavailable")}</p>}
      {(publish === "signed_in" || publish === "mock") && (
        <button type="button" onClick={onPublish} disabled={busy} className="btn btn-brick btn-sm mt-2">
          {t(publish === "mock" ? "publish.mock" : "publish.button")}
        </button>
      )}
      {msg && <p className="mt-2 text-sm text-brick" role="alert">{msg}</p>}
      {children}
    </div>
  );
}

// Shown after a publish (?published=...), once the unit is no longer a draft.
export function PublishedNotice({ locale, state, className = "" }: { locale: Locale; state: string | string[] | undefined; className?: string }) {
  if (state !== "ready" && state !== "processing") return null;
  const t = getT(locale);
  return <p className={`border border-ink bg-mustard/40 p-3 text-sm font-bold ${className}`} role="status">{t(state === "ready" ? "publish.done" : "publish.doneProcessing")}</p>;
}
