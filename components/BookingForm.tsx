"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Day { date: string; day_free: boolean }
interface Addon { id: string; name_ar: string; name_en: string; price_egp: number; source: string }

export default function BookingForm({ slug, dailyEgp, en }: { slug: string; dailyEgp: number | null; en: boolean }) {
  const router = useRouter();
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
      router.push(`/booking/${data.booking.id}`);
    } catch (e) { setMsg((e as Error).message); setBusy(false); }
  }

  const t = (ar: string, eng: string) => (en ? eng : ar);
  return (
    <div className="rounded-2xl border bg-white dark:bg-zinc-900 p-4 space-y-3">
      <h3 className="font-semibold">{t("احجز يوم", "Book a day")} — EGP {dailyEgp}/day</h3>
      <label className="block text-sm">{t("اليوم", "Date")}
        <select value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-lg border p-2 bg-transparent">
          {days.map((d) => <option key={d.date} value={d.date} disabled={!d.day_free}>{d.date}{d.day_free ? "" : t(" — محجوز", " — booked")}</option>)}
        </select></label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("الاسم", "Name")} className="w-full rounded-lg border p-2 bg-transparent" />
      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("موبايل 01xxxxxxxxx", "Mobile 01xxxxxxxxx")} className="w-full rounded-lg border p-2 bg-transparent" dir="ltr" />
      <div>
        <p className="text-sm font-medium mb-1">{t("إضافات (قهوة من الكافيه، أدوات)", "Add-ons (cafe coffee, utils)")}</p>
        {addons.map((a) => (
          <label key={a.id} className="flex items-center justify-between gap-2 py-1 text-sm">
            <span>{en ? a.name_en : a.name_ar} — EGP {a.price_egp}</span>
            <input type="number" min={0} max={10} value={picked[a.id] ?? 0} onChange={(e) => setPicked({ ...picked, [a.id]: Number(e.target.value) })} className="w-16 rounded border p-1 bg-transparent" />
          </label>
        ))}
      </div>
      <p className="font-semibold">{t("الإجمالي", "Total")}: EGP {total}</p>
      {msg && <p className="text-sm text-red-600">{msg}</p>}
      <button disabled={busy || !date || !name || !phone} onClick={book} className="w-full rounded-full bg-zinc-900 text-white py-2.5 disabled:opacity-40 dark:bg-white dark:text-zinc-900">{busy ? "..." : t("تأكيد وادفع (Paymob تجريبي)", "Confirm & pay (Paymob test)")}</button>
    </div>
  );
}
