"use client";

import dynamic from "next/dynamic";
import { LoadingSkeleton } from "@/features/admin/components/AdminPrimitives";
import type { SystemDesignProblem } from "../types/system-design.types";

const SystemDesignWorkspace = dynamic(
  () =>
    import("../components/SystemDesignWorkspace").then(
      (module) => module.SystemDesignWorkspace,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[calc(100vh-57px)] p-6">
        <LoadingSkeleton rows={9} />
      </div>
    ),
  },
);

export function SystemDesignEditorScreen({
  problem,
}: {
  problem: SystemDesignProblem;
}) {
  return <SystemDesignWorkspace problem={problem} />;
}
