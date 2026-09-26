"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Code2, Newspaper } from "lucide-react";
import { UserMenu } from "./UserMenu";
import { GlobalSearch } from "./GlobalSearch";
import { AdminNavigationLink } from "./AdminNavigationLink";

export function TopNavigation({
  systemDesignEnabled,
}: {
  systemDesignEnabled: boolean;
}) {
  const pathname = usePathname();
  const active = (path: string) => pathname === path || pathname.startsWith(`${path}/`);
  const linkClass = (path: string) => `flex items-center gap-2 rounded-md py-2 text-sm font-medium transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent ${active(path) ? "text-accent" : "text-muted"}`;
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-surface/80 backdrop-blur">
      <div className="max-w-7xl mx-auto flex h-14 items-center justify-between px-4 sm:px-6 lg:px-8 gap-2 sm:gap-4">
        
        <Link href="/" className="flex items-center space-x-2 shrink-0">
          <span className="font-bold sm:inline-block text-accent">ReasonAI</span>
        </Link>
        
        <nav aria-label="Main navigation" className="flex items-center gap-3 md:gap-6 shrink-0">
          <Link href="/dsa" aria-label="DSA" title="DSA" aria-current={active("/dsa") ? "page" : undefined} className={linkClass("/dsa")}>
            <Code2 size={20} aria-hidden="true" className="sm:hidden" />
            <span className="hidden sm:inline">DSA</span>
          </Link>
          <AdminNavigationLink
            systemDesignEnabled={systemDesignEnabled}
          />
          <Link href="/feed" aria-label="Feed" title="Feed" aria-current={active("/feed") ? "page" : undefined} className={linkClass("/feed")}>
            <Newspaper size={18} aria-hidden="true" />
            <span className="hidden sm:inline">Feed</span>
          </Link>
        </nav>
        
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
