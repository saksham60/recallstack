import type { ReactNode } from "react";
import { AdminGate } from "@/features/admin";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminGate>{children}</AdminGate>;
}
