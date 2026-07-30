import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { SystemDesignAdminOnly } from "@/features/system-design";
import { isSystemDesignAdminEnabled } from "@/lib/config/server";

export default function SystemDesignLayout({
  children,
}: {
  children: ReactNode;
}) {
  const enabled = isSystemDesignAdminEnabled();
  if (!enabled) notFound();

  return (
    <SystemDesignAdminOnly enabled={enabled}>
      {children}
    </SystemDesignAdminOnly>
  );
}
