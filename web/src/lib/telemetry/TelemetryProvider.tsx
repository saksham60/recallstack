"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/features/auth";
import {
  activeTelemetryPulse,
  beginJourney,
  flushTelemetry,
  setTelemetryIdentity,
  telemetryCollectionPermitted,
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
    setTelemetryIdentity(user?.id, session?.access_token);
  }, [user?.id, session?.access_token]);
  useEffect(() => {
    // Capture bounded first touch before OAuth, without URLs or personal parameters.
    try {
      if (
        telemetryCollectionPermitted() &&
        !sessionStorage.getItem("reasonai:first-touch:1") &&
        !user
      ) {
        const url = new URL(location.href),
          properties: Record<string, string> = {
            landing:
              screenFor(pathname) === "problem"
                ? "dsa"
                : ["home", "feed", "dsa", "system_design"].includes(
                      screenFor(pathname),
                    )
                  ? screenFor(pathname)
                  : "other",
          };
        if (document.referrer) {
          const host = new URL(document.referrer).hostname;
          if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host) && !host.includes(":"))
            properties.referrer_host = host;
        }
        for (const name of [
          "utm_source",
          "utm_medium",
          "utm_campaign",
          "referral_code",
        ]) {
          const value = url.searchParams.get(name);
          if (value && /^[a-zA-Z0-9_.-]{1,80}$/.test(value))
            properties[name] = value;
        }
        sessionStorage.setItem(
          "reasonai:first-touch:1",
          JSON.stringify(properties),
        );
      }
    } catch {
      /* Restricted storage or invalid referrer. */
    }
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
