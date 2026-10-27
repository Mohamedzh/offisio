import Link from "next/link";
import ChatBox from "@/components/ChatBox";

export default function ChatPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <Link href="/" className="text-sm text-zinc-500">← كل المكاتب</Link>
      <h1 className="text-2xl font-bold mt-2 mb-1">احجز بالمحادثة</h1>
      <p className="text-sm text-zinc-500 mb-4">اتكلم بالمصري عادي. الوكيل يقدر يضيف قهوة من الكافيه للحجز.</p>
      <ChatBox />
    </main>
  );
}
