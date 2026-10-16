import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isUuid } from "@/lib/input-validation";
import { EventBooking } from "@/components/booking/EventBooking";
export const metadata: Metadata = { title: "Amourette · Reservations", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function EventPage({ params }: { params: Promise<{ nightId: string }> }) {
  const { nightId } = await params;
  if (!isUuid(nightId)) notFound();
  return <EventBooking night={nightId.toLowerCase()} />;
}
