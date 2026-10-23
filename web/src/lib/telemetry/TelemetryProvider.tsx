"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/features/auth";
import { captureFirstTouch } from "./acquisition";
import {
  activeTelemetryPulse,
  beginJourney,
  flushTelemetry,
  setTelemetryIdentity,
  track,
} from "./client";

const screenFor = (path: string) =>
  path === "/"
    ? "home"
    : path.startsWith("/feed")
      ? "feed"
      : path.startsWith("/dsa")
        ? /\/problems?\//.test(path)
          ? "problem"
          : "dsa"
        : path.startsWith("/system-design")
          ? "system_design"
          : path.startsWith("/library")
            ? "library"
            : path.startsWith("/revise")
              ? "revise"
              : path.startsWith("/login")
                ? "login"
                : "other";

export function TelemetryProvider({ children }: { children: ReactNode }) {
  const { user, session } = useAuth();
  const pathname = usePathname();
  const previous = useRef("");
  useEffect(() => {
    // Fallback for route changes; early landing capture runs before hydration.
    if (!user?.id) captureFirstTouch();
    setTelemetryIdentity(user?.id, session?.access_token, user?.created_at, user?.last_sign_in_at);
  }, [pathname, user?.id, user?.created_at, user?.last_sign_in_at, session?.access_token]);
  useEffect(() => {
    if (!user || pathname.startsWith("/admin")) return;
    const screen = screenFor(pathname);
    const feature =
      screen === "problem" || screen === "dsa"
        ? "dsa"
        : screen === "feed"
          ? "feed"
          : screen === "system_design"
            ? "system_design"
            : "other";
    if (previous.current)
      track("navigation.feature_exited", {
        feature: previous.current as typeof feature,
      });
    beginJourney();
    track("navigation.screen_opened", { screen, feature });
    track("navigation.feature_entered", { screen, feature });
    if (screen === "feed") track("feed.opened");
    if (screen === "dsa") track("dsa.explorer_opened");
    previous.current = feature;
  }, [pathname, user]);
  useEffect(() => {
    const visibility = () => {
      track(
        document.visibilityState === "hidden"
          ? "session.backgrounded"
          : "session.foregrounded",
      );
      if (document.visibilityState === "hidden") void flushTelemetry(true);
    };
    const closing = () => {
      track("session.ended", { reason: "closed" });
      void flushTelemetry(true);
    };
    const error = () =>
      track("diagnostics.client_error", { category: "runtime", count: 1 });
    const online = () => {
      track("diagnostics.network_changed", { category: "online" });
      void flushTelemetry();
    };
    const offline = () =>
      track("diagnostics.network_changed", { category: "offline" });
    const pulse = setInterval(() => activeTelemetryPulse(30), 30000);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", closing);
    window.addEventListener("error", error);
    window.addEventListener("unhandledrejection", error);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      clearInterval(pulse);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", closing);
      window.removeEventListener("error", error);
      window.removeEventListener("unhandledrejection", error);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);
  return children;
}
