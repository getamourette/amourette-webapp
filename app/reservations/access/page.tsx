import type { Metadata } from "next";
import { AccessView } from "@/components/booking/AccessView";
export const metadata: Metadata = { title: "Amourette · Reservation access", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function AccessPage() { return <AccessView />; }
