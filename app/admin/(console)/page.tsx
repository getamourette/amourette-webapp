import { Suspense } from "react";
import { NightsHome } from "@/app/admin/NightsHome";

export default function AdminPage() {
  return <Suspense fallback={<p>Loading nights…</p>}><NightsHome /></Suspense>;
}
