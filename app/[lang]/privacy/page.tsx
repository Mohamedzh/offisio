import Link from "next/link";
import LangToggle from "@/components/LangToggle";
import { getT, localeHref, type Locale } from "@/lib/i18n";
import { localeFromParam } from "@/lib/i18n/server";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";

// Privacy policy: required to publish the Meta app for the WhatsApp channel
// (docs/plan/06 6.8). Long-form copy lives here, not in the UI dictionaries.
const UPDATED = "2026-10-31";
const COPY: Record<Locale, { title: string; intro: string; updated: string; sections: { h: string; p: string[] }[] }> = {
  en: {
    title: "Privacy policy",
    updated: "Last updated",
    intro: "Offisio is a hackathon demo for listing and booking office space in Egypt. This page explains what we collect, why, and who processes it.",
    sections: [
      { h: "What we collect", p: [
        "Renters: the messages you send our booking assistant on the website or on WhatsApp, your WhatsApp number when you message us there, and the name, phone number, dates and add-ons you give us to make a booking.",
        "Owners: the videos and photos you upload of your space, and the listing details you enter.",
        "Usage counters: daily request counts keyed by a salted hash of your IP address or WhatsApp number, to enforce fair-use limits. We do not store raw IP addresses.",
      ] },
      { h: "How we use it", p: [
        "To answer your questions, check availability, create your booking, send you a payment link and confirm the booking. Owner media is used to describe the space and to produce restyled photos.",
        "Chat messages and booking details are processed by Meta's model API (muse-spark-1.3) under settings that do not allow them to be used for model training. WhatsApp messages travel through the Meta WhatsApp Business Platform.",
        "We do not sell your data or use it for advertising.",
      ] },
      { h: "Who processes it", p: [
        "Meta (model API and WhatsApp Business Platform), Vercel (hosting and media storage), Neon (database), XPay (payments, test mode only; card details go to XPay, never to us) and Upstash (background jobs).",
      ] },
      { h: "Retention and deletion", p: [
        "This is a demo. Chat history keeps only the most recent messages of a conversation, and demo bookings and chats are deleted after the hackathon.",
        "To have your data deleted earlier, open an issue at github.com/Mohamedzh/offisio asking us to contact you (do not post personal details there), and we will remove your chats and bookings.",
      ] },
    ],
  },
  ar: {
    title: "سياسة الخصوصية",
    updated: "آخر تحديث",
    intro: "أوفيسيو نسخة تجريبية لهاكاثون لعرض وحجز المكاتب في مصر. الصفحة دي بتوضح إحنا بنجمع إيه وليه ومين بيعالجه.",
    sections: [
      { h: "بنجمع إيه", p: [
        "المستأجرين: الرسائل اللي بتبعتها لمساعد الحجز على الموقع أو واتساب، ورقم الواتساب لما تراسلنا عليه، والاسم ورقم التليفون والتواريخ والإضافات اللي بتدّيها لنا علشان نعمل الحجز.",
        "الملاك: الفيديوهات والصور اللي بترفعها للمكان، وبيانات الإعلان اللي بتكتبها.",
        "عدادات الاستخدام: عدد الطلبات اليومي مربوط بقيمة مشفّرة (hash) لعنوان الـIP أو رقم الواتساب، علشان حدود الاستخدام العادل. مش بنحفظ عنوان الـIP نفسه.",
      ] },
      { h: "بنستخدمه في إيه", p: [
        "علشان نرد على أسئلتك، ونشوف المواعيد المتاحة، ونعمل الحجز، ونبعتلك لينك الدفع ونأكد الحجز. صور وفيديوهات الملاك بنستخدمها لوصف المكان وعمل صور بتصميمات جديدة.",
        "رسائل الشات وبيانات الحجز بتتعالج عن طريق واجهة نماذج Meta (muse-spark-1.3) بإعدادات مش بتسمح باستخدامها في تدريب النماذج. رسائل الواتساب بتعدّي على منصة WhatsApp Business من Meta.",
        "مش بنبيع بياناتك ولا بنستخدمها في الإعلانات.",
      ] },
      { h: "مين بيعالجها", p: [
        "Meta (واجهة النماذج ومنصة WhatsApp Business)، وVercel (الاستضافة وتخزين الميديا)، وNeon (قاعدة البيانات)، وXPay (الدفع، وضع تجريبي بس؛ بيانات الكارت بتروح لـXPay ومش بتوصلنا)، وUpstash (المهام في الخلفية).",
      ] },
      { h: "مدة الحفظ والمسح", p: [
        "دي نسخة تجريبية. سجل الشات بيحتفظ بآخر الرسائل بس، والحجوزات والمحادثات التجريبية بتتمسح بعد الهاكاثون.",
        "لو عايز نمسح بياناتك قبل كده، افتح issue على github.com/Mohamedzh/offisio واطلب إننا نتواصل معاك (من غير ما تكتب بياناتك الشخصية هناك)، وهنمسح محادثاتك وحجوزاتك.",
      ] },
    ],
  },
};

export async function generateMetadata({ params }: PageProps<"/[lang]/privacy">): Promise<Metadata> {
  const locale = localeFromParam((await params).lang);
  return pageMetadata(locale, { title: COPY[locale].title, description: COPY[locale].intro, path: "/privacy" });
}

export default async function PrivacyPage({ params }: PageProps<"/[lang]/privacy">) {
  const locale = localeFromParam((await params).lang);
  const t = getT(locale);
  const c = COPY[locale];
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between">
        <Link href={localeHref("/", locale)} className="link-back"><span className="arr" aria-hidden>←</span>{t("nav.allOffices")}</Link>
        <LangToggle locale={locale} />
      </div>
      <article className="mt-4 border border-ink bg-sheet ink-offset">
        <div className="torn-b" aria-hidden />
        <div className="p-5">
          <h1 className="font-display text-3xl font-black tracking-[-0.02em] mb-1">{c.title}</h1>
          <p className="text-xs text-ink/60 mb-4">{c.updated}: <time dateTime={UPDATED}>{UPDATED}</time></p>
          <p className="text-sm leading-relaxed text-ink/80">{c.intro}</p>
          {c.sections.map((s) => (
            <section key={s.h} className="mt-6">
              <h2 className="font-display text-xl font-black tracking-[-0.02em] mb-2">{s.h}</h2>
              {s.p.map((p) => <p key={p} className="text-sm leading-relaxed text-ink/80 mt-2">{p}</p>)}
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
