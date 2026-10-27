"use client";
import { useEffect, useState } from "react";
import { formatEgp, getT, type Locale } from "@/lib/i18n";

interface Booking { id: string; status: string; total_egp: number; rent_egp_total: number; cafe_whatsapp_url: string | null; unit_slug: string; addons: { name_en: string; qty: number; unit_price_egp: number }[] }

export default function BookingActions({ id, locale }: { id: string; locale: Locale }) {
  const t = getT(locale);
  const [b, setB] = useState<Booking | null>(null); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const load = () => fetch(`/api/bookings?id=${id}`).then((r) => r.json()).then((d) => setB(d.booking ?? null));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!b) return <p>{t("bookingCard.loading")}</p>;

  async function pay() {
    setBusy(true); setMsg("");
    const res = await fetch("/api/payments/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ booking_id: id }) });
    const data = await res.json();
    if (res.status === 503) { setMsg(data.setup); setBusy(false); return; }
    if (!res.ok) { setMsg(data.error ?? t("bookingCard.checkoutFailed")); setBusy(false); return; }
    window.location.assign(data.checkout_url);
  }

  return (
    <div className="space-y-4">
      <div className="border p-5 bg-white dark:bg-zinc-900">
        <p className="text-sm text-zinc-500">{t("bookingCard.booking")} {b.id} · {t("bookingCard.unit")} {b.unit_slug}</p>
        <p className="text-2xl font-bold mt-1">{formatEgp(locale, b.total_egp)}</p>
        <p className="mt-1">{t("bookingCard.status")}: <strong>{b.status}</strong></p>
        {b.addons.length > 0 && <ul className="text-sm mt-2 space-y-1">{b.addons.map((a, i) => <li key={i}>{a.qty} × {a.name_en} — {formatEgp(locale, a.qty * a.unit_price_egp)}</li>)}</ul>}
      </div>
      {msg && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 p-3">{msg}</p>}
      {b.status === "awaiting_payment" && <button disabled={busy} onClick={pay} className="w-full bg-zinc-900 text-white py-3 disabled:opacity-40 dark:bg-white dark:text-zinc-900">{t("bookingCard.pay")}</button>}
      {b.status === "confirmed" && b.cafe_whatsapp_url && (
        <a href={b.cafe_whatsapp_url} target="_blank" rel="noreferrer" className="block text-center w-full bg-emerald-700 text-white py-3">{t("bookingCard.whatsapp")}</a>
      )}
      {b.status === "confirmed" && !b.cafe_whatsapp_url && <p className="text-sm text-zinc-500">{t("bookingCard.cafeNotConfigured")}</p>}
      <button onClick={load} className="text-sm underline">{t("bookingCard.refresh")}</button>
    </div>
  );
}
