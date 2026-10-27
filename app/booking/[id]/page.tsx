import Link from "next/link";
import BookingActions from "@/components/BookingActions";

export const instant = false;

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <Link href="/" className="text-sm text-zinc-500">← كل المكاتب</Link>
      <h1 className="text-2xl font-bold mt-2 mb-4">حجزك</h1>
      <BookingActions id={id} />
      <p className="text-xs text-zinc-500 mt-4">الحجز يتأكد بس بعد ما Paymob يبعت تأكيد الدفع (test mode). الرجوع من صفحة الدفع لوحده مش تأكيد.</p>
    </main>
  );
}
