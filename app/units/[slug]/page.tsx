import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getUnit } from "@/lib/db/store";
import UnitViewer from "@/components/UnitViewer";
import BookingForm from "@/components/BookingForm";


export const instant = false;

export default async function UnitPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string }> }) {
  await connection();
  const { slug } = await params;
  const en = (await searchParams).lang === "en";
  const unit = await getUnit(slug);
  if (!unit) notFound();
  const specs = unit.specs as Record<string, unknown>;
  const specRows: [string, string][] = [
    [en ? "Approx area" : "مساحة تقريبية", specs.area_m2_estimate ? `~${specs.area_m2_estimate} m²` : "—"],
    [en ? "Desk capacity" : "سعة مكاتب", specs.desk_capacity != null ? String(specs.desk_capacity) : "—"],
    [en ? "Condition" : "الحالة", String(specs.condition ?? "—")],
    [en ? "Natural light" : "إضاءة طبيعية", String(specs.natural_light ?? "—")],
    [en ? "Flooring" : "الأرضية", String(specs.flooring ?? "—")],
  ];
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8" dir={en ? "ltr" : "rtl"}>
      <Link href={en ? "/?lang=en" : "/"} className="text-sm text-zinc-500">← {en ? "All offices" : "كل المكاتب"}</Link>
      <h1 className="text-2xl font-bold mt-2 leading-snug">{en ? unit.title_en : unit.title_ar}</h1>
      <p className="text-zinc-500">{unit.district} · {en ? "Floors" : "أدوار"} {unit.floor_text} · EGP {unit.rent_egp.toLocaleString()}/mo</p>
      <div className="mt-4"><UnitViewer images={unit.images} en={en} /></div>
      <div className="grid gap-5 md:grid-cols-3 mt-6">
        <section className="md:col-span-2 space-y-4">
          <p className="leading-relaxed">{en ? unit.summary_en : unit.summary_ar}</p>
          <ul className="list-disc ps-5 space-y-1">{(en ? unit.highlights_en : unit.highlights_ar).map((h) => <li key={h}>{h}</li>)}</ul>
          <div className="rounded-2xl border bg-white dark:bg-zinc-900 p-4">
            <h3 className="font-semibold mb-2">{en ? "Specs (AI estimate)" : "المواصفات (تقدير ذكاء اصطناعي)"}</h3>
            <dl className="grid grid-cols-2 gap-2 text-sm">{specRows.map(([k, v]) => <div key={k} className="flex justify-between border-b py-1"><dt className="text-zinc-500">{k}</dt><dd>{v}</dd></div>)}</dl>
            <p className="text-xs text-zinc-500 mt-2">{en ? "Estimates from video, not measurements." : "تقديرات من الفيديو، مش قياسات."}</p>
          </div>
        </section>
        <aside>
          {unit.rent_periods.includes("daily") && unit.daily_egp ? <BookingForm slug={unit.slug} dailyEgp={unit.daily_egp} en={en} /> : (
            <div className="rounded-2xl border bg-white dark:bg-zinc-900 p-4">
              <h3 className="font-semibold">{en ? "Long-term only" : "إيجار طويل الأجل فقط"}</h3>
              <p className="text-sm text-zinc-500 mt-1">{en ? "Bare/semifinished: you do the final fit-out, lower rent. See the fit concepts above, then chat to arrange." : "نصف تشطيب: أنت تعمل التشطيب الأخير، إيجار أقل. شوف تصورات التجهيز فوق، وكلمّنا نرتب."}</p>
              <Link href="/chat" className="mt-3 block text-center rounded-full bg-zinc-900 text-white py-2.5 dark:bg-white dark:text-zinc-900">{en ? "Chat to arrange" : "كلمّنا نرتب"}</Link>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
