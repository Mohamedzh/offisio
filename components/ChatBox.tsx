"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { errorText, formatEgp, getT, localeHref, type Locale } from "@/lib/i18n";
import ChatText from "./ChatText";

interface Card { slug: string; title_en: string; title_ar: string; district: string; rent_egp: number; daily_egp: number | null; image: string; synthetic: boolean }
interface Msg { role: "user" | "assistant"; content: string; units?: Card[] }

export default function ChatBox({ locale }: { locale: Locale }) {
  const t = getT(locale);
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "assistant", content: t("chat.greeting") }]);
  const [input, setInput] = useState(""); const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  // Keep the newest message (and its photo cards) in view.
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [msgs]);
  const [session, setSession] = useState<string | undefined>(); const [bookingId, setBookingId] = useState<string | null>(null);

  async function send() {
    if (!input.trim() || busy) return;
    const text = input; setInput(""); setBusy(true);
    setMsgs((m) => [...m, { role: "user", content: text }]);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: session, message: text }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSession(data.session_id);
      setMsgs((m) => [...m, { role: "assistant", content: data.reply, units: data.units ?? [] }]);
      if (data.booking_id) setBookingId(data.booking_id);
    } catch (e) { setMsgs((m) => [...m, { role: "assistant", content: `${t("chat.errorPrefix")}${errorText(t, (e as Error).message)}` }]); }
    setBusy(false);
  }

  return (
    <div className="flex flex-col border border-ink bg-board/40 h-[70vh]">
      <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {msgs.map((m, i) => (
          <Fragment key={i}>
          <div className={`max-w-[85%] px-3 py-2 text-sm leading-relaxed ${m.role === "user" ? "ms-auto bg-chalk text-white whitespace-pre-line" : "me-auto bg-sheet border border-ink text-ink"}`}>{m.role === "assistant" ? <ChatText text={m.content} /> : m.content}</div>
          {m.units && m.units.length > 0 && (
            <div className="me-auto grid w-full max-w-[85%] grid-cols-1 gap-2 sm:grid-cols-3">
              {m.units.map((u) => (
                <Link key={u.slug} href={localeHref(`/units/${u.slug}`, locale)} target="_blank" className="block border border-ink bg-sheet text-ink transition-transform hover:-translate-y-0.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u.image} alt={locale === "ar" ? u.title_ar : u.title_en} loading="lazy" onLoad={() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight })} className="aspect-[4/3] w-full object-cover" />
                  <div className="p-2 text-xs">
                    <p className="font-bold line-clamp-2">{locale === "ar" ? u.title_ar : u.title_en}</p>
                    <p className="tnum text-ink/75 mt-0.5">{u.daily_egp ? `${formatEgp(locale, u.daily_egp)}${t("unit.perDay")}` : `${formatEgp(locale, u.rent_egp)}${t("unit.perMonth")}`}</p>
                    {u.synthetic && <p className="mt-1 text-[10px] text-ink/60">{t("chat.aiPhotos")}</p>}
                  </div>
                </Link>
              ))}
            </div>
          )}
          </Fragment>
        ))}
        {busy && <p className="text-xs text-ink/75">{t("chat.typing")}</p>}
      </div>
      {bookingId && <Link href={localeHref(`/booking/${bookingId}`, locale)} className="btn btn-chalk btn-sm mx-4 mb-2">{t("chat.completePayment")}</Link>}
      <div className="flex gap-2 p-3 border-t border-ink bg-sheet">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder={t("chat.placeholder")} className="field flex-1 w-auto!" />
        <button onClick={send} disabled={busy} className="btn btn-brick px-4">{t("chat.send")}</button>
      </div>
    </div>
  );
}
