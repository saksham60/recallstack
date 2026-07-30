import React from "react";
import { TopNavigation } from "./TopNavigation";

export function AppShell({
  children,
  systemDesignEnabled,
}: {
  children: React.ReactNode;
  systemDesignEnabled: boolean;
}) {
  return (
    <div className="flex flex-col min-h-screen">
      <TopNavigation systemDesignEnabled={systemDesignEnabled} />
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
