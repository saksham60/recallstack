"use client";

import Link from "next/link";
import { useProfile } from "@/features/profile";

export function AdminNavigationLink() {
  const { data } = useProfile();
  if (!data?.roles.includes("admin")) return null;
  return (
    <Link href="/admin" className="text-sm font-medium text-warning hover:text-foreground transition-colors">
      Admin
    </Link>
  );
}
