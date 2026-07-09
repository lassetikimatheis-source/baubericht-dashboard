"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import {
  getCurrentSupabaseProfile,
  getSupabaseClientAsync,
  getSupabaseRuntimeConfigStatus,
  logActivity,
  touchCurrentProfileLogin,
  type UserProfile,
  type UserRole,
  type UserStatus
} from "../lib/supabase";

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

const roleRank: Record<UserRole, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
  owner: 4
};

export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "register" | "forgot">("login");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refreshProfile() {
    console.log("[AuthGate] refreshProfile gestartet");
    const nextProfile = await getCurrentSupabaseProfile();
    console.log("[AuthGate] refreshProfile Ergebnis", {
      profileId: nextProfile?.id ?? null,
      profileStatus: nextProfile?.status ?? null,
      profileRole: nextProfile?.role ?? null,
      profile: nextProfile
    });
    setProfile(nextProfile);
  }

  useEffect(() => {
    let mounted = true;
    async function initAuth() {
      const supabase = await getSupabaseClientAsync();
      if (!supabase) {
        const runtimeStatus = await getSupabaseRuntimeConfigStatus();
        if (mounted) {
          setError(formatSupabaseConfigError(runtimeStatus));
          setLoading(false);
        }
        return;
      }
      const { data, error: sessionError } = await supabase.auth.getSession();
      console.log("[AuthGate] getSession Antwort", {
        userId: data.session?.user?.id ?? null,
        userEmail: data.session?.user?.email ?? null,
        hasSession: Boolean(data.session),
        error: sessionError ?? null
      });
      if (mounted) {
        setUser(data.session?.user ?? null);
      }
      if (data.session?.user) {
        try {
          await refreshProfile();
        } catch (profileError) {
          console.error("[AuthGate] Profil laden im initAuth fehlgeschlagen", {
            userId: data.session.user.id,
            userEmail: data.session.user.email,
            error: profileError
          });
          if (mounted) setError(profileError instanceof Error ? profileError.message : "Profil konnte nicht geladen werden.");
        }
        try {
          await touchCurrentProfileLogin();
        } catch (touchError) {
          console.warn("[AuthGate] last_login_at konnte nicht aktualisiert werden; Profil bleibt trotzdem geladen.", {
            userId: data.session.user.id,
            userEmail: data.session.user.email,
            error: touchError
          });
        }
      }
      if (mounted) setLoading(false);
      const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
        console.log("[AuthGate] AuthStateChange", {
          event,
          userId: session?.user?.id ?? null,
          userEmail: session?.user?.email ?? null
        });
        setUser(session?.user ?? null);
        if (event === "SIGNED_IN" && session?.user) {
          try {
            await refreshProfile();
          } catch (profileError) {
            console.error("[AuthGate] Profil laden nach SIGNED_IN fehlgeschlagen", {
              userId: session.user.id,
              userEmail: session.user.email,
              error: profileError
            });
            if (mounted) setError(profileError instanceof Error ? profileError.message : "Profil konnte nicht geladen werden.");
          }
          try {
            await touchCurrentProfileLogin();
          } catch (touchError) {
            console.warn("[AuthGate] last_login_at nach SIGNED_IN konnte nicht aktualisiert werden.", {
              userId: session.user.id,
              userEmail: session.user.email,
              error: touchError
            });
          }
          try {
            await logActivity({ action: "Login", area: "Auth", targetType: "user", targetId: session.user.id, targetLabel: session.user.email ?? "" });
          } catch (activityError) {
            console.warn("[AuthGate] Login-Aktivitaet konnte nicht gespeichert werden", activityError);
          }
        }
        if (event === "SIGNED_OUT") {
          setProfile(null);
        }
      });
      return () => listener.subscription.unsubscribe();
    }
    const cleanupPromise = initAuth();
    return () => {
      mounted = false;
      cleanupPromise.then((cleanup) => cleanup?.()).catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    console.log("[AuthGate] Render-Status", {
      loading,
      userId: user?.id ?? null,
      userEmail: user?.email ?? null,
      profileId: profile?.id ?? null,
      profileStatus: profile?.status ?? null,
      profileRole: profile?.role ?? null,
      willShowPending: Boolean(!loading && user && (!profile || profile.status === "pending")),
      willShowBlocked: Boolean(!loading && user && profile?.status === "blocked")
    });
  }, [loading, user, profile]);

  async function signOut() {
    const supabase = await getSupabaseClientAsync();
    await logActivity({ action: "Logout", area: "Auth", targetType: "user", targetId: user?.id ?? null, targetLabel: user?.email ?? "" });
    await supabase?.auth.signOut();
    setUser(null);
    setProfile(null);
  }

  const value = useMemo<AuthContextValue>(() => {
    const activeRole = profile?.status === "active" ? profile.role : "viewer";
    return {
      user,
      profile,
      loading,
      canEdit: profile?.status === "active" && roleRank[activeRole] >= roleRank.editor,
      canAdmin: profile?.status === "active" && (profile.role === "owner" || profile.role === "admin"),
      isOwner: profile?.status === "active" && profile.role === "owner",
      signOut,
      refreshProfile,
      hasRole: (roles) => Boolean(profile?.status === "active" && roles.includes(profile.role))
    };
  }, [user, profile, loading]);

  if (loading) {
    return <AuthScreenShell><div className="authCard"><p className="eyebrow">PARIBUS</p><h1>Zugang wird geprueft</h1><p className="muted">Bitte einen Moment warten.</p></div></AuthScreenShell>;
  }

  if (!user) {
    return (
      <AuthScreenShell>
        <AuthForm mode={authMode} onModeChange={setAuthMode} message={message} error={error} setMessage={setMessage} setError={setError} />
      </AuthScreenShell>
    );
  }

  if (profile?.status === "blocked") {
    console.warn("[AuthGate] Blocked-Screen wird angezeigt", {
      userId: user.id,
      profileId: profile.id,
      profileStatus: profile.status,
      profileRole: profile.role
    });
    return (
      <AuthScreenShell>
        <div className="authCard">
          <p className="eyebrow">Zugang gesperrt</p>
          <h1>Dieser Zugang wurde gesperrt.</h1>
          <p className="muted">Bitte wende dich an den Administrator, falls du Zugriff benoetigst.</p>
          <button type="button" onClick={signOut}>Abmelden</button>
        </div>
      </AuthScreenShell>
    );
  }

  if (!profile || profile.status === "pending") {
    console.warn("[AuthGate] Pending-Screen wird angezeigt", {
      userId: user.id,
      userEmail: user.email,
      profileId: profile?.id ?? null,
      profileStatus: profile?.status ?? null,
      profileRole: profile?.role ?? null,
      reason: !profile ? "Profil ist null" : "Profilstatus ist pending"
    });
    return (
      <AuthScreenShell>
        <div className="authCard">
          <p className="eyebrow">Freischaltung ausstehend</p>
          <h1>Dein Zugang wurde angefragt.</h1>
          <p className="muted">Dein Zugang wartet auf Freischaltung durch den Administrator.</p>
          <button type="button" onClick={signOut}>Abmelden</button>
        </div>
      </AuthScreenShell>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth muss innerhalb von AuthGate verwendet werden.");
  return context;
}

function formatSupabaseConfigError(status: Awaited<ReturnType<typeof getSupabaseRuntimeConfigStatus>>): string {
  return [
    "Supabase-Konfiguration konnte nicht geladen werden.",
    `URL: ${status.hasUrl ? "vorhanden" : "fehlt"}.`,
    `Anon Key: ${status.hasAnonKey ? "vorhanden" : "fehlt"}.`,
    `HTTP: ${status.httpStatus ?? "k.A."}.`,
    `Runtime: ${status.runtime}.`
  ].join(" ");
}

function AuthForm({
  mode,
  onModeChange,
  message,
  error,
  setMessage,
  setError
}: {
  mode: "login" | "register" | "forgot";
  onModeChange: (mode: "login" | "register" | "forgot") => void;
  message: string;
  error: string;
  setMessage: (message: string) => void;
  setError: (message: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    setMessage("");
    setError("");
    try {
      const supabase = await getSupabaseClientAsync();
      if (!supabase) throw new Error("Supabase-Konfiguration konnte nicht geladen werden.");
      if (mode === "forgot") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/auth/reset-password`
        });
        if (resetError) throw resetError;
        setMessage("Wenn der Nutzer aktiv oder angefragt ist, wurde eine Passwort-Mail versendet.");
        return;
      }
      if (mode === "register") {
        const { error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: fullName.trim() }
          }
        });
        if (signUpError) throw signUpError;
        setMessage("Registrierung gesendet. Der Zugang wartet anschliessend auf Freischaltung.");
        return;
      }
      const { error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (loginError) throw loginError;
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Anmeldung fehlgeschlagen.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="authCard">
      <p className="eyebrow">PARIBUS Baukosten</p>
      <h1>{mode === "login" ? "Anmelden" : mode === "register" ? "Zugang anfragen" : "Passwort zuruecksetzen"}</h1>
      <p className="muted">
        {mode === "login"
          ? "Bitte mit E-Mail und Passwort anmelden."
          : mode === "register"
            ? "Neue Nutzer werden erst nach Freischaltung aktiviert."
            : "Wir senden dir einen sicheren Link zum Zuruecksetzen."}
      </p>
      {mode === "register" ? (
        <label className="authField">
          <span>Name</span>
          <input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Vor- und Nachname" />
        </label>
      ) : null}
      <label className="authField">
        <span>E-Mail</span>
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@firma.de" />
      </label>
      {mode !== "forgot" ? (
        <label className="authField">
          <span>Passwort</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
      ) : null}
      {error ? <div className="authMessage authMessageError">{error}</div> : null}
      {message ? <div className="authMessage authMessageSuccess">{message}</div> : null}
      <button className="buttonPrimary" type="button" disabled={submitting || !email.trim() || (mode !== "forgot" && password.length < 6)} onClick={submit}>
        {submitting ? "Bitte warten..." : mode === "login" ? "Anmelden" : mode === "register" ? "Zugang anfragen" : "Reset-Mail senden"}
      </button>
      <div className="authLinks">
        {mode !== "login" ? <button type="button" onClick={() => onModeChange("login")}>Zur Anmeldung</button> : null}
        {mode !== "register" ? <button type="button" onClick={() => onModeChange("register")}>Zugang anfragen</button> : null}
        {mode !== "forgot" ? <button type="button" onClick={() => onModeChange("forgot")}>Passwort vergessen?</button> : null}
      </div>
    </div>
  );
}

function AuthScreenShell({ children }: { children: ReactNode }) {
  return (
    <main className="authShell">
      <section className="authPanel">
        <div className="authBrand">
          <strong>PARIBUS</strong>
          <span>Asset Management</span>
        </div>
        {children}
      </section>
    </main>
  );
}
