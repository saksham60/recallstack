"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useAuth } from "@/features/auth";
import { useProfile } from "@/features/profile";
import {
  LoadingSkeleton,
  QueryError,
} from "@/features/admin/components/AdminPrimitives";
import { canAccessSystemDesign } from "../access";

export function SystemDesignAdminOnly({
  children,
  enabled,
}: {
  children: ReactNode;
  enabled: boolean;
}) {
  const { session, isLoading: authLoading } = useAuth();
  const profile = useProfile();

  if (authLoading || (session && profile.isLoading)) {
    return (
      <div className="mx-auto w-full max-w-7xl p-6">
        <LoadingSkeleton rows={8} />
      </div>
    );
  }

  if (!session) return null;

  if (profile.error) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6">
        <QueryError
          error={profile.error}
          retry={() => profile.refetch()}
          resource="system-design access"
        />
      </div>
    );
  }

  // This frontend authorization only protects the UI-first prototype. Backend
  // authorization is also required when diagrams move to persistence APIs.
  if (!canAccessSystemDesign(profile.data?.roles, enabled)) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-xl items-center p-6">
        <div className="w-full rounded-xl border border-danger/30 bg-surface p-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-danger">
            403 · Access denied
          </p>
          <h1 className="mt-3 text-2xl font-bold">
            Administrator access is required
          </h1>
          <p className="mt-2 text-sm text-muted">
            System Design Practice is currently available only to administrators.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
          >
            Back to Recall Stack
          </Link>
        </div>
      </div>
    );
  }

  return children;
}
