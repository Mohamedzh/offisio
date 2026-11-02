// Agent replies use light markdown (**bold**, "1." / "-" lists, line breaks, links).
// Render just that, as React nodes (no HTML injection, no markdown dependency).
import type { ReactNode } from "react";

const INLINE = /(\*\*[^*\n]+\*\*|\*[^*\s][^*\n]*\*|https?:\/\/[^\s)]+)/g;

function inline(text: string): ReactNode[] {
  return text.split(INLINE).filter(Boolean).map((part, i) => {
    if (/^\*\*.+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (/^\*.+\*$/.test(part)) return <strong key={i}>{part.slice(1, -1)}</strong>;
    if (/^https?:\/\//.test(part)) return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="link break-all" dir="ltr">{part}</a>;
    return part;
  });
}

// Direction from the message itself (an Arabic reply on the English page is still RTL).
export const textDir = (text: string): "rtl" | "ltr" =>
  (text.match(/[؀-ۿ]/g)?.length ?? 0) > (text.match(/[A-Za-z]/g)?.length ?? 0) ? "rtl" : "ltr";

export default function ChatText({ text }: { text: string }) {
  const lines = text.replace(/^#{1,6}\s+/gm, "").split("\n");
  return (
    <div dir={textDir(text)} className="space-y-1">
      {lines.map((line, i) => {
        const t = line.trim();
        if (!t) return null;
        const bullet = t.match(/^[-*•]\s+(.*)$/);
        const num = t.match(/^(\d+)[.)]\s+(.*)$/);
        if (bullet) return <p key={i} className="ps-4 relative"><span className="absolute start-0" aria-hidden>•</span>{inline(bullet[1])}</p>;
        if (num) return <p key={i} className="ps-5 relative"><span className="absolute start-0 tnum">{num[1]}.</span>{inline(num[2])}</p>;
        return <p key={i}>{inline(t)}</p>;
      })}
    </div>
  );
}
