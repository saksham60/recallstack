"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Network } from "lucide-react";
import { useAuth } from "@/features/auth";
import { useAdminIdentity } from "../use-admin";
import { LoadingSkeleton, QueryError } from "./AdminPrimitives";

const coreNavigation = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/problems", label: "Problem Analytics" },
  { href: "/admin/audit-logs", label: "Audit Logs" },
];

export function AdminGate({
  children,
  systemDesignEnabled = false,
}: {
  children: ReactNode;
  systemDesignEnabled?: boolean;
}) {
  const { session, isLoading: authLoading } = useAuth();
  const identity = useAdminIdentity();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !session) router.replace("/login");
  }, [authLoading, session, router]);

  if (authLoading || (session && identity.isLoading)) {
    return <main className="mx-auto w-full max-w-7xl p-6"><LoadingSkeleton rows={8} /></main>;
  }
  if (!session) return null;
  if (identity.error) {
    return <main className="mx-auto w-full max-w-3xl p-6"><QueryError error={identity.error} retry={() => identity.refetch()} resource="administrator access" /></main>;
  }
  if (!identity.isAdmin) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-xl items-center p-6">
        <div className="w-full rounded-xl border border-danger/30 bg-surface p-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-danger">403 · Access denied</p>
          <h1 className="mt-3 text-2xl font-bold">Administrator access is required</h1>
          <p className="mt-2 text-sm text-muted">Your account is signed in, but it does not have an active admin role.</p>
          <Link href="/" className="mt-6 inline-flex rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">Back to Recall Stack</Link>
        </div>
      </main>
    );
  }
  return (
    <AdminShell
      identity={identity.adminName}
      systemDesignEnabled={systemDesignEnabled}
    >
      {children}
    </AdminShell>
  );
}

function AdminShell({
  children,
  identity,
  systemDesignEnabled,
}: {
  children: ReactNode;
  identity: string;
  systemDesignEnabled: boolean;
}) {
  const pathname = usePathname();
  const isSystemDesignEditor =
    (pathname.startsWith("/admin/system-design/") &&
      pathname !== "/admin/system-design/") ||
    pathname.startsWith("/admin/diagrams");
  const navigation = systemDesignEnabled
    ? [
        ...coreNavigation.slice(0, 3),
        { href: "/admin/system-design", label: "System Design" },
        { href: "/admin/diagrams", label: "Diagram Studio" },
        ...coreNavigation.slice(3),
      ]
    : coreNavigation;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex min-h-14 max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-2 lg:px-6">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="font-bold text-accent">RecallStack Admin</Link>
            <span className="rounded border border-warning/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-warning">Admin area</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-muted sm:inline">Signed in as <strong className="text-foreground">{identity}</strong></span>
            <Link href="/" className="rounded-md border border-border px-3 py-1.5 hover:border-accent">← Back to Recall Stack</Link>
          </div>
        </div>
      </header>
      <div
        className={
          isSystemDesignEditor
            ? "w-full"
            : "mx-auto grid max-w-[1600px] lg:grid-cols-[230px_1fr]"
        }
      >
        {!isSystemDesignEditor && (
          <aside className="border-b border-border bg-surface/50 p-3 lg:min-h-[calc(100vh-57px)] lg:border-b-0 lg:border-r lg:p-4">
            <nav
              aria-label="Admin navigation"
              className="flex gap-2 overflow-x-auto lg:flex-col"
            >
              {navigation.map((item) => {
                const active =
                  item.href === "/admin"
                    ? pathname === item.href
                    : pathname.startsWith(item.href);
                const isSystemDesign = item.href === "/admin/system-design";
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition ${
                      active
                        ? "bg-accent text-accent-foreground"
                        : "text-muted hover:bg-surface-elevated hover:text-foreground"
                    }`}
                  >
                    {isSystemDesign && (
                      <Network aria-hidden="true" className="h-4 w-4" />
                    )}
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </aside>
        )}
        <main
          className={
            isSystemDesignEditor
              ? "min-w-0"
              : "min-w-0 p-4 sm:p-6 lg:p-8"
          }
        >
          {children}
        </main>
      </div>
    </div>
  );
}
