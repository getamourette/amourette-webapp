import { Suspense } from "react";
import { VenuesDirectory } from "@/app/admin/VenuesDirectory";

export default function VenuesPage() {
  return <Suspense fallback={<p>Loading venues…</p>}><VenuesDirectory /></Suspense>;
}
