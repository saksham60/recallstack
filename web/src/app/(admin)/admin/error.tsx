"use client";

import { QueryError } from "@/features/admin/components/AdminPrimitives";

export default function AdminError({ error, reset }: { error: Error; reset: () => void }) {
  return <QueryError error={error} retry={reset} resource="admin page" />;
}
