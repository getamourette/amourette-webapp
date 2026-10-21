import type { ReactNode } from "react";
import AdminShell from "@/app/admin/AdminShell";

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
