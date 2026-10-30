"use client";
import { useState } from "react";
import Link from "next/link";
import { errorText, getT, localeHref, type Locale } from "@/lib/i18n";

interface Msg { role: "user" | "assistant"; content: string }

export default function ChatBox({ locale }: { locale: Locale }) {
  const t = getT(locale);
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "assistant", content: t("chat.greeting") }]);
  const [input, setInput] = useState(""); const [busy, setBusy] = useState(false);
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
      setMsgs((m) => [...m, { role: "assistant", content: data.reply }]);
      if (data.booking_id) setBookingId(data.booking_id);
    } catch (e) { setMsgs((m) => [...m, { role: "assistant", content: `${t("chat.errorPrefix")}${errorText(t, (e as Error).message)}` }]); }
    setBusy(false);
  }

  return (
    <div className="flex flex-col border border-ink bg-board/40 h-[70vh]">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {msgs.map((m, i) => (
          <div key={i} className={`max-w-[85%] px-3 py-2 text-sm leading-relaxed ${m.role === "user" ? "ms-auto bg-chalk text-white" : "me-auto bg-sheet border border-ink text-ink"}`}>{m.content}</div>
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
