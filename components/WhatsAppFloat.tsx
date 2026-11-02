"use client";
// Fixed "Book on WhatsApp" link that steps aside (fades out, not clickable) while
// any [data-wa-avoid] region, e.g. the booking form, is under it.
import { useEffect, useRef, useState, type ReactNode } from "react";

export default function WhatsAppFloat({ className, children, ...a }: { href: string; "aria-label": string; className: string; children: ReactNode }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const avoid = [...document.querySelectorAll<HTMLElement>("[data-wa-avoid]")];
    if (!avoid.length) return;
    let frame = 0;
    const check = () => {
      frame = 0;
      const a = ref.current;
      if (!a) return;
      // Never yank the link away from a keyboard user who is on it.
      if (document.activeElement === a) { setHidden(false); return; }
      const r = a.getBoundingClientRect();
      setHidden(avoid.some((el) => {
        const q = el.getBoundingClientRect();
        return q.left < r.right + 8 && q.right > r.left - 8 && q.top < r.bottom + 8 && q.bottom > r.top - 8;
      }));
    };
    const onChange = () => { if (!frame) frame = requestAnimationFrame(check); };
    check();
    // Regions can grow without a scroll (e.g. the add-ons <details> opening).
    const ro = new ResizeObserver(onChange);
    avoid.forEach((el) => ro.observe(el));
    const a = ref.current;
    window.addEventListener("scroll", onChange, { passive: true });
    window.addEventListener("resize", onChange);
    a?.addEventListener("focusout", onChange);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", onChange); window.removeEventListener("resize", onChange);
      a?.removeEventListener("focusout", onChange);
      cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <a ref={ref} {...a} target="_blank" rel="noopener noreferrer" aria-hidden={hidden || undefined} tabIndex={hidden ? -1 : undefined}
      className={`${className} transition-[opacity,translate,box-shadow,background-color] duration-150 ${hidden ? "pointer-events-none opacity-0" : "opacity-100"}`}>
      {children}
    </a>
  );
}
