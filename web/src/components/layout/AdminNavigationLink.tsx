"use client";

import Link from "next/link";
import { Network } from "lucide-react";
import { useProfile } from "@/features/profile";

export function AdminNavigationLink({
  systemDesignEnabled,
}: {
  systemDesignEnabled: boolean;
}) {
  const { data } = useProfile();
  if (!data?.roles.includes("admin")) return null;
  return (
    <>
      {systemDesignEnabled && (
        <Link
          href="/admin/system-design"
          aria-label="System Design"
          className="flex items-center text-sm font-medium text-accent transition-colors hover:text-foreground"
        >
          <Network
            aria-hidden="true"
            className="h-5 w-5 sm:hidden"
          />
          <span className="hidden sm:inline">System Design</span>
        </Link>
      )}
      <Link
        href="/admin"
        className="text-sm font-medium text-warning transition-colors hover:text-foreground"
      >
        Admin
      </Link>
    </>
  );
}
