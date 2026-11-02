"use client";
// "Signed in as +20 10x xxx x678 · Sign out". The number arrives already masked.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getT, type Locale } from "@/lib/i18n";

export default function OwnerBar({ phone, locale, className = "" }: { phone: string; locale: Locale; className?: string }) {
  const router = useRouter(); const t = getT(locale);
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => null);
    setBusy(false);
    router.refresh();
  }
  return (
    <p className={`text-sm text-ink/75 ${className}`}>
      {t("owner.signedInAs")} <bdi dir="ltr" className="tnum">{phone}</bdi> ·{" "}
      <button type="button" onClick={signOut} disabled={busy} className="link">{t("owner.signOut")}</button>
    </p>
  );
}
