import type { ReactNode } from "react";

interface ErrorStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function ErrorState({
  title,
  description = "Please try again later.",
  action,
  className = "",
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={`rounded-md border border-danger/20 bg-surface-elevated p-6 text-center ${className}`}
    >
      <h3 className="text-lg font-medium text-danger">{title}</h3>
      <p className="mt-2 text-sm text-muted">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
