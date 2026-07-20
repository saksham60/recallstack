"use client";

import React from "react";
import Link from "next/link";
import { useCategories } from "@/features/catalog/use-categories";
import { ProgressBar } from "@/components/ui/ProgressBar";

export default function DSAPage() {
  const { data: categories, isLoading, error } = useCategories();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Data Structures & Algorithms</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 rounded-xl border border-border bg-surface shadow-sm animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-surface-elevated p-6 text-center border border-danger/20">
        <h3 className="text-lg font-medium text-danger">Failed to load categories</h3>
        <p className="text-muted text-sm mt-2">Please try again later.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Data Structures & Algorithms</h1>
        <p className="text-muted text-sm mt-1">Master the core patterns.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {categories?.map((category) => {
          const totalProgress = category.total_content_items > 0 
            ? ((category.mastered_count + category.confident_count) / category.total_content_items) * 100 
            : 0;

          return (
            <Link 
              key={category.id} 
              href={`/dsa/${category.id}`}
              className="group flex flex-col rounded-xl border border-border bg-surface p-5 shadow-sm transition-all hover:border-accent hover:shadow-md"
            >
              <div className="flex justify-between items-start mb-4">
                <h3 className="font-semibold tracking-tight group-hover:text-accent transition-colors">{category.name}</h3>
                <span className="text-xs text-muted font-medium bg-surface-elevated px-2 py-1 rounded">
                  {category.total_content_items} items
                </span>
              </div>
              
              <div className="mt-auto space-y-3">
                <ProgressBar progress={totalProgress} />
                
                <div className="flex justify-between text-xs text-muted">
                  <span>{Math.round(totalProgress)}% Complete</span>
                  <div className="flex gap-2">
                    <span title="Mastered" className="text-success">{category.mastered_count} M</span>
                    <span title="Confident" className="text-accent">{category.confident_count} C</span>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
