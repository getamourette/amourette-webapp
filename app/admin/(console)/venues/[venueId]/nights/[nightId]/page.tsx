import { notFound, permanentRedirect } from "next/navigation";
import { isWorkspaceId } from "@/lib/admin-venue-workspace";

export default async function NightPage({ params }: { params: Promise<{ venueId: string; nightId: string }> }) {
  const { venueId, nightId } = await params;
  if (!isWorkspaceId(venueId) || !isWorkspaceId(nightId)) notFound();
  permanentRedirect(`/admin/nights/${nightId}`);
}
