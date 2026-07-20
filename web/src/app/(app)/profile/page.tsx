"use client";

import React, { useState } from "react";
import { useProfile, useUpdateProfile, type ProfileResponse } from "@/features/auth/use-profile";
import { useAuth } from "@/features/auth/AuthProvider";

function ProfileForm({ profile }: { profile: ProfileResponse }) {
  const { mutate: updateProfile, isPending: isUpdating } = useUpdateProfile();
  
  const [displayName, setDisplayName] = useState(profile.display_name || "");
  const [timezone, setTimezone] = useState(profile.timezone || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile({
      display_name: displayName,
      timezone: timezone,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-6">
      <div className="space-y-4">
        <div>
          <label htmlFor="displayName" className="block text-sm font-medium text-foreground mb-1">
            Display Name
          </label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full bg-surface-elevated border border-border rounded-md py-2 px-3 text-sm text-foreground focus:outline-none focus:border-accent"
          />
        </div>
        
        <div>
          <label htmlFor="timezone" className="block text-sm font-medium text-foreground mb-1">
            Timezone
          </label>
          <input
            id="timezone"
            type="text"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full bg-surface-elevated border border-border rounded-md py-2 px-3 text-sm text-foreground focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      <div className="pt-4 border-t border-border flex justify-end">
        <button
          type="submit"
          disabled={isUpdating || (displayName === profile.display_name && timezone === profile.timezone)}
          className="py-2 px-4 bg-accent text-accent-foreground rounded-md font-medium text-sm disabled:opacity-50 transition-colors"
        >
          {isUpdating ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  );
}

export default function ProfilePage() {
  const { data: profile, isLoading } = useProfile();
  const { user } = useAuth();
  
  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Profile Settings</h1>
        <div className="h-64 rounded-xl border border-border bg-surface shadow-sm animate-pulse" />
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profile Settings</h1>
        <p className="text-muted text-sm mt-1">Manage your account and preferences.</p>
      </div>

      <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
        <div className="p-6 border-b border-border bg-surface-elevated">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center text-2xl font-bold text-accent-foreground">
              {profile.display_name?.charAt(0).toUpperCase() || "U"}
            </div>
            <div>
              <h2 className="text-xl font-semibold">{profile.display_name || "Anonymous User"}</h2>
              <p className="text-muted text-sm">{user?.email}</p>
            </div>
          </div>
        </div>

        <ProfileForm key={profile.id || 'new'} profile={profile} />
      </div>
    </div>
  );
}
