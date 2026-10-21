import { notFound } from "next/navigation";
import { VenueDetail } from "@/app/admin/VenueDetail";
import { isWorkspaceId } from "@/lib/admin-venue-workspace";

export default async function VenuePage({ params }: { params: Promise<{ venueId: string }> }) {
  const { venueId } = await params;
  if (!isWorkspaceId(venueId)) notFound();
  return <VenueDetail key={venueId} venueId={venueId} />;
}
