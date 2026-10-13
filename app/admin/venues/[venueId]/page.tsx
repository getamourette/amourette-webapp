import { notFound } from "next/navigation";
import AdminClient from "@/app/admin/AdminClient";
import { isWorkspaceId } from "@/lib/admin-venue-workspace";

export default async function VenuePage({ params }: { params: Promise<{ venueId: string }> }) {
  const { venueId } = await params;
  if (!isWorkspaceId(venueId)) notFound();
  return <AdminClient venueId={venueId} />;
}
