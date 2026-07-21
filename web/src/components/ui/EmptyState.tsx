import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`rounded-xl border border-dashed border-border bg-surface/50 px-6 py-12 text-center ${className}`}
    >
      {icon && <div className="mb-4 text-4xl" aria-hidden="true">{icon}</div>}
      <h3 className="font-medium text-foreground">{title}</h3>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
