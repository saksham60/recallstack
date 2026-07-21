"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/ErrorState";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Unhandled application error", error);
  }, [error]);

  return (
    <ErrorState
      title="Something went wrong"
      description="The page could not be displayed. Try loading it again."
      action={<button type="button" onClick={reset} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">Try again</button>}
    />
  );
}
