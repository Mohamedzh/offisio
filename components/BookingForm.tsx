"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { errorText, formatEgp, getT, localeHref, type Locale } from "@/lib/i18n";

interface Day { date: string; day_free: boolean }
interface Addon { id: string; name_ar: string; name_en: string; price_egp: number; daily_only?: boolean }

export default function BookingForm({ slug, dailyEgp, locale }: { slug: string; dailyEgp: number | null; locale: Locale }) {
  const router = useRouter(); const t = getT(locale);
  const [days, setDays] = useState<Day[]>([]); const [addons, setAddons] = useState<Addon[]>([]);
  const [date, setDate] = useState(""); const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [email, setEmail] = useState("");
  const [picked, setPicked] = useState<Record<string, number>>({}); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/availability?unit=${slug}`).then((r) => r.json()).then((d) => { setDays(d.days); setDate(d.days.find((x: Day) => x.day_free)?.date ?? ""); });
    fetch(`/api/addons?unit=${slug}`).then((r) => r.json()).then((d) => setAddons(d.items ?? []));
  }, [slug]);

  // Two collapsible groups, both provided by the venue: house coffee & snacks, then room extras.
  const groups = ([["house", addons.filter((a) => a.daily_only)], ["venue", addons.filter((a) => !a.daily_only)]] as const).filter(([, items]) => items.length);
  const addonsTotal = addons.reduce((s, a) => s + (picked[a.id] ?? 0) * a.price_egp, 0);
  const total = (dailyEgp ?? 0) + addonsTotal;

  async function book() {
    setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ unit_slug: slug, date, track: "daily", renter_name: name, renter_phone: phone, renter_email: email, addons: Object.entries(picked).filter(([, q]) => q > 0).map(([item_id, qty]) => ({ item_id, qty, deliver_at: `${date}T10:00:00+02:00` })) }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(localeHref(`/booking/${data.booking.id}`, locale));
    } catch (e) { setMsg(errorText(t, (e as Error).message)); setBusy(false); }
  }

  return (
    <div className="border border-ink bg-sheet p-5 space-y-3 ink-offset-sm">
      <h3 className="font-display font-black text-lg">{t("booking.bookDay")} — <span className="tnum">{formatEgp(locale, dailyEgp ?? 0)}{t("unit.perDay")}</span></h3>
      <label className="block text-sm">{t("booking.date")}
        <select value={date} onChange={(e) => setDate(e.target.value)} className="field mt-1">
          {days.map((d) => <option key={d.date} value={d.date} disabled={!d.day_free}>{d.date}{d.day_free ? "" : t("booking.booked")}</option>)}
        </select></label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("booking.name")} className="field" />
      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("booking.phone")} className="field" dir="ltr" />
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("booking.email")} className="field" dir="ltr" autoComplete="email" />
      <div>
        <p className="text-sm font-bold">{t("booking.addons")}</p>
        <p className="text-xs text-ink/75 mb-1">{t("booking.addonsNote")}</p>
        {groups.map(([key, items]) => {
          const count = items.reduce((n, a) => n + (picked[a.id] ?? 0), 0);
          return (
            <details key={key} className="border-b border-ink/25 py-1 text-sm">
              <summary className="cursor-pointer py-1 font-bold">
                {t(key === "house" ? "booking.houseAddons" : "booking.venueAddons")}
                {count > 0 && <span className="tnum ms-2 bg-ink text-sheet px-1.5 text-xs">{count}</span>}
              </summary>
              {items.map((a) => (
                <label key={a.id} className="tnum flex items-center justify-between gap-2 border-t border-ink/15 py-2">
                  <span>{locale === "en" ? a.name_en : a.name_ar} — {formatEgp(locale, a.price_egp)}</span>
                  <input type="number" min={0} max={10} value={picked[a.id] ?? 0} onChange={(e) => setPicked({ ...picked, [a.id]: Number(e.target.value) })} className="field w-16! p-1! tnum" />
                </label>
              ))}
            </details>
          );
        })}
      </div>
      <p className="tnum bg-ink text-sheet px-3 py-2 font-display font-black flex justify-between"><span>{t("booking.total")}</span><span>{formatEgp(locale, total)}</span></p>
      {msg && <p className="text-sm font-bold text-brick">{msg}</p>}
      <button disabled={busy || !date || !name || !phone || !email} onClick={book} className="btn btn-brick btn-md w-full">{busy ? "..." : t("booking.confirmPay")}</button>
    </div>
  );
}
