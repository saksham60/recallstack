import type { ReactNode } from "react";
import { AdminGate } from "@/features/admin";
import { isSystemDesignAdminEnabled } from "@/lib/config/server";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminGate systemDesignEnabled={isSystemDesignAdminEnabled()}>
      {children}
    </AdminGate>
  );
}
