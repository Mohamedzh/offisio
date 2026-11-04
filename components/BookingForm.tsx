"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { errorText, formatEgp, getT, localeHref, type Locale } from "@/lib/i18n";
import { dateLabel } from "@/lib/booking-labels";

interface Day { date: string; day_free: boolean }
interface Addon { id: string; name_ar: string; name_en: string; price_egp: number; daily_only?: boolean }

export default function BookingForm({ slug, dailyEgp, locale }: { slug: string; dailyEgp: number | null; locale: Locale }) {
  const router = useRouter(); const t = getT(locale);
  const [days, setDays] = useState<Day[]>([]); const [addons, setAddons] = useState<Addon[]>([]);
  const [date, setDate] = useState(""); const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [email, setEmail] = useState("");
  const [picked, setPicked] = useState<Record<string, number>>({}); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  // "Still needed" shows only once the renter touched a field or pressed the button.
  const [touched, setTouched] = useState(false); const [daysLoaded, setDaysLoaded] = useState(false);
  const touch = () => setTouched(true);

  useEffect(() => {
    fetch(`/api/availability?unit=${slug}`).then((r) => r.json()).then((d) => { const list: Day[] = Array.isArray(d.days) ? d.days : []; setDays(list); setDate(list.find((x) => x.day_free)?.date ?? ""); }).catch(() => setDays([])).finally(() => setDaysLoaded(true));
    fetch(`/api/addons?unit=${slug}`).then((r) => r.json()).then((d) => setAddons(d.items ?? []));
  }, [slug]);

  // Two collapsible groups, both provided by the venue: house coffee & snacks, then room extras.
  const groups = ([["house", addons.filter((a) => a.daily_only)], ["venue", addons.filter((a) => !a.daily_only)]] as const).filter(([, items]) => items.length);
  const addonsTotal = addons.reduce((s, a) => s + (picked[a.id] ?? 0) * a.price_egp, 0);
  const total = (dailyEgp ?? 0) + addonsTotal;
  // No day can be picked: say so instead of asking for a date.
  const noDays = daysLoaded && !days.some((d) => d.day_free);
  // Why "Confirm & pay" is disabled, in the form's own words.
  const missing = [!date && !noDays && t("booking.date"), !name.trim() && t("booking.name"), !phone.trim() && t("booking.phone"), !email.trim() && t("booking.email")].filter(Boolean) as string[];
  // Unknown codes never show raw.
  const errText = (code: string) => { const s = errorText(t, code); return s === code ? t("bookingCard.errorGeneric") : s; };

  async function book() {
    setTouched(true);
    if (noDays || missing.length > 0) return;
    setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ unit_slug: slug, date, track: "daily", renter_name: name, renter_phone: phone, renter_email: email, addons: Object.entries(picked).filter(([, q]) => q > 0).map(([item_id, qty]) => ({ item_id, qty, deliver_at: `${date}T10:00:00+02:00` })) }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.booking) throw new Error(String(data.error ?? "BOOKING_CREATE_FAILED"));
      router.push(localeHref(`/booking/${data.booking.id}`, locale));
    } catch (e) { setMsg(errText((e as Error).message)); setBusy(false); }
  }

  return (
    <div className="border border-ink bg-sheet p-5 space-y-3 ink-offset-sm">
      <h3 className="font-display font-black text-lg">{t("booking.bookDay")} — <span className="tnum">{formatEgp(locale, dailyEgp ?? 0)}{t("unit.perDay")}</span></h3>
      <label className="block text-sm">{t("booking.date")}
        <select value={date} onChange={(e) => { setDate(e.target.value); touch(); }} onBlur={touch} className="field mt-1">
          {days.map((d) => <option key={d.date} value={d.date} disabled={!d.day_free}>{dateLabel(d.date, locale)}{d.day_free ? "" : t("booking.booked")}</option>)}
        </select></label>
      <label className="block text-sm">{t("booking.name")}
        <input value={name} onChange={(e) => { setName(e.target.value); touch(); }} onBlur={touch} className="field mt-1" autoComplete="name" /></label>
      <label className="block text-sm">{t("booking.phone")}
        <input type="tel" inputMode="tel" value={phone} onChange={(e) => { setPhone(e.target.value); touch(); }} onBlur={touch} placeholder={t("booking.phonePlaceholder")} className="field mt-1 text-start" dir="ltr" autoComplete="tel" /></label>
      <label className="block text-sm">{t("booking.email")}
        <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); touch(); }} onBlur={touch} placeholder={t("booking.emailPlaceholder")} className="field mt-1" dir="ltr" autoComplete="email" /></label>
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
      {/* Enabled until the first try, so pressing it is what reveals "Still needed". */}
      <button disabled={busy || noDays || (touched && missing.length > 0)} onClick={book} aria-describedby={noDays || (touched && missing.length) ? "booking-missing" : undefined} className="btn btn-brick btn-md w-full">{busy ? "..." : t("booking.confirmPay")}</button>
      {!busy && noDays && <p id="booking-missing" className="text-xs text-ink/75">{t("booking.noDays")}</p>}
      {!busy && !noDays && touched && missing.length > 0 && <p id="booking-missing" className="text-xs text-ink/75">{t("booking.missing", { fields: missing.join(locale === "ar" ? "، " : ", ") })}</p>}
    </div>
  );
}
