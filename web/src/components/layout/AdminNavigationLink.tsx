"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Network } from "lucide-react";
import { useProfile } from "@/features/profile";

export function AdminNavigationLink({
  systemDesignEnabled,
}: {
  systemDesignEnabled: boolean;
}) {
  const { data } = useProfile();
  const pathname = usePathname();
  const isAdmin = data?.roles.includes("admin") ?? false;

  return (
    <>
      {systemDesignEnabled && (
        <Link
          href="/system-design"
          aria-label="System Design"
          title="System Design"
          aria-current={pathname.startsWith("/system-design") ? "page" : undefined}
          className={`flex items-center py-2 text-sm font-medium transition-colors hover:text-foreground ${pathname.startsWith("/system-design") ? "text-accent" : "text-muted"}`}
        >
          <Network
            aria-hidden="true"
            className="h-5 w-5 sm:hidden"
          />
          <span className="hidden sm:inline">System Design</span>
        </Link>
      )}
      {isAdmin && (
        <Link
          href="/admin"
          className="text-sm font-medium text-warning transition-colors hover:text-foreground"
        >
          Admin
        </Link>
      )}
    </>
  );
}
