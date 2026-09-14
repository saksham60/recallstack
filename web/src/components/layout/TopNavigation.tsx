import React from "react";
import Link from "next/link";
import { UserMenu } from "./UserMenu";
import { GlobalSearch } from "./GlobalSearch";
import { AdminNavigationLink } from "./AdminNavigationLink";

export function TopNavigation({
  systemDesignEnabled,
}: {
  systemDesignEnabled: boolean;
}) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-surface/80 backdrop-blur">
      <div className="max-w-7xl mx-auto flex h-14 items-center justify-between px-4 sm:px-6 lg:px-8 gap-2 sm:gap-4">
        
        <Link href="/" className="flex items-center space-x-2 shrink-0">
          <span className="font-bold sm:inline-block text-accent">ReasonAI</span>
        </Link>
        
        <div className="flex items-center gap-2 md:gap-6 shrink-0">
          <Link href="/dsa" className="text-sm font-medium text-muted hover:text-foreground transition-colors hidden sm:block">
            DSA
          </Link>
          <Link href="/dsa" className="text-sm font-medium text-muted hover:text-foreground transition-colors sm:hidden">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </Link>
          <AdminNavigationLink
            systemDesignEnabled={systemDesignEnabled}
          />
        </div>
        
        <div className="flex-1 max-w-xl mx-auto flex justify-center w-full min-w-0">
          <GlobalSearch />
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <UserMenu />
        </div>

      </div>
    </header>
  );
}
