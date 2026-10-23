"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { getBrowserClient } from "@/lib/supabase/client";
import { usePathname, useRouter } from "next/navigation";
import {
  getSafeAuthRedirect,
  POST_AUTH_REDIRECT_COOKIE,
} from "./auth-redirect";
import { flushTelemetry, setTelemetryIdentity, track } from "@/lib/telemetry/client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  signInWithGoogle: (nextPath?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLiveGuestRoute =
    /^\/system-design\/live\/[A-Za-z0-9_-]{20,128}\/?$/u.test(pathname);

  if (isLiveGuestRoute) {
    return (
      <AuthContext.Provider
        value={{
          user: null,
          session: null,
          isLoading: false,
          signOut: async () => {},
          signInWithGoogle: async () => {},
        }}
      >
        {children}
      </AuthContext.Provider>
    );
  }

  return <SupabaseAuthProvider>{children}</SupabaseAuthProvider>;
}

function SupabaseAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const [supabase] = useState(() => getBrowserClient());
  const lastLoginUser=useRef<string|null>(null);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();
        if (error) {
          console.error("Failed to initialize authentication", error);
        }
        setTelemetryIdentity(session?.user.id,session?.access_token,session?.user.created_at,session?.user.last_sign_in_at);
        setSession(session);
        setUser(session?.user ?? null);
      } catch (error) {
        console.error("Failed to get session", error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setTelemetryIdentity(session?.user.id,session?.access_token,session?.user.created_at,session?.user.last_sign_in_at);
      if (_event === "SIGNED_IN" && session && lastLoginUser.current!==session.user.id) {
        track("auth.login_succeeded");
      }
      if (_event === "SIGNED_IN" || _event === "INITIAL_SESSION") lastLoginUser.current=session?.user.id??null;
      if (_event === "SIGNED_OUT") lastLoginUser.current=null;
      setSession(session);
      setUser(session?.user ?? null);
      if (_event === "SIGNED_OUT") {
        router.push("/login");
      }
    });

    return () => { subscription.unsubscribe(); setTelemetryIdentity(undefined); };
  }, [supabase, router]);

  const signOut = async () => {
    track("auth.logout_requested");
    track("session.ended", { reason: "logout" });
    void flushTelemetry(true);
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const signInWithGoogle = async (nextPath = "/feed") => {
    track("auth.signup_started");
    const safeNextPath = getSafeAuthRedirect(nextPath);
    const secureAttribute = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${POST_AUTH_REDIRECT_COOKIE}=${encodeURIComponent(safeNextPath)}; Path=/; Max-Age=600; SameSite=Lax${secureAttribute}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, session, isLoading, signOut, signInWithGoogle }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
