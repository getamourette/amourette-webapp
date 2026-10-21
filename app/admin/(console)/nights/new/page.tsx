import { Suspense } from "react";
import { CreateNight } from "@/app/admin/CreateNight";

export default function CreateNightRoute() {
  return <Suspense fallback={<p role="status">Loading venues…</p>}><CreateNight /></Suspense>;
}
