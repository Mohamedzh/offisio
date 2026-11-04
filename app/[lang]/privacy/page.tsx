import LegalPage, { type LegalCopy } from "@/components/LegalPage";
import type { Locale } from "@/lib/i18n";
import { localeFromParam } from "@/lib/i18n/server";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";

// Privacy policy: required to publish the Meta app for the WhatsApp channel
// (docs/plan/06 6.8). #delete is the app's data deletion instructions URL.
// Cookie names: lib/i18n (offisio-lang), lib/owner (offisio_owner, offisio_login,
// offisio_guest), lib/specs-edit (offisio_preview). Keep in sync.
const COPY: Record<Locale, LegalCopy> = {
  en: {
    title: "Privacy policy",
    updated: "Last updated",
    intro: "Offisio is a demo for listing and booking office space in Egypt. This page explains what we collect, why, and who processes it.",
    sections: [
      { h: "What we collect", p: [
        "Renters: the messages you send our booking assistant on the website or on WhatsApp, your WhatsApp number when you message us there, and the name, phone number, email, dates and add-ons you give us to make a booking.",
        "Voice messages: recordings from the website mic and WhatsApp voice notes are transcribed by Meta's muse-voice-transcribe-1.0 and not stored. Only the transcript is kept, as chat text.",
        "Your location (renters): only when you tap 📍 or share a location pin on WhatsApp to find offices near you. We round it, keep it with your chat session, and never send it to the AI model or write it to logs.",
        "Owners: the WhatsApp number you use as your owner account, the walkthrough videos you send on WhatsApp or upload on the website, photos, the office location you share (shown on the listing), and the listing details you enter.",
        "Usage counters: daily request counts keyed by a salted hash of your IP address or WhatsApp number, to enforce fair-use limits. We do not store raw IP addresses.",
      ] },
      { h: "How we use it", p: [
        "To answer your questions, check availability, create your booking, send you a payment link and confirm the booking.",
        "Owner videos and photos are processed by Meta's muse-spark-1.3 (room survey, specs and listing text) and muse-image-1.0 (fit concepts of the same room).",
        "Chat messages and booking details are processed by Meta's muse-spark-1.3 under settings that do not allow them to be used for model training. WhatsApp messages travel through the Meta WhatsApp Business Platform.",
        "We do not sell your data or use it for advertising.",
      ] },
      { h: "Cookies", p: [
        "We only set our own cookies, all needed for the site to work. No tracking or advertising cookies.",
        "offisio-lang remembers your language. offisio_owner keeps an owner signed in for 24 hours, and offisio_login holds a sign-in in progress for 10 minutes. offisio_guest links a private draft upload to your browser. offisio_preview keeps your edits to a demo listing visible in your browser only.",
      ] },
      { h: "Who processes it", p: [
        "Meta (model API and WhatsApp Business Platform), Vercel (hosting and media storage), Neon (database), XPay (payments, test mode only; card details go to XPay, never to us) and Upstash QStash (background jobs for new listings).",
        "Google Places receives office coordinates (and place names from Maps links owners share) to find nearby cafes and restaurants. It never receives renter data.",
      ] },
      { id: "delete", h: "Retention and deletion", p: [
        "This is a demo. Chat history keeps only the most recent messages of a conversation, and demo bookings and chats are deleted after the demo period ends.",
        "To have your data deleted earlier, open an issue at github.com/Mohamedzh/offisio asking us to contact you (do not post personal details there), and we will remove your chats and bookings.",
      ] },
    ],
  },
  ar: {
    title: "سياسة الخصوصية",
    updated: "آخر تحديث",
    intro: "أوفيسيو نسخة تجريبية لعرض وحجز المكاتب في مصر. الصفحة دي بتوضح إحنا بنجمع إيه وليه ومين بيعالجه.",
    sections: [
      { h: "بنجمع إيه", p: [
        "المستأجرين: الرسائل اللي بتبعتها لمساعد الحجز على الموقع أو واتساب، ورقم الواتساب لما تراسلنا عليه، والاسم ورقم التليفون والإيميل والتواريخ والإضافات اللي بتدّيها لنا علشان نعمل الحجز.",
        "الرسائل الصوتية: التسجيل من مايك الموقع والفويس نوت على واتساب بيتحوّل لنص عن طريق muse-voice-transcribe-1.0 من Meta، والصوت نفسه مش بيتحفظ. اللي بيتحفظ النص بس، كرسالة في المحادثة.",
        "موقعك (للمستأجرين): بس لما تدوس على 📍 أو تبعت لوكيشن على واتساب علشان تلاقي مكاتب قريبة منك. بنقرّبه، ونحفظه مع المحادثة، ومش بنبعته أبداً لنموذج الذكاء الاصطناعي ولا بنكتبه في السجلات.",
        "الملاك: رقم الواتساب اللي بتستخدمه كحساب صاحب المكتب، وفيديوهات الجولة اللي بتبعتها على واتساب أو بترفعها على الموقع، والصور، وموقع المكتب اللي بتبعته (وبيظهر في الإعلان)، وبيانات الإعلان اللي بتكتبها.",
        "عدادات الاستخدام: عدد الطلبات اليومي مربوط بقيمة مشفّرة (hash) لعنوان الـIP أو رقم الواتساب، علشان حدود الاستخدام العادل. مش بنحفظ عنوان الـIP نفسه.",
      ] },
      { h: "بنستخدمه في إيه", p: [
        "علشان نرد على أسئلتك، ونشوف المواعيد المتاحة، ونعمل الحجز، ونبعتلك لينك الدفع ونأكد الحجز.",
        "فيديوهات وصور الملاك بتتعالج بـmuse-spark-1.3 من Meta (مسح الأوض والمواصفات ونص الإعلان) وmuse-image-1.0 (تصورات التجهيز لنفس الأوضة).",
        "رسائل المحادثة وبيانات الحجز بتتعالج بـmuse-spark-1.3 من Meta بإعدادات مش بتسمح باستخدامها في تدريب النماذج. رسائل الواتساب بتعدّي على منصة WhatsApp Business من Meta.",
        "مش بنبيع بياناتك ولا بنستخدمها في الإعلانات.",
      ] },
      { h: "الكوكيز", p: [
        "بنستخدم كوكيز بتاعتنا إحنا بس، وكلها لازمة علشان الموقع يشتغل. مفيش كوكيز تتبّع ولا إعلانات.",
        "offisio-lang بيفتكر لغتك. offisio_owner بيخلّي صاحب المكتب مسجّل دخول 24 ساعة، وoffisio_login بيحفظ تسجيل الدخول اللي لسه شغال لمدة 10 دقايق. offisio_guest بيربط المسودة الخاصة اللي رفعتها بالمتصفح بتاعك. offisio_preview بيخلّي تعديلاتك على الإعلان التجريبي ظاهرة عندك إنت بس.",
      ] },
      { h: "مين بيعالجها", p: [
        "Meta (واجهة النماذج ومنصة WhatsApp Business)، وVercel (الاستضافة وتخزين الميديا)، وNeon (قاعدة البيانات)، وXPay (الدفع، وضع تجريبي بس؛ بيانات الكارت بتروح لـXPay ومش بتوصلنا)، وUpstash QStash (المهام في الخلفية للإعلانات الجديدة).",
        "Google Places بيوصله إحداثيات المكتب بس (وأسماء الأماكن من لينكات الخرايط اللي بيبعتها الملاك) علشان نلاقي الكافيهات والمطاعم القريبة. عمره ما بيوصله أي بيانات عن المستأجرين.",
      ] },
      { id: "delete", h: "مدة الحفظ والمسح", p: [
        "دي نسخة تجريبية. سجل المحادثة بيحتفظ بآخر الرسائل بس، والحجوزات والمحادثات التجريبية بتتمسح بعد فترة التجربة.",
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
  return <LegalPage locale={locale} copy={COPY[locale]} />;
}
