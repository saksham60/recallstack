import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { isSystemDesignEnabled } from "@/lib/config/server";

export default function SystemDesignLayout({
  children,
}: {
  children: ReactNode;
}) {
  if (!isSystemDesignEnabled()) notFound();

  return children;
}
