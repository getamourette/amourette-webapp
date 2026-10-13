import { notFound } from "next/navigation";
import AdminClient from "@/app/admin/AdminClient";
import { isWorkspaceId } from "@/lib/admin-venue-workspace";

export default async function NightPage({ params }: { params: Promise<{ venueId: string; nightId: string }> }) {
  const { venueId, nightId } = await params;
  if (!isWorkspaceId(venueId) || !isWorkspaceId(nightId)) notFound();
  return <AdminClient venueId={venueId} selectedNightId={nightId} />;
}
