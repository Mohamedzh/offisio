import Link from "next/link";
import Image from "next/image";
import { connection } from "next/server";
import { listUnits } from "@/lib/db/store";


export const instant = false;

export default async function Home({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  await connection();
  const en = (await searchParams).lang === "en";
  const units = await listUnits();
  const tracksAr: Record<string, string> = { daily: "يومي", monthly: "شهري", long_term: "طويل الأجل" };
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8" dir={en ? "ltr" : "rtl"}>
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">{en ? "Offisio" : "أوفيسيو"}</h1>
          <p className="text-zinc-500">{en ? "Book a real office. See how it could fit you." : "احجز مكتب حقيقي، وشوف ممكن يتجهز إزاي ليك."}</p>
        </div>
        <div className="flex gap-2 text-sm">
          <Link href="/chat" className="rounded-full bg-zinc-900 text-white px-4 py-2 dark:bg-white dark:text-zinc-900">{en ? "Chat to book" : "احجز بالمحادثة"}</Link>
          <Link href={en ? "/" : "/?lang=en"} className="rounded-full border px-4 py-2">{en ? "عربي" : "English"}</Link>
        </div>
      </header>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {units.map((u) => (
          <Link key={u.slug} href={`/units/${u.slug}${en ? "?lang=en" : ""}`} className="overflow-hidden rounded-2xl border bg-white dark:bg-zinc-900 hover:shadow-lg transition">
            <div className="relative aspect-16/10"><Image src={u.images.real} alt="" fill className="object-cover" sizes="33vw" /></div>
            <div className="p-4">
              <h2 className="font-semibold leading-snug">{en ? u.title_en : u.title_ar}</h2>
              <p className="text-sm text-zinc-500 mt-1">{u.district} · EGP {u.rent_egp.toLocaleString()}/mo{u.daily_egp ? ` · EGP ${u.daily_egp}/day` : ""}</p>
              <p className="text-xs mt-2 flex gap-1 flex-wrap">{u.rent_periods.map((r) => <span key={r} className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5">{en ? r.replace("_", " ") : tracksAr[r]}</span>)}</p>
              <p className="text-xs mt-2 text-zinc-500">{u.kind === "furnished" ? (en ? "Furnished" : "مفروش") : (en ? "Semifinished — your fit-out" : "نصف تشطيب — تجهيزك")}</p>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
