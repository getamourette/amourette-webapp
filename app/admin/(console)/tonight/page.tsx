import { Suspense } from "react";
import { Tonight } from "@/app/admin/Tonight";

export default function TonightPage() {
  return <Suspense fallback={<p>Loading Tonight…</p>}><Tonight /></Suspense>;
}
