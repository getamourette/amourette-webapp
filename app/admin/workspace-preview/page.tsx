import { notFound } from "next/navigation";
import WorkspacePreview from "@/docs/brand/explorations/admin-workspace/WorkspacePreview";

export default function WorkspacePreviewPage() {
  // Local design comparison only. No founder gate or database access is bypassed.
  if (process.env.NODE_ENV !== "development") notFound();
  return <WorkspacePreview />;
}
