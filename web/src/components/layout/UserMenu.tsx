"use client";

import React from "react";
import Link from "next/link";
import { useProfile } from "@/features/auth/use-profile";
import { useAuth } from "@/features/auth/AuthProvider";

export function UserMenu() {
  const { data: profile, isLoading } = useProfile();
  const { signOut } = useAuth();

  const getInitial = () => {
    if (profile?.display_name) {
      return profile.display_name.charAt(0).toUpperCase();
    }
    return "U";
  };

  return (
    <div className="relative group">
      <Link href="/profile" className="flex items-center justify-center w-8 h-8 rounded-full bg-surface-elevated border border-border hover:border-accent text-sm font-medium transition-colors text-foreground">
        {isLoading ? "..." : getInitial()}
      </Link>
      
      {/* Simple dropdown for sign out */}
      <div className="absolute right-0 mt-2 w-48 rounded-md bg-surface-elevated border border-border shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
        <div className="py-1">
          <Link href="/profile" className="block px-4 py-2 text-sm text-foreground hover:bg-surface hover:text-accent">
            Profile Settings
          </Link>
          <button 
            onClick={signOut}
            className="block w-full text-left px-4 py-2 text-sm text-danger hover:bg-surface"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
