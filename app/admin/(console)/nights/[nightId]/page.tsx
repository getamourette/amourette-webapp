import { notFound } from "next/navigation";
import { NightBridge } from "@/app/admin/NightBridge";
import { isWorkspaceId } from "@/lib/admin-venue-workspace";

export default async function NightPage({ params }: { params: Promise<{ nightId: string }> }) {
  const { nightId } = await params;
  if (!isWorkspaceId(nightId)) notFound();
  return <NightBridge key={nightId} nightId={nightId} />;
}
