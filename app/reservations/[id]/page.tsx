import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isUuid } from "@/lib/input-validation";
import { ReservationView } from "@/components/booking/ReservationView";
export const metadata: Metadata = { title: "Amourette · Reservation", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function ReservationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  return <ReservationView id={id.toLowerCase()} />;
}
