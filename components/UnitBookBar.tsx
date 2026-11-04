"use client";
// Phone-only sticky "price + Book" bar on a bookable unit page. It hides while the
// inline CTA under the title or the booking form itself is on screen, so it never
// doubles up with them. WhatsAppFloat rides above it via [data-wa-lift].
import { useEffect, useState } from "react";

export default function UnitBookBar({ price, label, targets }: { price: string; label: string; targets: string[] }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const els = targets.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    if (!els.length) return;
    const seen = new Map<Element, boolean>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) seen.set(e.target, e.isIntersecting);
      setShow(![...seen.values()].some(Boolean));
    });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [targets]);
  return (
    <div data-wa-lift hidden={!show}
      className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t-2 border-ink bg-sheet px-4 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] sm:hidden">
      <span className="tnum font-display font-black text-lg leading-tight"><bdi>{price}</bdi></span>
      <a href={`#${targets[targets.length - 1]}`} className="btn btn-brick btn-md">{label}</a>
    </div>
  );
}
