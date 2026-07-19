import React from "react";

interface ProgressBarProps {
  progress: number;
  className?: string;
  colorClass?: string;
}

export function ProgressBar({ progress, className = "", colorClass = "bg-accent" }: ProgressBarProps) {
  const clampedProgress = Math.max(0, Math.min(100, progress));
  
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-surface-elevated ${className}`}>
      <div
        className={`h-full transition-all duration-300 ease-in-out ${colorClass}`}
        style={{ width: `${clampedProgress}%` }}
      />
    </div>
  );
}
