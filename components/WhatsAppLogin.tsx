"use client";
// "Sign in with WhatsApp": get a one-time code, open WhatsApp with the message
// pre-filled, then poll until the owner's WhatsApp YES confirms it (up to 10 minutes).
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { errorText, getT, type Locale } from "@/lib/i18n";

const POLL_MS = 1500;
const WAIT_MS = 10 * 60_000;
const deadlineFromNow = () => Date.now() + WAIT_MS; // called from the click handler only
type Phase = "idle" | "starting" | "waiting" | "done" | "expired";

export default function WhatsAppLogin({ locale, redirectTo }: { locale: Locale; redirectTo?: string }) {
  const router = useRouter(); const t = getT(locale);
  const [phase, setPhase] = useState<Phase>("idle");
  const [awaitingYes, setAwaitingYes] = useState(false);
  const [link, setLink] = useState(""); const [code, setCode] = useState(""); const [msg, setMsg] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function poll(deadline: number) {
    timer.current = setTimeout(async () => {
      if (Date.now() > deadline) { setPhase("expired"); return; }
      const data = await fetch("/api/auth/status", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ status: "pending" }));
      if (data.status === "signed_in") {
        setPhase("done");
        if (redirectTo) router.push(redirectTo); else router.refresh();
        return;
      }
      if (data.status === "expired" || data.status === "none") { setPhase("expired"); return; }
      setAwaitingYes(data.status === "awaiting_yes");
      poll(deadline);
    }, POLL_MS);
  }

  async function start() {
    if (timer.current) clearTimeout(timer.current);
    setPhase("starting"); setMsg("");
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok || !data.url) { setPhase("idle"); setMsg(errorText(t, data.error ?? "upload.failed")); return; }
    setLink(data.url); setCode(data.code); setAwaitingYes(false); setPhase("waiting");
    window.open(data.url, "_blank", "noopener");
    poll(deadlineFromNow());
  }

  return (
    <div className="border border-ink bg-sheet p-4">
      <p className="text-sm text-ink/80">{t("login.why")}</p>
      {phase === "waiting" ? (
        <div className="mt-3 space-y-2" role="status" aria-live="polite">
          <p className={`text-sm ${awaitingYes ? "font-bold" : ""}`}>{t(awaitingYes ? "login.awaitingYes" : "login.waiting")}</p>
          <p className="text-sm">{t("login.codeLabel")} <bdi dir="ltr" className="font-mono font-bold tracking-wider">{code}</bdi></p>
          <a href={link} target="_blank" rel="noopener noreferrer" className="btn btn-brick btn-sm inline-block">{t("login.openWhatsApp")}</a>
        </div>
      ) : phase === "done" ? (
        <p className="mt-3 text-sm font-bold" role="status">{t("login.done")}</p>
      ) : (
        <div className="mt-3">
          {phase === "expired" && <p className="mb-2 text-sm text-brick" role="status">{t("login.expired")}</p>}
          <button type="button" onClick={start} disabled={phase === "starting"} className="btn btn-brick px-4 py-2">{t("login.button")}</button>
        </div>
      )}
      {msg && <p className="mt-2 text-sm text-brick" role="alert">{msg}</p>}
    </div>
  );
}
