import type { Metadata } from "next";
import { SurveyView } from "@/components/booking/SurveyView";
export const metadata: Metadata = { title: "Amourette · Survey", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function SurveyPage() { return <SurveyView />; }
