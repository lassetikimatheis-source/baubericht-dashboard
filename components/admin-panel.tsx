"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "./auth-gate";
import {
  deactivateUserProfile,
  loadActivityLogs,
  loadUserProfiles,
  logActivity,
  updateUserProfileAdmin,
  type ActivityLogEntry,
  type UserProfile,
  type UserRole,
  type UserStatus
} from "../lib/supabase";

type AdminTab = "overview" | "users" | "logs";

const roleOptions: UserRole[] = ["viewer", "editor", "admin", "owner"];
const statusOptions: UserStatus[] = ["pending", "active", "blocked"];

export function AdminPanel() {
  const { isOwner, profile } = useAuth();
  const [tab, setTab] = useState<AdminTab>("overview");
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ user: "", action: "", date: "", target: "" });

  async function reload() {
    setLoading(true);
    setError("");
    try {
      const [nextProfiles, nextLogs] = await Promise.all([
        loadUserProfiles(),
        loadActivityLogs({ limit: 300 })
      ]);
      setProfiles(nextProfiles);
      setLogs(nextLogs);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Admin-Daten konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  const filteredLogs = useMemo(() => logs.filter((entry) => {
    const userMatch = !filters.user || entry.userEmail.toLowerCase().includes(filters.user.toLowerCase());
    const actionMatch = !filters.action || entry.action.toLowerCase().includes(filters.action.toLowerCase());
    const targetMatch = !filters.target || entry.targetLabel.toLowerCase().includes(filters.target.toLowerCase()) || String(entry.targetId ?? "").toLowerCase().includes(filters.target.toLowerCase());
    const dateMatch = !filters.date || entry.createdAt.startsWith(filters.date);
    return userMatch && actionMatch && targetMatch && dateMatch;
  }), [logs, filters]);

  const stats = {
    total: profiles.length,
    active: profiles.filter((entry) => entry.status === "active").length,
    pending: profiles.filter((entry) => entry.status === "pending").length,
    blocked: profiles.filter((entry) => entry.status === "blocked").length
  };

  async function updateProfile(target: UserProfile, update: Partial<Pick<UserProfile, "role" | "status">>) {
    setError("");
    setMessage("");
    if (!isOwner && (target.role === "owner" || update.role === "owner")) {
      setError("Admin-Nutzer duerfen owner-Rechte nicht aendern.");
      return;
    }
    if (target.id === profile?.id && update.status === "blocked") {
      setError("Du kannst deinen eigenen Zugang nicht sperren.");
      return;
    }
    try {
      const updated = await updateUserProfileAdmin(target.id, update);
      await logActivity({
        action: update.role ? "Rolle geaendert" : update.status === "active" ? "Nutzer freigeschaltet" : update.status === "blocked" ? "Nutzer gesperrt" : "Nutzer aktualisiert",
        area: "Admin",
        targetType: "user",
        targetId: target.id,
        targetLabel: target.email,
        details: update
      });
      setProfiles((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
      setMessage("Nutzer wurde aktualisiert.");
      await reload();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Nutzer konnte nicht aktualisiert werden.");
    }
  }

  async function blockProfile(target: UserProfile) {
    try {
      const updated = await deactivateUserProfile(target.id);
      await logActivity({
        action: "Nutzer gesperrt",
        area: "Admin",
        targetType: "user",
        targetId: target.id,
        targetLabel: target.email
      });
      setProfiles((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
    } catch (blockError) {
      setError(blockError instanceof Error ? blockError.message : "Nutzer konnte nicht gesperrt werden.");
    }
  }

  return (
    <section className="adminPanel">
      <div className="panelHeader">
        <div>
          <h2>Admin</h2>
          <p>Nutzerfreigaben, Rollen und Aktivitaetsprotokoll fuer das interne Tool.</p>
        </div>
        <button type="button" onClick={reload} disabled={loading}>Aktualisieren</button>
      </div>

      <div className="adminTabs">
        <button type="button" className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>Uebersicht</button>
        <button type="button" className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>Nutzerverwaltung</button>
        <button type="button" className={tab === "logs" ? "active" : ""} onClick={() => setTab("logs")}>Aktivitaetsprotokoll</button>
      </div>

      {message ? <div className="authMessage authMessageSuccess">{message}</div> : null}
      {error ? <div className="authMessage authMessageError">{error}</div> : null}

      {tab === "overview" ? (
        <>
          <div className="adminStats">
            <AdminStat label="Nutzer" value={stats.total} />
            <AdminStat label="Aktiv" value={stats.active} />
            <AdminStat label="Wartend" value={stats.pending} />
            <AdminStat label="Gesperrt" value={stats.blocked} />
          </div>
          <div className="panel">
            <h3>Letzte Aktivitaeten</h3>
            <ActivityTable logs={logs.slice(0, 8)} />
          </div>
        </>
      ) : null}

      {tab === "users" ? (
        <div className="panel tablePanel">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>E-Mail</th>
                <th>Rolle</th>
                <th>Status</th>
                <th>Letzter Login</th>
                <th>Erstellt am</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((entry) => {
                const canChangeOwner = isOwner || entry.role !== "owner";
                return (
                  <tr key={entry.id}>
                    <td>{entry.fullName || "k.A."}</td>
                    <td>{entry.email}</td>
                    <td><Badge value={entry.role} kind="role" /></td>
                    <td><Badge value={entry.status} kind="status" /></td>
                    <td>{formatDateTime(entry.lastLoginAt)}</td>
                    <td>{formatDateTime(entry.createdAt)}</td>
                    <td className="adminActions">
                      <button type="button" disabled={!canChangeOwner} onClick={() => updateProfile(entry, { status: "active" })}>Freischalten</button>
                      <button type="button" disabled={!canChangeOwner || entry.id === profile?.id} onClick={() => blockProfile(entry)}>Sperren</button>
                      <select
                        value={entry.role}
                        disabled={!canChangeOwner}
                        onChange={(event) => updateProfile(entry, { role: event.target.value as UserRole })}
                      >
                        {roleOptions.filter((role) => isOwner || role !== "owner").map((role) => (
                          <option key={role} value={role}>{role}</option>
                        ))}
                      </select>
                      <select
                        value={entry.status}
                        disabled={!canChangeOwner || entry.id === profile?.id}
                        onChange={(event) => updateProfile(entry, { status: event.target.value as UserStatus })}
                      >
                        {statusOptions.map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "logs" ? (
        <div className="panel tablePanel">
          <div className="adminFilters">
            <input placeholder="Nutzer" value={filters.user} onChange={(event) => setFilters((current) => ({ ...current, user: event.target.value }))} />
            <input placeholder="Aktion" value={filters.action} onChange={(event) => setFilters((current) => ({ ...current, action: event.target.value }))} />
            <input type="date" value={filters.date} onChange={(event) => setFilters((current) => ({ ...current, date: event.target.value }))} />
            <input placeholder="Objekt/Dokument" value={filters.target} onChange={(event) => setFilters((current) => ({ ...current, target: event.target.value }))} />
          </div>
          <ActivityTable logs={filteredLogs} />
        </div>
      ) : null}
    </section>
  );
}

function AdminStat({ label, value }: { label: string; value: number }) {
  return <article className="metric"><span>{label}</span><strong>{value}</strong><small>gesamt</small></article>;
}

function Badge({ value, kind }: { value: string; kind: "role" | "status" }) {
  return <span className={`adminBadge adminBadge-${kind}-${value}`}>{value}</span>;
}

function ActivityTable({ logs }: { logs: ActivityLogEntry[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Datum/Uhrzeit</th>
          <th>Nutzer</th>
          <th>Aktion</th>
          <th>Bereich</th>
          <th>Ziel</th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody>
        {logs.length === 0 ? <tr><td colSpan={6}>Keine Aktivitaeten vorhanden.</td></tr> : logs.map((entry) => (
          <tr key={entry.id}>
            <td>{formatDateTime(entry.createdAt)}</td>
            <td>{entry.userEmail || "System"}</td>
            <td>{entry.action}</td>
            <td>{entry.area}</td>
            <td>{entry.targetLabel || entry.targetId || "k.A."}</td>
            <td>{Object.keys(entry.details).length ? JSON.stringify(entry.details) : "k.A."}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function formatDateTime(value: string): string {
  if (!value) return "k.A.";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(date);
}
