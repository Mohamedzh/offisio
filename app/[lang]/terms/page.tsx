import LegalPage, { type LegalCopy } from "@/components/LegalPage";
import type { Locale } from "@/lib/i18n";
import { localeFromParam } from "@/lib/i18n/server";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";

// Terms of service: the Meta app's Terms of Service URL (docs/plan/06 6.8).
const UPDATED = "2026-11-01";
const COPY: Record<Locale, LegalCopy> = {
  en: {
    title: "Terms of service",
    updated: "Last updated",
    intro: "Offisio is a hackathon demo for listing and booking office space in Egypt, offered free and as is. By using the website or messaging our WhatsApp number you agree to these terms.",
    sections: [
      { h: "A demo, not a live marketplace", p: [
        "Payments run in XPay test mode only: no real money is charged and a booking here does not reserve a real office. Some listings and photos are synthetic or AI-restyled and are labelled as such.",
        "Nearby cafe menus are demo data from public listings (source: elmenus.com, not affiliated) and may be out of date.",
      ] },
      { h: "The booking assistant", p: [
        "Our assistant uses AI and can make mistakes. Check the unit page, dates and total before you pay. Unpaid bookings are held for 30 minutes and then released.",
        "Fair-use limits apply to chats, uploads and bookings, on the website and on WhatsApp. Don't use the service to send spam, abuse, or other people's personal data.",
      ] },
      { h: "Owners' content", p: [
        "Only upload videos and photos of spaces you own or manage and have the right to share. You keep your rights; you let us process the media to produce specs, listing text and restyled photos shown on Offisio.",
      ] },
      { h: "Liability and changes", p: [
        "The service is provided without warranties, and to the extent the law allows we are not liable for losses from using it. We may change or stop the demo, or update these terms, at any time.",
        "How we handle personal data is described in our privacy policy. Questions: open an issue at github.com/Mohamedzh/offisio (do not post personal details there).",
      ] },
    ],
  },
  ar: {
    title: "شروط الاستخدام",
    updated: "آخر تحديث",
    intro: "أوفيسيو نسخة تجريبية لهاكاثون لعرض وحجز المكاتب في مصر، مجانية وزي ما هي. لما تستخدم الموقع أو تراسل رقم الواتساب بتاعنا، إنت موافق على الشروط دي.",
    sections: [
      { h: "نسخة تجريبية، مش سوق حقيقي", p: [
        "الدفع شغال على وضع XPay التجريبي بس: مفيش فلوس حقيقية بتتخصم، والحجز هنا مش بيحجز مكتب حقيقي. بعض الإعلانات والصور اصطناعية أو متعدّلة بالذكاء الاصطناعي ومكتوب عليها كده.",
        "منيو الكافيهات القريبة بيانات تجريبية من قوائم منشورة (المصدر: elmenus.com، من غير أي شراكة) وممكن تكون قديمة.",
      ] },
      { h: "مساعد الحجز", p: [
        "المساعد بيستخدم الذكاء الاصطناعي وممكن يغلط. راجع صفحة المكتب والتواريخ والإجمالي قبل ما تدفع. الحجز اللي مش مدفوع بيفضل محجوز ٣٠ دقيقة وبعدين بيتلغي.",
        "فيه حدود استخدام عادل للشات والرفع والحجوزات، على الموقع وعلى الواتساب. متستخدمش الخدمة في سبام أو إساءة أو بيانات شخصية لناس تانية.",
      ] },
      { h: "محتوى الملاك", p: [
        "ارفع بس فيديوهات وصور لأماكن إنت مالكها أو بتديرها ومن حقك تنشرها. حقوقك بتفضل ليك، وإنت بتسمحلنا نعالج الميديا علشان نطلع المواصفات ونص الإعلان والصور بالتصميمات الجديدة اللي بتظهر على أوفيسيو.",
      ] },
      { h: "المسؤولية والتعديلات", p: [
        "الخدمة متقدمة من غير أي ضمانات، وفي حدود القانون مش بنكون مسؤولين عن أي خسارة من استخدامها. ممكن نغيّر أو نوقف النسخة التجريبية أو نعدّل الشروط دي في أي وقت.",
        "طريقة تعاملنا مع البيانات الشخصية موضحة في سياسة الخصوصية. لأي سؤال: افتح issue على github.com/Mohamedzh/offisio (من غير ما تكتب بياناتك الشخصية هناك).",
      ] },
    ],
  },
};

export async function generateMetadata({ params }: PageProps<"/[lang]/terms">): Promise<Metadata> {
  const locale = localeFromParam((await params).lang);
  return pageMetadata(locale, { title: COPY[locale].title, description: COPY[locale].intro, path: "/terms" });
}

export default async function TermsPage({ params }: PageProps<"/[lang]/terms">) {
  const locale = localeFromParam((await params).lang);
  return <LegalPage locale={locale} copy={COPY[locale]} updated={UPDATED} />;
}
