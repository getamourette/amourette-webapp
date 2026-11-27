import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isUuid } from "@/lib/input-validation";
import { EventBooking } from "@/components/booking/EventBooking";
import { bookingChannel } from "@/lib/launch-contract";
export const metadata: Metadata = { title: "Amourette · Reservations", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function EventPage({ params, searchParams }: { params: Promise<{ nightId: string }>; searchParams: Promise<{ via?: string | string[] }> }) {
  const { nightId } = await params;
  if (!isUuid(nightId)) notFound();
  // #561: which posted link brought the guest; an unknown value is simply absent.
  return <EventBooking night={nightId.toLowerCase()} channel={bookingChannel((await searchParams).via)} />;
}
