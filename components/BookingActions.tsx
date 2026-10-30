"use client";
import { useEffect, useState } from "react";
import { errorText, formatEgp, getT, type Locale } from "@/lib/i18n";

interface Booking { id: string; status: string; total_egp: number; rent_egp_total: number; cafe_whatsapp_url: string | null; unit_slug: string; addons: { name_en: string; qty: number; unit_price_egp: number }[] }

export default function BookingActions({ id, locale }: { id: string; locale: Locale }) {
  const t = getT(locale);
  const [b, setB] = useState<Booking | null>(null); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const load = () => fetch(`/api/bookings?id=${id}`).then((r) => r.json()).then((d) => setB(d.booking ?? null));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!b) return <p>{t("bookingCard.loading")}</p>;

  async function pay() {
    setBusy(true); setMsg("");
    const res = await fetch("/api/payments/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ booking_id: id, locale }) });
    const data = await res.json();
    if (res.status === 503) { setMsg(data.setup); setBusy(false); return; }
    if (!res.ok) { setMsg(data.error ? errorText(t, data.error) : t("bookingCard.checkoutFailed")); setBusy(false); return; }
    window.location.assign(data.checkout_url);
  }

  return (
    <div className="space-y-4">
      <div className="border border-ink p-5 bg-sheet">
        <p className="text-[11px] uppercase tracking-wide text-ink/75">{t("bookingCard.booking")} {b.id} · {t("bookingCard.unit")} {b.unit_slug}</p>
        <div className="flex justify-between border-b border-ink/25 py-2 text-sm"><span>{t("bookingCard.status")}</span><strong>{b.status}</strong></div>
        {b.addons.length > 0 && <ul className="text-sm">{b.addons.map((a, i) => <li key={i} className="tnum flex justify-between border-b border-ink/25 py-2"><span>{a.qty} × {a.name_en}</span><span>{formatEgp(locale, a.qty * a.unit_price_egp)}</span></li>)}</ul>}
        <p className="tnum mt-3 bg-ink text-sheet font-display text-2xl font-black px-3 py-2 flex justify-between"><span>{formatEgp(locale, b.total_egp)}</span></p>
      </div>
      {msg && <p className="text-sm font-bold text-ink bg-mustard/40 border border-ink p-3">{msg}</p>}
      {b.status === "awaiting_payment" && <button disabled={busy} onClick={pay} className="btn btn-brick btn-lg w-full">{t("bookingCard.pay")}</button>}
      {b.status === "confirmed" && b.cafe_whatsapp_url && (
        <a href={b.cafe_whatsapp_url} target="_blank" rel="noreferrer" className="btn btn-chalk btn-lg w-full">{t("bookingCard.whatsapp")}</a>
      )}
      {b.status === "confirmed" && !b.cafe_whatsapp_url && <p className="text-sm text-ink/75">{t("bookingCard.cafeNotConfigured")}</p>}
      <button onClick={load} className="text-sm link">{t("bookingCard.refresh")}</button>
    </div>
  );
}
