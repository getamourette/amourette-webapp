import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isUuid } from "@/lib/input-validation";
import { EventBooking } from "@/components/booking/EventBooking";
import { bookingChannel } from "@/lib/launch-contract";
import { parseBookingEvent, type BookingEvent } from "@/lib/booking";
import { launchRpc } from "@/lib/server/launch-service";
export const metadata: Metadata = { title: "Amourette · Reservations", robots: { index: false, follow: false }, referrer: "no-referrer" };
// The page arrives with its evening, so a guest never sees a generic loading screen first.
// The same public payload as GET /api/launch/checkout?night=...; any failure leaves the
// first read to the browser, with its error and retry states. It spends no address budget:
// the budget's own check is a database write, so it would not lighten this read, and guests
// sharing a bar's network keep their allowance for the page's refreshes.
async function initialEvent(night: string): Promise<BookingEvent | null> {
  try { const event = await launchRpc()("launch_booking_event", { p_night: night }); return event === null ? null : parseBookingEvent(event); }
  catch { return null; }
}
export default async function EventPage({ params, searchParams }: { params: Promise<{ nightId: string }>; searchParams: Promise<{ via?: string | string[] }> }) {
  const { nightId } = await params;
  if (!isUuid(nightId)) notFound();
  const night = nightId.toLowerCase();
  // #561: which posted link brought the guest; an unknown value is simply absent.
  return <EventBooking night={night} initial={await initialEvent(night)} channel={bookingChannel((await searchParams).via)} />;
}
