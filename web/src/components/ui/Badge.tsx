import React from "react";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "danger" | "outline" | "secondary";
  children: React.ReactNode;
}

export function Badge({ variant = "default", children, className = "", ...props }: BadgeProps) {
  let variantClasses = "";
  
  switch (variant) {
    case "success":
      variantClasses = "bg-success/20 text-success border border-success/30";
      break;
    case "warning":
      variantClasses = "bg-warning/20 text-warning border border-warning/30";
      break;
    case "danger":
      variantClasses = "bg-danger/20 text-danger border border-danger/30";
      break;
    case "outline":
      variantClasses = "bg-transparent text-foreground border border-border";
      break;
    case "secondary":
      variantClasses = "bg-surface-elevated text-muted border border-border";
      break;
    default:
      variantClasses = "bg-accent/20 text-accent border border-accent/30";
      break;
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${variantClasses} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
