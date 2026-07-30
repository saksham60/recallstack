import React from "react";
import { AppShell } from "@/components/layout/AppShell";
import { isSystemDesignAdminEnabled } from "@/lib/config/server";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell
      systemDesignEnabled={isSystemDesignAdminEnabled()}
    >
      {children}
    </AppShell>
  );
}
