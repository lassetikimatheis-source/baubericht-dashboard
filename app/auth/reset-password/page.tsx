"use client";

import { useEffect, useState } from "react";
import { getCurrentSupabaseProfile, getSupabaseClientAsync, logActivity } from "../../../lib/supabase";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function checkProfile() {
      try {
        const profile = await getCurrentSupabaseProfile();
        if (profile?.status === "blocked") {
          setBlocked(true);
          setError("Dieser Zugang ist gesperrt. Passwort-Zuruecksetzung ist nicht moeglich.");
          const supabase = await getSupabaseClientAsync();
          await supabase?.auth.signOut();
        }
      } catch {
        setMessage("Bitte neues Passwort setzen, sofern der Reset-Link gueltig ist.");
      }
    }
    checkProfile();
  }, []);

  async function updatePassword() {
    setError("");
    setMessage("");
    if (password.length < 6) {
      setError("Das Passwort muss mindestens 6 Zeichen lang sein.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Die Passwoerter stimmen nicht ueberein.");
      return;
    }
    setSubmitting(true);
    try {
      const supabase = await getSupabaseClientAsync();
      if (!supabase) throw new Error("Supabase-Konfiguration konnte nicht geladen werden.");
      const profile = await getCurrentSupabaseProfile();
      if (profile?.status === "blocked") {
        throw new Error("Dieser Zugang ist gesperrt.");
      }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      await logActivity({ action: "Passwort zurueckgesetzt", area: "Auth", targetType: "user", targetLabel: profile?.email ?? "" });
      setMessage("Passwort wurde geaendert. Du wirst zur Anmeldung weitergeleitet.");
      await supabase.auth.signOut();
      window.setTimeout(() => {
        window.location.href = "/";
      }, 1200);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Passwort konnte nicht geaendert werden.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="authShell">
      <section className="authPanel">
        <div className="authBrand">
          <strong>PARIBUS</strong>
          <span>Asset Management</span>
        </div>
        <div className="authCard">
          <p className="eyebrow">Passwort</p>
          <h1>Neues Passwort setzen</h1>
          <p className="muted">Vergib ein neues Passwort fuer deinen internen Zugang.</p>
          <label className="authField">
            <span>Neues Passwort</span>
            <input type="password" value={password} disabled={blocked} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <label className="authField">
            <span>Passwort bestaetigen</span>
            <input type="password" value={confirmPassword} disabled={blocked} onChange={(event) => setConfirmPassword(event.target.value)} />
          </label>
          {error ? <div className="authMessage authMessageError">{error}</div> : null}
          {message ? <div className="authMessage authMessageSuccess">{message}</div> : null}
          <button className="buttonPrimary" type="button" disabled={blocked || submitting} onClick={updatePassword}>
            {submitting ? "Speichern..." : "Passwort speichern"}
          </button>
        </div>
      </section>
    </main>
  );
}
