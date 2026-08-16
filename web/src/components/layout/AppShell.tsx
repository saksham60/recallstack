"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { TopNavigation } from "./TopNavigation";

export function AppShell({
  children,
  systemDesignEnabled,
}: {
  children: React.ReactNode;
  systemDesignEnabled: boolean;
}) {
  const pathname = usePathname();
  const isSystemDesignEditor =
    pathname.startsWith("/system-design/") && pathname !== "/system-design/";

  return (
    <div className="flex flex-col min-h-screen">
      <TopNavigation systemDesignEnabled={systemDesignEnabled} />
      <main
        className={
          isSystemDesignEditor
            ? "min-h-0 w-full flex-1"
            : "mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8"
        }
      >
        {children}
      </main>
    </div>
  );
}
