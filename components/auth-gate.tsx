"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import type { UserProfile, UserRole } from "../lib/supabase";

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  canEdit: boolean;
  canAdmin: boolean;
  isOwner: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  hasRole: (roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const openAccessProfile: UserProfile = {
  id: "local-open-access",
  email: "open-access@local",
  fullName: "Offener Zugriff",
  role: "owner",
  status: "active",
  createdAt: "",
  updatedAt: "",
  lastLoginAt: ""
};

export function AuthGate({ children }: { children: ReactNode }) {
  const value = useMemo<AuthContextValue>(() => ({
    user: null,
    profile: openAccessProfile,
    loading: false,
    canEdit: true,
    canAdmin: true,
    isOwner: true,
    signOut: async () => undefined,
    refreshProfile: async () => undefined,
    hasRole: (roles) => roles.includes("owner")
  }), []);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth muss innerhalb von AuthGate verwendet werden.");
  return context;
}
