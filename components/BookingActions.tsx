"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { errorText, formatEgp, getT, localeHref, type Locale, type TranslationKey } from "@/lib/i18n";

interface Booking { id: string; status: string; payment_id: string | null; payment_status: "pending" | "success" | "failed" | null; track: string; date: string | null; total_egp: number; rent_egp_total: number; whatsapp_linked: boolean; whatsapp_link_url: string | null; unit_slug: string; addons: { name_en: string; name_ar: string; qty: number; unit_price_egp: number }[] }

// "2026-11-03" -> "Tue, 3 Nov" / Arabic equivalent; parsed as UTC so the day never shifts.
function formatDay(locale: Locale, iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

// XPay's public sandbox card (also in README "Testing"); the expiry picks the outcome.
function TestCard({ t }: { t: ReturnType<typeof getT> }) {
  const code = "tnum font-mono font-bold";
  return (
    <div className="border border-dashed border-ink p-4 bg-mustard/20 text-sm space-y-1">
      <p className="font-bold">{t("bookingCard.testCard")}</p>
      <p>{t("bookingCard.testCardNumber")}: <span dir="ltr" className={`${code} select-all`}>5123 4500 0000 0008</span> · CVV <span dir="ltr" className={code}>100</span></p>
      <p>{t("bookingCard.testCardExpiry")}: <span dir="ltr" className={code}>01/39</span> {t("bookingCard.testCardApproved")} · <span dir="ltr" className={code}>05/39</span> {t("bookingCard.testCardDeclined")} · {t("bookingCard.testCardName")}</p>
      <p className="text-xs text-ink/75">{t("bookingCard.testCard3ds")}</p>
    </div>
  );
}

// XPay redirects back here before its webhook lands: poll until the status moves.
const POLL_MS = 2000;
const POLL_MAX = 30; // ~60 s
const payingKey = (id: string) => `offisio_paying_${id}`;

// Browser Back/Forward (e.g. Back out of the XPay page): nothing was completed, so don't wait.
function cameBackOrForward(): boolean {
  try { return (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type === "back_forward"; } catch { return false; }
}

// True when this visit is the return from the payment page: our own marker (set
// just before leaving for XPay), or a started payment and a referrer from another site.
// XPay's return URL carries no outcome (lib/xpay.ts), so the status comes from our API.
function returnedFromPayment(b: Booking): boolean {
  let marked = false;
  try { marked = sessionStorage.getItem(payingKey(b.id)) === "1"; sessionStorage.removeItem(payingKey(b.id)); } catch { /* storage blocked */ }
  if (cameBackOrForward()) return false;
  if (marked) return true;
  if (!b.payment_id) return false;
  try { return Boolean(document.referrer) && new URL(document.referrer).origin !== window.location.origin; } catch { return false; }
}

export default function BookingActions({ id, locale }: { id: string; locale: Locale }) {
  const t = getT(locale);
  const [b, setB] = useState<Booking | null>(null); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"loading" | "ok" | "notFound" | "error">("loading");
  const [polling, setPolling] = useState(false); const [timedOut, setTimedOut] = useState(false); const [payFailed, setPayFailed] = useState(false);
  // Unknown codes never show raw: fall back to a generic line.
  const errText = (code: string) => { const s = errorText(t, code); return s === code ? t("bookingCard.errorGeneric") : s; };

  // The booking, "notFound" (404 / no booking), or null on a network/server error.
  const fetchBooking = useCallback(async (): Promise<Booking | "notFound" | null> => {
    try {
      const r = await fetch(`/api/bookings?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (r.status === 404) { setView("notFound"); return "notFound"; }
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { booking?: Booking };
      if (!d.booking) { setView("notFound"); return "notFound"; }
      setB(d.booking); setView("ok"); return d.booking;
    } catch {
      setView((v) => (v === "ok" ? v : "error")); return null;
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    // Started from a callback: fetchBooking only sets state after its fetch resolves.
    Promise.resolve().then(fetchBooking).then((first) => {
      if (cancelled || !first || first === "notFound" || first.status !== "awaiting_payment" || !returnedFromPayment(first)) return;
      if (first.payment_status === "failed") setPayFailed(true); // declined: Pay again right away
      else setPolling(true);
    });
    // Back from XPay via the bfcache: the page is restored with Pay still busy.
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) { setBusy(false); fetchBooking(); } };
    window.addEventListener("pageshow", onShow);
    return () => { cancelled = true; window.removeEventListener("pageshow", onShow); };
  }, [fetchBooking]);

  useEffect(() => {
    if (!polling) return;
    let n = 0; let inFlight = false;
    const timer = setInterval(async () => {
      if (inFlight) return;
      inFlight = true; n++;
      const cur = await fetchBooking();
      inFlight = false;
      if (cur === "notFound" || (cur && cur.status !== "awaiting_payment")) { clearInterval(timer); setPolling(false); return; }
      if (cur?.payment_status === "failed") { clearInterval(timer); setPolling(false); setPayFailed(true); return; }
      if (n >= POLL_MAX) { clearInterval(timer); setPolling(false); setTimedOut(true); }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [polling, fetchBooking]);

  if (view === "notFound" || (view === "error" && !b)) {
    return (
      <div className="space-y-3">
        <p className="font-bold">{view === "notFound" ? t("bookingCard.notFound") : t("bookingCard.errorGeneric")}</p>
        {view === "error" && <button onClick={() => fetchBooking()} className="block text-sm link">{t("bookingCard.refresh")}</button>}
        <Link href={localeHref("/", locale)} className="btn btn-chalk btn-md">{t("bookingCard.home")}</Link>
      </div>
    );
  }
  if (!b) return <p>{t("bookingCard.loading")}</p>;

  async function pay() {
    setBusy(true); setMsg(""); setTimedOut(false); setPayFailed(false);
    try {
      const res = await fetch("/api/payments/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ booking_id: id, locale }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string; checkout_url?: string };
      if (!res.ok || !data.checkout_url) {
        const code = String(data.error ?? "CHECKOUT_FAILED");
        setMsg(errText(code.replace(/_\d+$/, ""))); setBusy(false); // XPAY_SESSION_FAILED_502 -> error.XPAY_SESSION_FAILED
        if (code === "ALREADY_CONFIRMED" || code === "BOOKING_NOT_PAYABLE") fetchBooking();
        return;
      }
      try { sessionStorage.setItem(payingKey(id), "1"); } catch { /* storage blocked: the referrer check still works */ }
      window.location.assign(data.checkout_url);
    } catch { setMsg(errText("CHECKOUT_FAILED")); setBusy(false); }
  }
  const payable = b.status === "awaiting_payment" && !polling;

  return (
    <div className="space-y-4">
      <div className="border border-ink p-5 bg-sheet">
        <p className="text-[11px] uppercase tracking-wide text-ink/75">{t("bookingCard.booking")} {b.id} · {t("bookingCard.unit")} {b.unit_slug}</p>
        <div className="flex justify-between border-b border-ink/25 py-2 text-sm"><span>{t("bookingCard.status")}</span><strong>{t(`bookingStatus.${b.status}` as TranslationKey)}</strong></div>
        <div className="tnum flex justify-between border-b border-ink/25 py-2 text-sm">
          <span>{b.track === "daily" && b.date ? t("bookingCard.rentDaily", { date: formatDay(locale, b.date) }) : t("bookingCard.rentMonthly")}</span>
          <span>{formatEgp(locale, b.rent_egp_total)}</span>
        </div>
        {b.addons.length > 0 && <>
          <p className="pt-3 text-[11px] uppercase tracking-wide text-ink/75">{t("bookingCard.addons")}</p>
          <ul className="text-sm">{b.addons.map((a, i) => <li key={i} className="tnum flex justify-between border-b border-ink/25 py-2"><span>{a.qty} × {locale === "ar" ? a.name_ar : a.name_en}</span><span>{formatEgp(locale, a.qty * a.unit_price_egp)}</span></li>)}</ul>
        </>}
        <p className="tnum mt-3 bg-ink text-sheet font-display text-2xl font-black px-3 py-2 flex justify-between"><span>{t("bookingCard.total")}</span><span>{formatEgp(locale, b.total_egp)}</span></p>
      </div>
      {msg && <p className="text-sm font-bold text-ink bg-mustard/40 border border-ink p-3">{msg}</p>}
      {polling && b.status === "awaiting_payment" && (
        <p role="status" aria-live="polite" className="flex items-center gap-2 border border-ink bg-mustard/20 p-3 text-sm font-bold">
          <span aria-hidden className="inline-block size-3 animate-spin rounded-full border-2 border-ink border-e-transparent" />
          {t("bookingCard.confirming")}
        </p>
      )}
      {payFailed && payable && <p role="status" className="text-sm font-bold text-ink bg-mustard/40 border border-ink p-3">{t("bookingCard.payFailed")}</p>}
      {timedOut && payable && <p className="text-sm text-ink/75">{t("bookingCard.confirmTimeout")}</p>}
      {payable && <TestCard t={t} />}
      {payable && <button disabled={busy} onClick={pay} className="btn btn-brick btn-lg w-full">{t("bookingCard.pay")}</button>}
      {b.whatsapp_link_url && (
        <div className="border border-ink p-4 bg-sheet">
          <a href={b.whatsapp_link_url} target="_blank" rel="noreferrer" className="btn btn-chalk btn-md w-full">{t("bookingCard.waLink")}</a>
          <p className="text-xs text-ink/75 mt-2">{t("bookingCard.waLinkNote")}</p>
        </div>
      )}
      {b.whatsapp_linked && <p className="text-sm font-bold">✓ {t("bookingCard.waLinked")}</p>}
      <button onClick={() => fetchBooking()} className="text-sm link">{t("bookingCard.refresh")}</button>
    </div>
  );
}
