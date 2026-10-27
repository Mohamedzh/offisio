"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatEgp, getT, localeHref, type Locale } from "@/lib/i18n";

interface Day { date: string; day_free: boolean }
interface Addon { id: string; name_ar: string; name_en: string; price_egp: number; source: string }

export default function BookingForm({ slug, dailyEgp, locale }: { slug: string; dailyEgp: number | null; locale: Locale }) {
  const router = useRouter(); const t = getT(locale);
  const [days, setDays] = useState<Day[]>([]); const [addons, setAddons] = useState<Addon[]>([]);
  const [date, setDate] = useState(""); const [name, setName] = useState(""); const [phone, setPhone] = useState("");
  const [picked, setPicked] = useState<Record<string, number>>({}); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/availability?unit=${slug}`).then((r) => r.json()).then((d) => { setDays(d.days); setDate(d.days.find((x: Day) => x.day_free)?.date ?? ""); });
    fetch("/api/addons").then((r) => r.json()).then((d) => setAddons(d.items));
  }, [slug]);

  const addonsTotal = addons.reduce((s, a) => s + (picked[a.id] ?? 0) * a.price_egp, 0);
  const total = (dailyEgp ?? 0) + addonsTotal;

  async function book() {
    setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ unit_slug: slug, date, track: "daily", renter_name: name, renter_phone: phone, addons: Object.entries(picked).filter(([, q]) => q > 0).map(([item_id, qty]) => ({ item_id, qty, deliver_at: `${date}T10:00:00+02:00` })) }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(localeHref(`/booking/${data.booking.id}`, locale));
    } catch (e) { setMsg((e as Error).message); setBusy(false); }
  }

  return (
    <div className="rounded-2xl border bg-white dark:bg-zinc-900 p-4 space-y-3">
      <h3 className="font-semibold">{t("booking.bookDay")} — {formatEgp(locale, dailyEgp ?? 0)}{t("unit.perDay")}</h3>
      <label className="block text-sm">{t("booking.date")}
        <select value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-lg border p-2 bg-transparent">
          {days.map((d) => <option key={d.date} value={d.date} disabled={!d.day_free}>{d.date}{d.day_free ? "" : t("booking.booked")}</option>)}
        </select></label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("booking.name")} className="w-full rounded-lg border p-2 bg-transparent" />
      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("booking.phone")} className="w-full rounded-lg border p-2 bg-transparent" dir="ltr" />
      <div>
        <p className="text-sm font-medium mb-1">{t("booking.addons")}</p>
        {addons.map((a) => (
          <label key={a.id} className="flex items-center justify-between gap-2 py-1 text-sm">
            <span>{locale === "en" ? a.name_en : a.name_ar} — {formatEgp(locale, a.price_egp)}</span>
            <input type="number" min={0} max={10} value={picked[a.id] ?? 0} onChange={(e) => setPicked({ ...picked, [a.id]: Number(e.target.value) })} className="w-16 rounded border p-1 bg-transparent" />
          </label>
        ))}
      </div>
      <p className="font-semibold">{t("booking.total")}: {formatEgp(locale, total)}</p>
      {msg && <p className="text-sm text-red-600">{msg}</p>}
      <button disabled={busy || !date || !name || !phone} onClick={book} className="w-full rounded-full bg-zinc-900 text-white py-2.5 disabled:opacity-40 dark:bg-white dark:text-zinc-900">{busy ? "..." : t("booking.confirmPay")}</button>
    </div>
  );
}
