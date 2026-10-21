import { notFound } from "next/navigation";
import { VenueWorkspace } from "@/app/admin/VenueWorkspace";
import { isWorkspaceId } from "@/lib/admin-venue-workspace";

export default async function VenuePage({ params }: { params: Promise<{ venueId: string }> }) {
  const { venueId } = await params;
  if (!isWorkspaceId(venueId)) notFound();
  return <VenueWorkspace venueId={venueId} />;
}
