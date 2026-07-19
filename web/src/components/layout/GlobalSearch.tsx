"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearch } from "@/features/search/use-search";
import { Badge } from "@/components/ui/Badge";

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce the query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, isLoading } = useSearch(debouncedQuery);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = () => {
    setIsOpen(false);
    setQuery("");
    setDebouncedQuery("");
  };

  return (
    <div className="relative w-full max-w-sm" ref={containerRef}>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (query.length > 2) setIsOpen(true);
          }}
          placeholder="Search topics, problems..."
          className="w-full bg-surface-elevated border border-border rounded-full py-1.5 pl-10 pr-4 text-sm text-foreground focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
        />
      </div>

      {isOpen && query.length > 2 && (
        <div className="absolute top-full mt-2 w-full bg-surface-elevated border border-border rounded-xl shadow-lg z-50 overflow-hidden max-h-96 flex flex-col">
          {isLoading && (
            <div className="p-4 text-center text-sm text-muted">Searching...</div>
          )}
          
          {!isLoading && data?.items.length === 0 && (
            <div className="p-4 text-center text-sm text-muted">No results found for "{query}"</div>
          )}

          {!isLoading && data && data.items.length > 0 && (
            <div className="overflow-y-auto py-2">
              {data.items.map((item) => (
                <Link
                  key={item.content_item_id}
                  href={`/content/${item.slug}`}
                  onClick={handleSelect}
                  className="block px-4 py-3 hover:bg-surface transition-colors"
                >
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <h4 className="text-sm font-semibold text-foreground line-clamp-1">{item.title}</h4>
                    {item.difficulty && (
                      <Badge variant={item.difficulty === "hard" ? "danger" : item.difficulty === "medium" ? "warning" : "success"} className="shrink-0 text-[10px] px-1.5 py-0">
                        {item.difficulty}
                      </Badge>
                    )}
                  </div>
                  {item.summary_excerpt && (
                    <p className="text-xs text-muted line-clamp-1">{item.summary_excerpt}</p>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
