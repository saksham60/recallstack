"use client";

import dynamic from "next/dynamic";
import { LoaderCircle } from "lucide-react";

const SystemDesignWorkspace = dynamic(
  () =>
    import("../components/SystemDesignWorkspace").then(
      (module) => module.SystemDesignWorkspace,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <LoaderCircle
          className="h-7 w-7 animate-spin text-accent"
          aria-label="Loading live canvas"
        />
      </div>
    ),
  },
);

export function LiveSystemDesignCanvasScreen({
  roomToken,
}: {
  roomToken: string;
}) {
  return <SystemDesignWorkspace mode={{ kind: "live", roomToken }} />;
}
