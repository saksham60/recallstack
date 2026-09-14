"use client";

import { ReasonLandingPage } from "@/features/landing/components/ReasonLandingPage";
import { useAuth } from "@/features/auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function HomePage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user) router.replace("/dsa");
  }, [isLoading, router, user]);

  if (isLoading || user) {
    return <main className="min-h-screen bg-background" aria-label="Loading" />;
  }

  return <ReasonLandingPage />;
}
