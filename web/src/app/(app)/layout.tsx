import React from "react";
import { AppShell } from "@/components/layout/AppShell";
import { isSystemDesignEnabled } from "@/lib/config/server";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell
      systemDesignEnabled={isSystemDesignEnabled()}
    >
      {children}
    </AppShell>
  );
}
