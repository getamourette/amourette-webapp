import { Suspense } from "react";
import { notFound } from "next/navigation";
import { NightPage } from "@/app/admin/NightPage";
import { isWorkspaceId } from "@/lib/admin-venue-workspace";

export default async function NightRoute({ params }: { params: Promise<{ nightId: string }> }) {
  const { nightId } = await params;
  if (!isWorkspaceId(nightId)) notFound();
  return <Suspense fallback={<p role="status">Loading night…</p>}><NightPage key={nightId} nightId={nightId} /></Suspense>;
}
