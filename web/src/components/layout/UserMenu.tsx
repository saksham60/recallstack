"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/features/auth";
import { useProfile } from "@/features/profile";

export function UserMenu() {
  const { data: profile, isLoading } = useProfile();
  const { signOut } = useAuth();
  const [signOutError, setSignOutError] = useState(false);

  const handleSignOut = async () => {
    setSignOutError(false);
    try {
      await signOut();
    } catch {
      setSignOutError(true);
    }
  };

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
            onClick={handleSignOut}
            className="block w-full text-left px-4 py-2 text-sm text-danger hover:bg-surface"
          >
            Sign Out
          </button>
          {signOutError && <p className="px-4 py-2 text-xs text-danger" role="alert">Sign out failed. Please try again.</p>}
        </div>
      </div>
    </div>
  );
}
