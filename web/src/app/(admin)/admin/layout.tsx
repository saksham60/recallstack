import type { ReactNode } from "react";
import { AdminGate } from "@/features/admin";
import { isSystemDesignEnabled } from "@/lib/config/server";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminGate systemDesignEnabled={isSystemDesignEnabled()}>
      {children}
    </AdminGate>
  );
}
