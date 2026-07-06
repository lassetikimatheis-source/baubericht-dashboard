import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { emptyField } from "./analysis-state";
import { getDocuments, type StoredEntranceRecord, type StoredObjectRecord, type StoredProjectRecord } from "./storage";
import type { CostAllocation, FieldSource, MeasureCluster, MeasureDetail, ObjectAnalysis } from "../types/analysis";

let browserSupabaseClient: SupabaseClient | null = null;
let runtimeSupabaseConfig: { supabaseUrl: string; supabaseAnonKey: string } | null = null;
let runtimeSupabaseStatus: SupabaseRuntimeConfigStatus | null = null;
const attemptedAutomaticDocumentRepairIds = new Set<string>();

const SUPABASE_URL_ENV_NAME = "NEXT_PUBLIC_SUPABASE_URL";
const SUPABASE_ANON_KEY_ENV_NAME = "NEXT_PUBLIC_SUPABASE_ANON_KEY";

export interface SupabaseRuntimeConfigStatus {
  loaded: boolean;
  hasUrl: boolean;
  hasAnonKey: boolean;
  hasNextPublicAnonKey: boolean;
  hasServerAnonKey: boolean;
  runtime: string;
  httpStatus: number | null;
  responseText: string;
  error: string | null;
}

export type UserRole = "owner" | "admin" | "editor" | "viewer";
export type UserStatus = "pending" | "active" | "blocked";

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string;
}

export interface ActivityLogEntry {
  id: string;
  userId: string | null;
  userEmail: string;
  action: string;
  area: string;
  targetType: string;
  targetId: string | null;
  targetLabel: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface ActivityLogInput {
  action: string;
  area: string;
  targetType?: string;
  targetId?: string | null;
  targetLabel?: string;
  details?: Record<string, unknown>;
}

export type QuarterlyReportFileType =
  | "Mieterliste"
  | "Verkehrswerte/VKW"
  | "CapEx/TDREV"
  | "Budget"
  | "Leerstand"
  | "Sonstige";

export interface FundRecord {
  id: string;
  fundName: string;
  fundNumber: string;
  address: string;
  company: string;
  commercialRegisterNumber: string;
  currentValue: string;
  objectCount: number;
  contactPerson: string;
  status: string;
  remark: string;
  updatedAt: string;
}

export interface QuarterlyReportRecord {
  id: string;
  fundId: string;
  quarter: string;
  year: number;
  reportDate: string;
  status: string;
  version: string;
  editor: string;
  lastChangedAt: string;
}

export interface QuarterlyReportFileRecord {
  id: string;
  reportId: string;
  fundId: string;
  fileType: QuarterlyReportFileType;
  fileName: string;
  uploadDate: string;
  assignedQuarter: string;
  assignedYear: number;
  sheetName: string;
  relevantCells: string;
  relevantColumns: string;
  importStatus: string;
  errorLog: string;
}

export interface QuarterlyReportPowerBiLinkRecord {
  id: string;
  reportId: string;
  fundId: string;
  workspace: string;
  reportDashboard: string;
  dataset: string;
  metric: string;
  sourceCell: string;
  reportDate: string;
  value: string;
  lastSyncAt: string;
  isOverridden: boolean;
  manualValue: string;
  importStatus: string;
  errorLog: string;
}

export interface QuarterlyReportValueRecord {
  id: string;
  reportId: string;
  fundId: string;
  valueKey: string;
  label: string;
  sourceType: string;
  sourceReference: string;
  value: string;
  reviewedValue: string;
  isReviewed: boolean;
  status: string;
  remark: string;
}

export interface QuarterlyReportBundle {
  funds: FundRecord[];
  reports: QuarterlyReportRecord[];
  files: QuarterlyReportFileRecord[];
  powerBiLinks: QuarterlyReportPowerBiLinkRecord[];
  values: QuarterlyReportValueRecord[];
}

export async function getSupabaseClientAsync(): Promise<SupabaseClient | null> {
  const runtimeConfig = await getRuntimeSupabaseConfig();
  if (!runtimeConfig) return null;
  if (!browserSupabaseClient) {
    browserSupabaseClient = createClient(runtimeConfig.supabaseUrl, runtimeConfig.supabaseAnonKey);
  }
  return browserSupabaseClient;
}

export async function getSupabaseRuntimeConfigStatus(): Promise<SupabaseRuntimeConfigStatus> {
  await getRuntimeSupabaseConfig();
  return runtimeSupabaseStatus ?? {
    loaded: false,
    hasUrl: false,
    hasAnonKey: false,
    hasNextPublicAnonKey: false,
    hasServerAnonKey: false,
    runtime: "server",
    httpStatus: null,
    responseText: "",
    error: null
  };
}

export async function getRuntimeSupabaseConfig(options: { forceRefresh?: boolean } = {}): Promise<{ supabaseUrl: string; supabaseAnonKey: string } | null> {
  if (runtimeSupabaseConfig && !options.forceRefresh) {
    runtimeSupabaseStatus = {
      ...(runtimeSupabaseStatus ?? {
        hasNextPublicAnonKey: false,
        hasServerAnonKey: false,
        runtime: "server",
        httpStatus: null,
        responseText: "",
        error: null
      }),
      loaded: true,
      hasUrl: true,
      hasAnonKey: true,
      httpStatus: runtimeSupabaseStatus?.httpStatus ?? 200,
      responseText: runtimeSupabaseStatus?.responseText ?? "",
      error: null
    };
    return runtimeSupabaseConfig;
  }
  if (typeof window === "undefined") return null;
  try {
    const response = await fetch("/api/supabase-config", { cache: "no-store" });
    const responseText = await response.text();
    if (!response.ok) {
      runtimeSupabaseStatus = {
        loaded: false,
        hasUrl: false,
        hasAnonKey: false,
        hasNextPublicAnonKey: false,
        hasServerAnonKey: false,
        runtime: "server",
        httpStatus: response.status,
        responseText,
        error: `HTTP ${response.status}`
      };
      console.error("[Supabase] Runtime-Konfiguration konnte nicht geladen werden.", { status: response.status, responseText });
      return null;
    }
    const data = JSON.parse(responseText) as {
      supabaseUrl?: string;
      supabaseAnonKey?: string;
      hasUrl?: boolean;
      hasAnonKey?: boolean;
      hasNextPublicAnonKey?: boolean;
      hasServerAnonKey?: boolean;
      resolvedUrlFrom?: string | null;
      resolvedAnonKeyFrom?: string | null;
      urlVariableName?: string;
      anonKeyVariableName?: string;
      runtime?: string;
    };
    runtimeSupabaseStatus = {
      loaded: Boolean(data.supabaseUrl && data.supabaseAnonKey),
      hasUrl: Boolean(data.hasUrl),
      hasAnonKey: Boolean(data.hasAnonKey),
      hasNextPublicAnonKey: Boolean(data.hasNextPublicAnonKey),
      hasServerAnonKey: Boolean(data.hasServerAnonKey),
      runtime: data.runtime ?? "server",
      httpStatus: response.status,
      responseText,
      error: null
    };
    console.log("[Supabase] Runtime-Konfiguration geladen", {
      [data.urlVariableName ?? SUPABASE_URL_ENV_NAME]: data.hasUrl ? "vorhanden" : "fehlt",
      [data.anonKeyVariableName ?? SUPABASE_ANON_KEY_ENV_NAME]: data.hasAnonKey ? "vorhanden" : "fehlt",
      NEXT_PUBLIC_SUPABASE_ANON_KEY_server: data.hasNextPublicAnonKey ? "vorhanden" : "fehlt",
      SUPABASE_ANON_KEY_serverFallback: data.hasServerAnonKey ? "vorhanden" : "fehlt",
      resolvedUrlFrom: data.resolvedUrlFrom ?? null,
      resolvedAnonKeyFrom: data.resolvedAnonKeyFrom ?? null,
      runtime: data.runtime ?? "server"
    });
    if (!data.supabaseUrl || !data.supabaseAnonKey || !isHttpUrl(data.supabaseUrl)) {
      runtimeSupabaseStatus = {
        ...runtimeSupabaseStatus,
        loaded: false,
        error: "Runtime-Konfiguration enthielt keine gueltige Supabase URL oder keinen Anon Key."
      };
      return null;
    }
    runtimeSupabaseConfig = {
      supabaseUrl: data.supabaseUrl,
      supabaseAnonKey: data.supabaseAnonKey
    };
    return runtimeSupabaseConfig;
  } catch (error) {
    console.error("[Supabase] Runtime-Konfiguration fehlgeschlagen.", error);
    runtimeSupabaseStatus = {
      loaded: false,
      hasUrl: false,
      hasAnonKey: false,
      hasNextPublicAnonKey: false,
      hasServerAnonKey: false,
      runtime: "server",
      httpStatus: null,
      responseText: "",
      error: error instanceof Error ? error.message : "Runtime-Konfiguration fehlgeschlagen."
    };
    return null;
  }
}

export async function runSupabaseConnectionTest(): Promise<void> {
  console.log("[Supabase] Test wird ausgeführt");

  await getRuntimeSupabaseConfig({ forceRefresh: true });
  const runtimeStatus = await getSupabaseRuntimeConfigStatus();

  console.log("[Supabase] Verbindungstest gestartet", {
    runtimeConfigLoaded: runtimeStatus.loaded ? "Ja" : "Nein",
    runtimeHasUrl: runtimeStatus.hasUrl ? "Ja" : "Nein",
    runtimeHasAnonKey: runtimeStatus.hasAnonKey ? "Ja" : "Nein",
    runtimeHttpStatus: runtimeStatus.httpStatus,
    runtime: runtimeStatus.runtime
  });

  const supabase = await getSupabaseClientAsync();
  if (!supabase) {
    console.error("[Supabase] Verbindungstest abgebrochen: Runtime-Konfiguration konnte nicht geladen werden.", runtimeStatus);
    return;
  }

  const [tradesResult, documentTypesResult] = await Promise.all([
    supabase.from("trades").select("*", { count: "exact" }),
    supabase.from("document_types").select("*", { count: "exact" })
  ]);

  if (tradesResult.error) {
    console.error("[Supabase] Fehler beim Lesen von trades", {
      message: tradesResult.error.message,
      details: tradesResult.error.details,
      hint: tradesResult.error.hint,
      code: tradesResult.error.code,
      error: tradesResult.error
    });
  }

  if (documentTypesResult.error) {
    console.error("[Supabase] Fehler beim Lesen von document_types", {
      message: documentTypesResult.error.message,
      details: documentTypesResult.error.details,
      hint: documentTypesResult.error.hint,
      code: documentTypesResult.error.code,
      error: documentTypesResult.error
    });
  }

  if (!tradesResult.error && !documentTypesResult.error) {
    console.log("[Supabase] Verbindung erfolgreich", {
      trades: tradesResult.count ?? tradesResult.data?.length ?? 0,
      documentTypes: documentTypesResult.count ?? documentTypesResult.data?.length ?? 0
    });
  }

  console.log("[Supabase] trades", tradesResult.data ?? []);
  console.log("[Supabase] document_types", documentTypesResult.data ?? []);
}

export async function getCurrentSupabaseProfile(): Promise<UserProfile | null> {
  const supabase = await getSupabaseClientAsync();
  if (!supabase) {
    console.error("[Supabase Auth] Profil laden abgebrochen: Supabase Client fehlt.");
    return null;
  }
  const { data: authData, error: authError } = await supabase.auth.getUser();
  console.log("[Supabase Auth] getUser Antwort vor Profil-Load", {
    userId: authData.user?.id ?? null,
    userEmail: authData.user?.email ?? null,
    authError: authError
      ? {
        message: authError.message,
        name: authError.name,
        status: authError.status
      }
      : null,
    raw: authData
  });
  if (authError || !authData.user) {
    console.error("[Supabase Auth] Profil laden ohne gueltigen User abgebrochen", { authError, authData });
    return null;
  }
  const user = authData.user;
  console.log("[Supabase Auth] Lade public.profiles per maybeSingle", {
    table: "profiles",
    filter: { id: user.id },
    userId: user.id,
    userEmail: user.email ?? null
  });
  const profileResult = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  const { data, error } = profileResult;

  console.log("[Supabase Auth] public.profiles maybeSingle Antwort", {
    userId: user.id,
    userEmail: user.email ?? null,
    profileId: stringValue((data as GenericSupabaseRow | null)?.id),
    profileStatus: stringValue((data as GenericSupabaseRow | null)?.status),
    profileRole: stringValue((data as GenericSupabaseRow | null)?.role),
    data,
    error: error
      ? {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      }
      : null,
    fullResponse: profileResult
  });

  if (error) {
    console.error("[Supabase Auth] Profil konnte nicht geladen werden. Moeglicher RLS-/Policy-Fehler.", {
      userId: user.id,
      error,
      hint: "Der angemeldete Nutzer muss public.profiles mit id = auth.uid() lesen duerfen."
    });
    throw new Error(`Profil konnte nicht geladen werden: ${formatSupabaseError(error)}`);
  }

  if (data) {
    const profile = profileFromSupabase(data as GenericSupabaseRow, user.email ?? "");
    console.log("[Supabase Auth] Profil erfolgreich geladen", {
      userId: user.id,
      profileId: profile.id,
      profileStatus: profile.status,
      profileRole: profile.role,
      profile
    });
    return profile;
  }

  console.warn("[Supabase Auth] maybeSingle lieferte null. Es wird ein Pending-Profil fuer die aktuelle auth.users.id erstellt.", {
    userId: user.id,
    userEmail: user.email ?? null,
    expectedProfileId: user.id,
    note: "Wenn bereits ein active/owner-Profil existiert, stimmt dessen id vermutlich nicht mit auth.users.id ueberein oder RLS blendet es aus."
  });

  const email = user.email ?? "";
  const fullName = String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? email.split("@")[0] ?? "");
  const insertRow: GenericSupabaseRow = {
    id: user.id,
    email,
    full_name: fullName,
    role: "viewer",
    status: "pending",
    last_login_at: new Date().toISOString()
  };
  const { data: created, error: createError } = await supabase
    .from("profiles")
    .insert(insertRow)
    .select("*")
    .single();
  if (createError) {
    console.error("[Supabase Auth] Pending-Profil konnte nicht erstellt werden", { insertRow, error: createError });
    throw new Error(`Profil konnte nicht erstellt werden: ${formatSupabaseError(createError)}`);
  }
  console.log("[Supabase Auth] Pending-Profil erstellt", {
    userId: user.id,
    created,
    insertRow
  });
  return profileFromSupabase(created as GenericSupabaseRow, email);
}

export async function touchCurrentProfileLogin(): Promise<void> {
  const supabase = await getSupabaseClientAsync();
  if (!supabase) {
    console.warn("[Supabase Auth] last_login_at Update abgebrochen: Supabase Client fehlt.");
    return;
  }
  const { data, error: authError } = await supabase.auth.getUser();
  console.log("[Supabase Auth] touchCurrentProfileLogin getUser", {
    userId: data.user?.id ?? null,
    userEmail: data.user?.email ?? null,
    authError: authError ?? null
  });
  if (authError || !data.user) return;
  const updateRow = { last_login_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const result = await supabase
    .from("profiles")
    .update(updateRow)
    .eq("id", data.user.id);
  if (!result.error) {
    console.log("[Supabase Auth] last_login_at aktualisiert", {
      userId: data.user.id,
      updateRow,
      response: result
    });
    return;
  }

  const missingColumn = extractMissingColumn(result.error.message ?? "");
  if (missingColumn === "last_login_at") {
    console.warn("[Supabase Auth] Spalte last_login_at fehlt. Fallback auf updated_at-only.", {
      userId: data.user.id,
      error: result.error
    });
    const fallback = await supabase
      .from("profiles")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", data.user.id);
    if (fallback.error) {
      console.warn("[Supabase Auth] updated_at-Fallback konnte nicht aktualisiert werden", {
        userId: data.user.id,
        error: fallback.error,
        response: fallback
      });
    } else {
      console.log("[Supabase Auth] updated_at-Fallback aktualisiert", {
        userId: data.user.id,
        response: fallback
      });
    }
    return;
  }

  console.warn("[Supabase Auth] last_login_at konnte nicht aktualisiert werden", {
    userId: data.user.id,
    error: result.error,
    response: result
  });
}

export async function loadUserProfiles(): Promise<UserProfile[]> {
  const supabase = await getSupabaseClientAsync();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Nutzer konnten nicht geladen werden: ${formatSupabaseError(error)}`);
  return (data ?? []).map((row) => profileFromSupabase(row as GenericSupabaseRow));
}

export async function updateUserProfileAdmin(
  profileId: string,
  update: Partial<Pick<UserProfile, "role" | "status" | "fullName">>
): Promise<UserProfile> {
  const supabase = await getSupabaseClientAsync();
  if (!supabase) throw new Error(`Nutzer konnte nicht aktualisiert werden: ${formatMissingSupabaseEnvironment()}`);
  const row: GenericSupabaseRow = {
    updated_at: new Date().toISOString()
  };
  if (update.role) row.role = update.role;
  if (update.status) row.status = update.status;
  if (update.fullName !== undefined) row.full_name = update.fullName;
  const { data, error } = await supabase
    .from("profiles")
    .update(row)
    .eq("id", profileId)
    .select("*")
    .single();
  if (error) throw new Error(`Nutzer konnte nicht aktualisiert werden: ${formatSupabaseError(error)}`);
  return profileFromSupabase(data as GenericSupabaseRow);
}

export async function deactivateUserProfile(profileId: string): Promise<UserProfile> {
  return updateUserProfileAdmin(profileId, { status: "blocked" });
}

export async function loadActivityLogs(options: { limit?: number } = {}): Promise<ActivityLogEntry[]> {
  const supabase = await getSupabaseClientAsync();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("activity_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 200);
  if (error) throw new Error(`Aktivitaeten konnten nicht geladen werden: ${formatSupabaseError(error)}`);
  return (data ?? []).map((row) => activityLogFromSupabase(row as GenericSupabaseRow));
}

export async function logActivity(input: ActivityLogInput): Promise<void> {
  const supabase = await getSupabaseClientAsync();
  if (!supabase) return;
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const row: GenericSupabaseRow = {
    user_id: user?.id ?? null,
    user_email: user?.email ?? "",
    action: input.action,
    area: input.area,
    target_type: input.targetType ?? "",
    target_id: input.targetId ?? null,
    target_label: input.targetLabel ?? "",
    details: input.details ?? {}
  };
  const { error } = await supabase.from("activity_logs").insert(row);
  if (error) console.warn("[Supabase Activity] Aktivitaet konnte nicht gespeichert werden", { row, error });
}

export async function loadQuarterlyReportBundle(): Promise<QuarterlyReportBundle> {
  const supabase = await getSupabaseClientAsync();
  if (!supabase) return emptyQuarterlyReportBundle();

  const [fundsResult, reportsResult, filesResult, powerBiResult, valuesResult] = await Promise.all([
    supabase.from("funds").select("*").order("fund_name", { ascending: true }),
    supabase.from("quarterly_reports").select("*").order("last_changed_at", { ascending: false }),
    supabase.from("quarterly_report_files").select("*").order("upload_date", { ascending: false }),
    supabase.from("quarterly_report_powerbi_links").select("*").order("created_at", { ascending: false }),
    supabase.from("quarterly_report_values").select("*").order("created_at", { ascending: true })
  ]);

  assertQuarterlyResult(fundsResult.error, "Fonds");
  assertQuarterlyResult(reportsResult.error, "Quartalsberichte");
  assertQuarterlyResult(filesResult.error, "Excel-Zuordnungen");
  assertQuarterlyResult(powerBiResult.error, "PowerBI-Zuordnungen");
  assertQuarterlyResult(valuesResult.error, "Pruefwerte");

  return {
    funds: (fundsResult.data ?? []).map((row) => fundFromSupabase(row as GenericSupabaseRow)),
    reports: (reportsResult.data ?? []).map((row) => quarterlyReportFromSupabase(row as GenericSupabaseRow)),
    files: (filesResult.data ?? []).map((row) => quarterlyReportFileFromSupabase(row as GenericSupabaseRow)),
    powerBiLinks: (powerBiResult.data ?? []).map((row) => quarterlyPowerBiFromSupabase(row as GenericSupabaseRow)),
    values: (valuesResult.data ?? []).map((row) => quarterlyValueFromSupabase(row as GenericSupabaseRow))
  };
}

export async function saveFund(input: {
  id?: string;
  fundName: string;
  fundNumber: string;
  address?: string;
  company?: string;
  commercialRegisterNumber?: string;
  currentValue?: string;
  objectCount?: number;
  contactPerson?: string;
  status?: string;
  remark?: string;
}): Promise<FundRecord> {
  const supabase = await getSupabaseClientAsync();
  if (!supabase) throw new Error(`Fonds konnte nicht gespeichert werden: ${formatMissingSupabaseEnvironment()}`);
  const row: GenericSupabaseRow = {
    fund_name: input.fundName.trim(),
    fund_number: input.fundNumber.trim(),
    address: emptyToNull(input.address),
    company: emptyToNull(input.company),
    commercial_register_number: emptyToNull(input.commercialRegisterNumber),
    current_value: emptyToNull(input.currentValue),
    object_count: input.objectCount ?? 0,
    contact_person: emptyToNull(input.contactPerson),
    status: input.status?.trim() || "active",
    remark: emptyToNull(input.remark),
    updated_at: new Date().toISOString()
  };
  if (!row.fund_name || !row.fund_number) throw new Error("Fondsname und Fondsnummer sind Pflichtfelder.");
  const query = input.id
    ? supabase.from("funds").update(row).eq("id", input.id)
    : supabase.from("funds").insert(row);
  const { data, error } = await query.select("*").single();
  if (error) throw new Error(`Fonds konnte nicht gespeichert werden: ${formatSupabaseError(error)}`);
  return fundFromSupabase(data as GenericSupabaseRow);
}

export async function saveQuarterlyReport(input: {
  id?: string;
  fundId: string;
  quarter: string;
  year: number;
  reportDate: string;
  status: string;
  version: string;
  editor: string;
}): Promise<QuarterlyReportRecord> {
  const supabase = await getSupabaseClientAsync();
  if (!supabase) throw new Error(`Quartalsbericht konnte nicht gespeichert werden: ${formatMissingSupabaseEnvironment()}`);
  if (!input.fundId) throw new Error("Quartalsbericht kann nicht ohne Fonds-Zuordnung gespeichert werden.");
  const now = new Date().toISOString();
  const row: GenericSupabaseRow = {
    fund_id: input.fundId,
    quarter: input.quarter,
    year: input.year,
    report_date: input.reportDate,
    status: input.status || "draft",
    version: input.version || "1.0",
    editor: emptyToNull(input.editor),
    last_changed_at: now,
    updated_at: now
  };
  const query = input.id
    ? supabase.from("quarterly_reports").update(row).eq("id", input.id)
    : supabase.from("quarterly_reports").insert(row);
  const { data, error } = await query.select("*").single();
  if (error) throw new Error(`Quartalsbericht konnte nicht gespeichert werden: ${formatSupabaseError(error)}`);
  await writeQuarterlyAuditLog(supabase, {
    reportId: stringValue((data as GenericSupabaseRow).id),
    fundId: input.fundId,
    action: input.id ? "update_report" : "create_report",
    area: "quarterly_reports",
    details: row
  });
  return quarterlyReportFromSupabase(data as GenericSupabaseRow);
}

export async function saveQuarterlyReportFile(input: Omit<QuarterlyReportFileRecord, "id" | "uploadDate"> & { id?: string }): Promise<QuarterlyReportFileRecord> {
  const supabase = await getSupabaseClientAsync();
  if (!supabase) throw new Error(`Excel-Zuordnung konnte nicht gespeichert werden: ${formatMissingSupabaseEnvironment()}`);
  if (!input.reportId || !input.fundId || !input.assignedQuarter || !input.assignedYear) {
    throw new Error("Excel-Dateien brauchen Fonds, Quartalsbericht, Quartal und Jahr.");
  }
  const row: GenericSupabaseRow = {
    report_id: input.reportId,
    fund_id: input.fundId,
    file_type: input.fileType,
    file_name: input.fileName.trim(),
    assigned_quarter: input.assignedQuarter,
    assigned_year: input.assignedYear,
    sheet_name: emptyToNull(input.sheetName),
    relevant_cells: emptyToNull(input.relevantCells),
    relevant_columns: emptyToNull(input.relevantColumns),
    import_status: input.importStatus || "pending",
    error_log: emptyToNull(input.errorLog),
    updated_at: new Date().toISOString()
  };
  if (!row.file_name) throw new Error("Dateiname ist ein Pflichtfeld.");
  const query = input.id
    ? supabase.from("quarterly_report_files").update(row).eq("id", input.id)
    : supabase.from("quarterly_report_files").insert(row);
  const { data, error } = await query.select("*").single();
  if (error) throw new Error(`Excel-Zuordnung konnte nicht gespeichert werden: ${formatSupabaseError(error)}`);
  return quarterlyReportFileFromSupabase(data as GenericSupabaseRow);
}

export async function saveQuarterlyPowerBiLink(input: Omit<QuarterlyReportPowerBiLinkRecord, "id"> & { id?: string }): Promise<QuarterlyReportPowerBiLinkRecord> {
  const supabase = await getSupabaseClientAsync();
  if (!supabase) throw new Error(`PowerBI-Zuordnung konnte nicht gespeichert werden: ${formatMissingSupabaseEnvironment()}`);
  if (!input.reportId || !input.fundId) throw new Error("PowerBI-Werte brauchen Fonds und Quartalsbericht.");
  const row: GenericSupabaseRow = {
    report_id: input.reportId,
    fund_id: input.fundId,
    workspace: input.workspace.trim(),
    report_dashboard: input.reportDashboard.trim(),
    dataset: input.dataset.trim(),
    metric: input.metric.trim(),
    source_cell: emptyToNull(input.sourceCell),
    report_date: input.reportDate,
    value: emptyToNull(input.value),
    last_sync_at: emptyToNull(input.lastSyncAt),
    is_overridden: input.isOverridden,
    manual_value: emptyToNull(input.manualValue),
    import_status: input.importStatus || "pending",
    error_log: emptyToNull(input.errorLog),
    updated_at: new Date().toISOString()
  };
  if (!row.workspace || !row.report_dashboard || !row.dataset || !row.metric) {
    throw new Error("Workspace, Report/Dashboard, Dataset und Kennzahl sind Pflichtfelder.");
  }
  const query = input.id
    ? supabase.from("quarterly_report_powerbi_links").update(row).eq("id", input.id)
    : supabase.from("quarterly_report_powerbi_links").insert(row);
  const { data, error } = await query.select("*").single();
  if (error) throw new Error(`PowerBI-Zuordnung konnte nicht gespeichert werden: ${formatSupabaseError(error)}`);
  return quarterlyPowerBiFromSupabase(data as GenericSupabaseRow);
}

export async function saveQuarterlyReportValue(input: Omit<QuarterlyReportValueRecord, "id"> & { id?: string }): Promise<QuarterlyReportValueRecord> {
  const supabase = await getSupabaseClientAsync();
  if (!supabase) throw new Error(`Pruefwert konnte nicht gespeichert werden: ${formatMissingSupabaseEnvironment()}`);
  if (!input.reportId || !input.fundId) throw new Error("Pruefwerte brauchen Fonds und Quartalsbericht.");
  const row: GenericSupabaseRow = {
    report_id: input.reportId,
    fund_id: input.fundId,
    value_key: input.valueKey.trim(),
    label: input.label.trim(),
    source_type: input.sourceType,
    source_reference: emptyToNull(input.sourceReference),
    value: emptyToNull(input.value),
    reviewed_value: emptyToNull(input.reviewedValue),
    is_reviewed: input.isReviewed,
    status: input.status || "open",
    remark: emptyToNull(input.remark),
    updated_at: new Date().toISOString()
  };
  if (!row.value_key || !row.label) throw new Error("Wert-Schluessel und Bezeichnung sind Pflichtfelder.");
  const query = input.id
    ? supabase.from("quarterly_report_values").update(row).eq("id", input.id)
    : supabase.from("quarterly_report_values").upsert(row, { onConflict: "report_id,value_key" });
  const { data, error } = await query.select("*").single();
  if (error) throw new Error(`Pruefwert konnte nicht gespeichert werden: ${formatSupabaseError(error)}`);
  return quarterlyValueFromSupabase(data as GenericSupabaseRow);
}

type SupabaseObjectRow = {
  id?: string | number | null;
  object_number?: string | null;
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
  year_of_construction?: string | number | null;
  total_area?: string | number | null;
  renovated_area?: string | number | null;
  residential_units?: string | number | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
};

export interface SupabaseObjectImportSummary {
  imported: number;
  skipped: number;
  errors: string[];
}

export interface SupabaseBackfillTableSummary {
  table: string;
  local: number;
  before: number;
  after?: number;
  imported: number;
  skipped: number;
  notRepairable: number;
  errors: string[];
}

export interface SupabaseDocumentCostImportSummary {
  localDocumentsTotal: number;
  documentsImported: number;
  costItemsImported: number;
  supabaseDocumentCount?: number;
  supabaseCostItemCount?: number;
  appDocumentCount?: number;
  measureDetailsCount?: number;
  clustersCount?: number;
  diagnosis?: string;
  skipped: number;
  skippedMissingObject: number;
  skippedDuplicate: number;
  skippedEmpty: number;
  errors: string[];
}

export interface SupabaseDocumentLoadResult {
  documents: ObjectAnalysis[];
  supabaseDocumentCount: number;
  supabaseCostItemCount: number;
  appDocumentCount: number;
  measureDetailsCount: number;
  clustersCount: number;
  autoRepair: SupabaseDocumentAutoRepairSummary;
}

export interface SupabaseTableLoadDiagnostic {
  table: string;
  query: string;
  filters: Record<string, unknown>;
  loaded: boolean;
  count: number;
  sample: unknown[];
  error: string | null;
  rlsError: boolean;
}

export interface SupabaseDocumentAutoRepairSummary {
  enabled: boolean;
  loaded: number;
  incomplete: number;
  repaired: number;
  skipped: number;
  failed: number;
  details: Array<{
    documentId: string;
    status: "repaired" | "skipped" | "failed";
    reason: string;
  }>;
}

export interface SupabaseOnlineData {
  objects: StoredObjectRecord[];
  documents: SupabaseDocumentLoadResult;
  projects: StoredProjectRecord[];
  assignments: Record<string, string | null>;
  entrances: StoredEntranceRecord[];
  objectImages: Record<string, string[]>;
  diagnostics: SupabaseTableLoadDiagnostic[];
  supabaseActive: boolean;
}

export async function loadSupabaseObjects(): Promise<StoredObjectRecord[]> {
  const supabase = await getSupabaseClientAsync();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("objects")
    .select("*")
    .order("object_number", { ascending: true });

  if (error) {
    throw new Error(`Supabase-Objekte konnten nicht geladen werden: ${formatSupabaseError(error)}`);
  }

  return (data ?? []).map((row) => objectRowFromSupabase(row as SupabaseObjectRow));
}

export async function createSupabaseObject(object: StoredObjectRecord): Promise<StoredObjectRecord> {
  const supabase = await getSupabaseClientAsync();
  if (!supabase) {
    throw new Error(`Supabase-Objekt konnte nicht gespeichert werden: ${formatMissingSupabaseEnvironment()}`);
  }
  const insertRow = objectRowToSupabase(object, { includeId: true });
  console.log("[Supabase Import] Lokales Objekt vor Insert", object);
  console.log("[Supabase Import] Supabase-Datensatz vor Insert", insertRow);

  const data = await insertRowAdaptive(supabase, "objects", insertRow, ["object_number", "address"]);
  return objectRowFromSupabase(data as SupabaseObjectRow, object);
}

export async function importMissingObjectsToSupabase(objects: StoredObjectRecord[]): Promise<SupabaseObjectImportSummary> {
  await getRuntimeSupabaseConfig({ forceRefresh: true });
  console.log("[Supabase Import] Runtime Config vor Import", runtimeSupabaseStatus ?? {
    loaded: false,
    hasUrl: false,
    hasAnonKey: false,
    hasNextPublicAnonKey: false,
    hasServerAnonKey: false,
    runtime: "server"
  });
  const existingObjects = await loadSupabaseObjects();
  const existingByObjectKey = new Map<string, StoredObjectRecord>();
  existingObjects.forEach((object) => {
    objectImportKeys(object).forEach((key) => existingByObjectKey.set(key, object));
  });
  const processedObjectKeys = new Set<string>();
  const sampleObject = objects.find((object) => objectImportKeys(object).length > 0) ?? objects[0] ?? null;
  if (sampleObject) {
    console.log("[Supabase Import] Beispiel lokales Objekt", sampleObject);
    console.log("[Supabase Import] Beispiel Supabase-Datensatz", objectRowToSupabase(sampleObject, { includeId: true }));
  }
  const summary: SupabaseObjectImportSummary = {
    imported: 0,
    skipped: 0,
    errors: []
  };

  for (const object of objects) {
    const objectKeys = objectImportKeys(object);
    const primaryKey = objectKeys[0] ?? "";
    if (!primaryKey) {
      summary.skipped += 1;
      summary.errors.push(`${object.address || object.id}: keine importierbare Objektnummer oder Adresse vorhanden.`);
      continue;
    }

    if (objectKeys.some((key) => processedObjectKeys.has(key))) {
      summary.skipped += 1;
      continue;
    }

    try {
      const existingObject = objectKeys.map((key) => existingByObjectKey.get(key)).find(Boolean);
      if (existingObject) {
        const backfilledObject = backfillObjectRecord(existingObject, object);
        const updatedObject = await updateSupabaseObjectIfPossible(backfilledObject);
        objectImportKeys(updatedObject).forEach((key) => existingByObjectKey.set(key, updatedObject));
        summary.skipped += 1;
      } else {
        const createdObject = await createSupabaseObject(object);
        objectImportKeys(createdObject).forEach((key) => existingByObjectKey.set(key, createdObject));
        summary.imported += 1;
      }
      objectKeys.forEach((key) => processedObjectKeys.add(key));
    } catch (error) {
      summary.errors.push(`${object.objectNumber || object.address || object.id}: ${error instanceof Error ? error.message : "Import fehlgeschlagen."}`);
    }
  }

  return summary;
}

export async function updateSupabaseObject(object: StoredObjectRecord): Promise<StoredObjectRecord> {
  const supabase = await getSupabaseClientAsync();
  if (!supabase) {
    throw new Error(`Supabase-Objekt konnte nicht aktualisiert werden: ${formatMissingSupabaseEnvironment()}`);
  }
  if (!isUuid(object.id)) {
    return createSupabaseObject(object);
  }
  const updateRow = objectRowToSupabase(object);
  console.log("[Supabase Import] Lokales Objekt vor Update", object);
  console.log("[Supabase Import] Supabase-Datensatz vor Update", updateRow);

  const data = await updateObjectRowAdaptive(supabase, object.id, updateRow);
  return objectRowFromSupabase(data as SupabaseObjectRow, object);
}

async function updateSupabaseObjectIfPossible(object: StoredObjectRecord): Promise<StoredObjectRecord> {
  try {
    return await updateSupabaseObject(object);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("PGRST116") || message.includes("result contains 0 rows")) {
      console.warn("[Supabase Import] Bestehendes Objekt konnte nicht aktualisiert werden, wird fuer Rettungsimport als vorhanden uebersprungen.", {
        objectId: object.id,
        objectNumber: object.objectNumber,
        error
      });
      return object;
    }
    throw error;
  }
}

export async function deleteSupabaseObject(id: string): Promise<void> {
  if (!isUuid(id)) return;
  const supabase = await getSupabaseClientAsync();
  if (!supabase) {
    throw new Error(`Supabase-Objekt konnte nicht geloescht werden: ${formatMissingSupabaseEnvironment()}`);
  }

  const { error } = await supabase
    .from("objects")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(`Supabase-Objekt konnte nicht gelöscht werden: ${formatSupabaseError(error)}`);
  }
}

export async function loadSupabaseProjects(): Promise<StoredProjectRecord[]> {
  const supabase = await getSupabaseClientAsync();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("projects")
    .select("*");

  if (error) {
    throw new Error(`Supabase-Projekte konnten nicht geladen werden: ${formatSupabaseError(error)}`);
  }

  return (data ?? []).map((row) => projectRowFromSupabase(row as GenericSupabaseRow));
}

export async function upsertSupabaseProject(project: StoredProjectRecord): Promise<StoredProjectRecord> {
  const supabase = await getSupabaseClientAsync();
  if (!supabase) {
    throw new Error(`Supabase-Projekt konnte nicht gespeichert werden: ${formatMissingSupabaseEnvironment()}`);
  }
  const resolvedObjectId = await resolveSupabaseObjectIdForProject(supabase, project);
  const row = projectRowToSupabase(
    resolvedObjectId && resolvedObjectId !== project.objectId ? { ...project, objectId: resolvedObjectId } : project,
    { includeId: isUuid(project.id) }
  );
  console.log("[Supabase Backfill] Project UPSERT Payload", { project, resolvedObjectId, row });
  const existingProjectId = await resolveSupabaseIdByLocalId(supabase, "projects", project.id, "local_project_id");
  if (existingProjectId) {
    const updated = await updateRowAdaptive(supabase, "projects", existingProjectId, row, ["name"]);
    return projectRowFromSupabase(updated, project);
  }
  const inserted = await insertRowAdaptive(supabase, "projects", row, ["name"]);
  return projectRowFromSupabase(inserted, project);
}

export async function importEntrancesToSupabase(entrances: StoredEntranceRecord[]): Promise<SupabaseBackfillTableSummary> {
  const supabase = await getSupabaseClientAsync();
  if (!supabase) {
    throw new Error(`Supabase-Hauseingaenge konnten nicht gespeichert werden: ${formatMissingSupabaseEnvironment()}`);
  }
  const before = await countSupabaseRows(supabase, "entrances");
  const summary: SupabaseBackfillTableSummary = {
    table: "entrances",
    local: entrances.length,
    before,
    imported: 0,
    skipped: 0,
    notRepairable: 0,
    errors: []
  };
  for (const entrance of entrances) {
    try {
      const resolvedObjectId = await resolveSupabaseObjectIdForEntrance(supabase, entrance);
      const row = entranceRowToSupabase(resolvedObjectId ? { ...entrance, objectId: resolvedObjectId } : entrance);
      console.log("[Supabase Backfill] Entrance UPSERT Payload", { entrance, resolvedObjectId, row });
      const existingEntranceId = await resolveSupabaseIdByLocalId(supabase, "entrances", entrance.id, "local_entrance_id");
      if (existingEntranceId) {
        await updateRowAdaptive(supabase, "entrances", existingEntranceId, row, []);
      } else {
        await insertRowAdaptive(supabase, "entrances", row, []);
      }
      summary.imported += 1;
    } catch (error) {
      summary.errors.push(`${entrance.id}: ${error instanceof Error ? error.message : "Import fehlgeschlagen."}`);
    }
  }
  summary.after = await countSupabaseRows(supabase, "entrances");
  console.log("[Supabase Backfill] Entrances Ergebnis", summary);
  return summary;
}

export async function importAssignmentsToSupabase(assignments: Record<string, string | null>): Promise<SupabaseBackfillTableSummary> {
  const supabase = await getSupabaseClientAsync();
  if (!supabase) {
    throw new Error(`Supabase-Zuordnungen konnten nicht gespeichert werden: ${formatMissingSupabaseEnvironment()}`);
  }
  const entries = Object.entries(assignments);
  const before = await countSupabaseRows(supabase, "assignments");
  const summary: SupabaseBackfillTableSummary = {
    table: "assignments",
    local: entries.length,
    before,
    imported: 0,
    skipped: 0,
    notRepairable: 0,
    errors: []
  };
  for (const [documentId, projectId] of entries) {
    try {
      if (!documentId) {
        summary.skipped += 1;
        summary.notRepairable += 1;
        continue;
      }
      await saveSupabaseAssignment(documentId, projectId);
      summary.imported += 1;
    } catch (error) {
      summary.errors.push(`${documentId}: ${error instanceof Error ? error.message : "Import fehlgeschlagen."}`);
    }
  }
  summary.after = await countSupabaseRows(supabase, "assignments");
  console.log("[Supabase Backfill] Assignments Ergebnis", summary);
  return summary;
}

export async function importObjectImagesToSupabase(objectImages: Record<string, string[]>): Promise<SupabaseBackfillTableSummary> {
  const supabase = await getSupabaseClientAsync();
  if (!supabase) {
    throw new Error(`Supabase-Objektbilder konnten nicht gespeichert werden: ${formatMissingSupabaseEnvironment()}`);
  }
  const entries = Object.entries(objectImages).flatMap(([objectId, images]) => images.map((url) => ({ objectId, url })));
  const before = await countSupabaseRows(supabase, "object_images");
  const summary: SupabaseBackfillTableSummary = {
    table: "object_images",
    local: entries.length,
    before,
    imported: 0,
    skipped: 0,
    notRepairable: 0,
    errors: []
  };
  for (const entry of entries) {
    try {
      const resolvedObjectId = isUuid(entry.objectId)
        ? entry.objectId
        : await resolveSupabaseIdByLocalId(supabase, "objects", entry.objectId, "local_object_id");
      if (!resolvedObjectId || !entry.url) {
        summary.skipped += 1;
        summary.notRepairable += 1;
        continue;
      }
      const row: GenericSupabaseRow = {
        object_id: resolvedObjectId,
        local_object_id: entry.objectId,
        url: entry.url,
        image_url: entry.url,
        metadata: {
          localObjectId: entry.objectId
        }
      };
      console.log("[Supabase Backfill] Object image INSERT Payload", row);
      await insertRowAdaptive(supabase, "object_images", row, ["object_id", "url"]);
      summary.imported += 1;
    } catch (error) {
      summary.errors.push(`${entry.objectId}: ${error instanceof Error ? error.message : "Import fehlgeschlagen."}`);
    }
  }
  summary.after = await countSupabaseRows(supabase, "object_images");
  console.log("[Supabase Backfill] Object images Ergebnis", summary);
  return summary;
}

export async function deleteSupabaseProject(id: string): Promise<void> {
  if (!isUuid(id)) return;
  const supabase = await getSupabaseClientAsync();
  if (!supabase) {
    throw new Error(`Supabase-Projekt konnte nicht geloescht werden: ${formatMissingSupabaseEnvironment()}`);
  }
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) {
    throw new Error(`Supabase-Projekt konnte nicht geloescht werden: ${formatSupabaseError(error)}`);
  }
}

export async function loadSupabaseAssignments(): Promise<Record<string, string | null>> {
  const supabase = await getSupabaseClientAsync();
  if (!supabase) return {};

  const { data, error } = await supabase
    .from("assignments")
    .select("*");

  if (error) {
    throw new Error(`Supabase-Zuordnungen konnten nicht geladen werden: ${formatSupabaseError(error)}`);
  }

  const assignments: Record<string, string | null> = {};
  (data ?? []).forEach((row) => {
    const assignment = assignmentRowFromSupabase(row as GenericSupabaseRow);
    if (assignment.documentId) assignments[assignment.documentId] = assignment.projectId || null;
  });
  return assignments;
}

export async function loadSupabaseEntrances(): Promise<StoredEntranceRecord[]> {
  const supabase = await getSupabaseClientAsync();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("entrances")
    .select("*");

  if (error) {
    throw new Error(`Supabase-Hauseingaenge konnten nicht geladen werden: ${formatSupabaseError(error)}`);
  }

  return (data ?? []).map((row) => entranceRowFromSupabase(row as GenericSupabaseRow));
}

export async function loadSupabaseObjectImages(): Promise<Record<string, string[]>> {
  const supabase = await getSupabaseClientAsync();
  if (!supabase) return {};

  const { data, error } = await supabase
    .from("object_images")
    .select("*");

  if (error) {
    throw new Error(`Supabase-Objektbilder konnten nicht geladen werden: ${formatSupabaseError(error)}`);
  }

  const images: Record<string, string[]> = {};
  (data ?? []).forEach((row) => {
    const imageRow = row as GenericSupabaseRow;
    const objectId = stringValue(imageRow.object_id || imageRow.local_object_id || readMetadataValue(imageRow, "objectId"));
    const url = stringValue(imageRow.url || imageRow.image_url || imageRow.file_url || imageRow.public_url);
    if (!objectId || !url) return;
    images[objectId] = [...(images[objectId] ?? []), url];
  });
  return images;
}

export async function saveSupabaseAssignment(documentId: string, projectId: string | null): Promise<void> {
  const supabase = await getSupabaseClientAsync();
  if (!supabase) {
    throw new Error(`Supabase-Zuordnung konnte nicht gespeichert werden: ${formatMissingSupabaseEnvironment()}`);
  }

  const [resolvedDocumentId, resolvedProjectId] = await Promise.all([
    resolveSupabaseIdByLocalId(supabase, "documents", documentId, "local_document_id"),
    projectId ? resolveSupabaseIdByLocalId(supabase, "projects", projectId, "local_project_id") : Promise.resolve(null)
  ]);
  const row = assignmentRowToSupabase(documentId, projectId, resolvedDocumentId, resolvedProjectId);
  const localAssignmentId = stringValue(row.local_assignment_id);
  const existingAssignmentId = localAssignmentId
    ? await resolveSupabaseIdByLocalId(supabase, "assignments", localAssignmentId, "local_assignment_id")
    : null;
  if (existingAssignmentId) {
    await updateRowAdaptive(supabase, "assignments", existingAssignmentId, row, ["data"]);
    return;
  }
  await insertRowAdaptive(supabase, "assignments", row, ["data"]);
}

export async function deleteSupabaseAssignment(documentId: string): Promise<void> {
  const supabase = await getSupabaseClientAsync();
  if (!supabase) {
    throw new Error(`Supabase-Zuordnung konnte nicht geloescht werden: ${formatMissingSupabaseEnvironment()}`);
  }
  const { error } = await supabase
    .from("assignments")
    .delete()
    .eq("document_id", documentId);

  if (error) {
    console.warn("[Supabase] Zuordnung konnte nicht per document_id geloescht werden.", { documentId, error });
  }
}

export async function deleteSupabaseDocument(documentId: string): Promise<void> {
  const supabase = await getSupabaseClientAsync();
  if (!supabase) {
    throw new Error(`Supabase-Dokument konnte nicht geloescht werden: ${formatMissingSupabaseEnvironment()}`);
  }

  const resolvedDocumentId = await resolveSupabaseIdByLocalId(supabase, "documents", documentId, "local_document_id");
  if (resolvedDocumentId) {
    const costItemsResult = await supabase.from("cost_items").delete().eq("document_id", resolvedDocumentId);
    if (costItemsResult.error) {
      console.warn("[Supabase] Kostenpositionen konnten nicht geloescht werden.", { documentId, error: costItemsResult.error });
    }
    const documentResult = await supabase.from("documents").delete().eq("id", resolvedDocumentId);
    if (documentResult.error) {
      throw new Error(`Supabase-Dokument konnte nicht geloescht werden: ${formatSupabaseError(documentResult.error)}`);
    }
    return;
  }

  const { error } = await supabase.from("documents").delete().eq("local_document_id", documentId);
  if (error) {
    throw new Error(`Supabase-Dokument konnte nicht geloescht werden: ${formatSupabaseError(error)}`);
  }
}

export async function loadSupabaseOnlineData(): Promise<SupabaseOnlineData> {
  const supabase = await getSupabaseClientAsync();
  if (!supabase) {
    return {
      objects: [],
      documents: emptySupabaseDocumentLoadResult(false),
      projects: [],
      assignments: {},
      entrances: [],
      objectImages: {},
      diagnostics: [],
      supabaseActive: false
    };
  }

  const diagnostics = await loadSupabaseTableDiagnostics(supabase, [
    "projects",
    "objects",
    "documents",
    "cost_items",
    "trades",
    "companies",
    "document_types",
    "units",
    "entrances",
    "assignments",
    "object_images"
  ]);

  const [objectsResult, documentsResult, projectsResult, assignmentsResult, entrancesResult, objectImagesResult] = await Promise.allSettled([
    loadSupabaseObjects(),
    loadSupabaseDocumentsWithCostItems(),
    loadSupabaseProjects(),
    loadSupabaseAssignments(),
    loadSupabaseEntrances(),
    loadSupabaseObjectImages()
  ]);

  const objects = unwrapSupabaseLoadResult(objectsResult, "objects", [] as StoredObjectRecord[]);
  const documents = unwrapSupabaseLoadResult(documentsResult, "documents", emptySupabaseDocumentLoadResult(true));
  const projects = unwrapSupabaseLoadResult(projectsResult, "projects", [] as StoredProjectRecord[]);
  const assignments = unwrapSupabaseLoadResult(assignmentsResult, "assignments", {} as Record<string, string | null>);
  const entrances = unwrapSupabaseLoadResult(entrancesResult, "entrances", [] as StoredEntranceRecord[]);
  const objectImages = unwrapSupabaseLoadResult(objectImagesResult, "object_images", {} as Record<string, string[]>);

  console.log("[Supabase Online] Tabellen-Diagnose", diagnostics);
  console.log("[Supabase Online] Geladene App-Daten", {
    supabaseActive: true,
    objects: objects.length,
    documents: documents.supabaseDocumentCount,
    appDocuments: documents.appDocumentCount,
    costItems: documents.supabaseCostItemCount,
    projects: projects.length,
    entrances: entrances.length,
    assignments: Object.keys(assignments).length,
    objectImages: Object.values(objectImages).reduce((sum, images) => sum + images.length, 0)
  });

  return {
    objects,
    documents,
    projects,
    assignments,
    entrances,
    objectImages,
    diagnostics,
    supabaseActive: true
  };
}

export async function loadSupabaseDocumentsWithCostItems(options: { autoRepair?: boolean } = {}): Promise<SupabaseDocumentLoadResult> {
  const autoRepairEnabled = options.autoRepair !== false;
  const supabase = await getSupabaseClientAsync();
  if (!supabase) {
    return {
      documents: [],
      supabaseDocumentCount: 0,
      supabaseCostItemCount: 0,
      appDocumentCount: 0,
      measureDetailsCount: 0,
      clustersCount: 0,
      autoRepair: emptyDocumentAutoRepairSummary(0, autoRepairEnabled)
    };
  }

  const [objectsResult, documentsResult, costItemsResult] = await Promise.all([
    supabase.from("objects").select("*"),
    supabase.from("documents").select("*"),
    supabase.from("cost_items").select("*")
  ]);

  if (objectsResult.error) throw new Error(`Supabase-Objekte konnten nicht geladen werden: ${formatSupabaseError(objectsResult.error)}`);
  if (documentsResult.error) throw new Error(`Supabase-Dokumente konnten nicht geladen werden: ${formatSupabaseError(documentsResult.error)}`);
  if (costItemsResult.error) throw new Error(`Supabase-Kostenpositionen konnten nicht geladen werden: ${formatSupabaseError(costItemsResult.error)}`);

  let autoRepair = emptyDocumentAutoRepairSummary(documentsResult.data?.length ?? 0, autoRepairEnabled);
  if (autoRepairEnabled) {
    autoRepair = await autoRepairIncompleteDocumentRows(
      supabase,
      documentsResult.data as GenericSupabaseRow[] | null,
      objectsResult.data as GenericSupabaseRow[] | null
    );
    if (autoRepair.repaired > 0) {
      console.log("[Supabase AutoRepair] Reparaturen abgeschlossen, Dokumentliste wird neu geladen.", autoRepair);
      const reloaded = await loadSupabaseDocumentsWithCostItems({ autoRepair: false });
      return {
        ...reloaded,
        autoRepair
      };
    }
  }

  const objectById = new Map<string, GenericSupabaseRow>();
  (objectsResult.data ?? []).forEach((row) => {
    const objectRow = row as GenericSupabaseRow;
    const id = stringValue(objectRow.id);
    if (id) objectById.set(id, objectRow);
  });

  const costItemsByDocumentId = new Map<string, GenericSupabaseRow[]>();
  const costItemsByLocalDocumentId = new Map<string, GenericSupabaseRow[]>();
  (costItemsResult.data ?? []).forEach((row) => {
    const costItem = row as GenericSupabaseRow;
    const documentId = stringValue(costItem.document_id);
    if (documentId) {
      costItemsByDocumentId.set(documentId, [...(costItemsByDocumentId.get(documentId) ?? []), costItem]);
    }
    const localDocumentId = stringValue(readMetadataValue(costItem, "localDocumentId") || costItem.local_document_id || costItem.source_document_id);
    if (localDocumentId) {
      costItemsByLocalDocumentId.set(localDocumentId, [...(costItemsByLocalDocumentId.get(localDocumentId) ?? []), costItem]);
    }
  });

  console.log("[Supabase] documents geladen", documentsResult.data?.length ?? 0);
  console.log("[Supabase] cost_items geladen", costItemsResult.data?.length ?? 0);

  const appDocuments = (documentsResult.data ?? []).map((row) => {
    const documentRow = row as GenericSupabaseRow;
    const documentId = stringValue(documentRow.id);
    const localDocumentId = stringValue(documentRow.local_document_id || readMetadataValue(documentRow, "localId"));
    const sourceDocumentId = stringValue(documentRow.source_document_id || documentRow.file_name || documentRow.document_name || documentRow.name);
    const objectRow = objectById.get(stringValue(documentRow.object_id)) ?? {};
    const costItems = uniqueRowsById([
      ...(costItemsByDocumentId.get(documentId) ?? []),
      ...(localDocumentId ? costItemsByLocalDocumentId.get(localDocumentId) ?? [] : []),
      ...(sourceDocumentId ? costItemsByLocalDocumentId.get(sourceDocumentId) ?? [] : [])
    ]);
    return objectAnalysisFromSupabase(documentRow, objectRow, costItems);
  });

  console.log("[Supabase] App-Dokumente erzeugt", appDocuments.length);
  console.log("[Supabase] measureDetails erzeugt", appDocuments.reduce((count, document) => count + (document.measureDetails?.length ?? 0), 0));
  console.log("[Supabase] clusters erzeugt", appDocuments.reduce((count, document) => count + document.clusters.length, 0));

  return {
    documents: appDocuments,
    supabaseDocumentCount: documentsResult.data?.length ?? 0,
    supabaseCostItemCount: costItemsResult.data?.length ?? 0,
    appDocumentCount: appDocuments.length,
    measureDetailsCount: appDocuments.reduce((count, document) => count + (document.measureDetails?.length ?? 0), 0),
    clustersCount: appDocuments.reduce((count, document) => count + document.clusters.length, 0),
    autoRepair
  };
}

export async function importDocumentsAndCostItemsToSupabase(documents: ObjectAnalysis[]): Promise<SupabaseDocumentCostImportSummary> {
  await getRuntimeSupabaseConfig({ forceRefresh: true });
  console.log("[Supabase Dokumentimport] Runtime Config vor Import", runtimeSupabaseStatus ?? {
    loaded: false,
    hasUrl: false,
    hasAnonKey: false,
    hasNextPublicAnonKey: false,
    hasServerAnonKey: false,
    runtime: "server"
  });

  const supabase = await getSupabaseClientAsync();
  if (!supabase) {
    throw new Error(`Supabase-Dokumentimport konnte nicht gestartet werden: ${formatMissingSupabaseEnvironment()}`);
  }

  const summary: SupabaseDocumentCostImportSummary = {
    localDocumentsTotal: documents.length,
    documentsImported: 0,
    costItemsImported: 0,
    skipped: 0,
    skippedMissingObject: 0,
    skippedDuplicate: 0,
    skippedEmpty: 0,
    errors: []
  };
  console.log("[Supabase Dokumentimport] Lokale Dokumente gesamt", documents.length);

  const [objectsResult, documentsResult, costItemsResult, tradesResult, documentTypesResult, companiesResult] = await Promise.all([
    supabase.from("objects").select("*"),
    supabase.from("documents").select("*"),
    supabase.from("cost_items").select("*"),
    supabase.from("trades").select("*"),
    supabase.from("document_types").select("*"),
    supabase.from("companies").select("*")
  ]);

  if (objectsResult.error) throw new Error(`Supabase-Objekte konnten nicht geladen werden: ${formatSupabaseError(objectsResult.error)}`);
  if (documentsResult.error) throw new Error(`Supabase-Dokumente konnten nicht geladen werden: ${formatSupabaseError(documentsResult.error)}`);
  if (costItemsResult.error) throw new Error(`Supabase-Kostenpositionen konnten nicht geladen werden: ${formatSupabaseError(costItemsResult.error)}`);
  if (tradesResult.error) throw new Error(`Supabase-Gewerke konnten nicht geladen werden: ${formatSupabaseError(tradesResult.error)}`);
  if (documentTypesResult.error) throw new Error(`Supabase-Dokumenttypen konnten nicht geladen werden: ${formatSupabaseError(documentTypesResult.error)}`);
  if (companiesResult.error) throw new Error(`Supabase-Firmen konnten nicht geladen werden: ${formatSupabaseError(companiesResult.error)}`);

  const objectsByNumber = new Map<string, GenericSupabaseRow>();
  const supabaseObjects = (objectsResult.data ?? []).map((row) => row as GenericSupabaseRow);
  (objectsResult.data ?? []).forEach((row) => {
    const objectNumber = normalizeObjectNumber(stringValue((row as GenericSupabaseRow).object_number));
    if (objectNumber) objectsByNumber.set(objectNumber, row as GenericSupabaseRow);
  });

  const tradeIdByName = new Map<string, string>();
  (tradesResult.data ?? []).forEach((row) => {
    const trade = row as GenericSupabaseRow;
    const tradeId = stringValue(trade.id);
    const names = [trade.name, trade.trade_name, trade.label, trade.title, trade.slug].map((value) => normalizeTradeLookup(stringValue(value)));
    names.forEach((name) => {
      if (name && tradeId) tradeIdByName.set(name, tradeId);
    });
  });

  const documentTypeIdByName = buildLookupIdByName(documentTypesResult.data as GenericSupabaseRow[] | null, ["name", "label", "type", "title", "slug"]);
  const companyIdByName = buildLookupIdByName(companiesResult.data as GenericSupabaseRow[] | null, ["name", "company_name", "label", "title", "slug"]);

  const existingDocumentKeys = new Set((documentsResult.data ?? [])
    .map((row) => documentDuplicateKey(row as GenericSupabaseRow))
    .filter(Boolean));
  const documentIdByKey = new Map<string, string>();
  (documentsResult.data ?? []).forEach((row) => {
    const documentRow = row as GenericSupabaseRow;
    const key = documentDuplicateKey(documentRow);
    const id = stringValue(documentRow.id);
    if (key && id) documentIdByKey.set(key, id);
  });
  const existingCostItemKeys = new Set((costItemsResult.data ?? [])
    .map((row) => costItemDuplicateKey(row as GenericSupabaseRow))
    .filter(Boolean));

  const sampleDocument = documents.find((document) => normalizeObjectNumber(unwrapTextField(document.objectNumber))) ?? documents[0] ?? null;
  if (sampleDocument) {
    const sampleObject = resolveSupabaseObjectForDocument(sampleDocument, objectsByNumber, supabaseObjects);
    const sampleDocumentTypeId = documentTypeIdByName.get(normalizeLookupKey(unwrapTextField(sampleDocument.documentType))) ?? null;
    const sampleCompanyId = companyIdByName.get(normalizeLookupKey(unwrapTextField(sampleDocument.provider))) ?? null;
    const sampleDocumentRow = sampleObject.objectRow ? documentRowToSupabase(sampleDocument, stringValue(sampleObject.objectRow.id), sampleObject.objectNumber, sampleDocumentTypeId, sampleCompanyId) : null;
    console.log("[Supabase Dokumentimport] Beispiel lokales Dokument", sampleDocument);
    console.log("[Supabase Dokumentimport] Beispiel documents-Datensatz", sampleDocumentRow);
    console.log("[Supabase Dokumentimport] Beispiel cost_items-Datensaetze", sampleDocumentRow ? costItemRowsToSupabase(sampleDocument, stringValue(sampleObject.objectRow?.id), "document-id", tradeIdByName) : []);
  }

  for (const document of documents) {
    if (isEmptyImportDocument(document)) {
      summary.skipped += 1;
      summary.skippedEmpty += 1;
      logSkippedSupabaseDocument(document, "Leeres Dokument ohne verwertbare Stammdaten oder Kostenpositionen.", null);
      continue;
    }

    let resolvedObject = resolveSupabaseObjectForDocument(document, objectsByNumber, supabaseObjects);
    if (!resolvedObject.objectRow) {
      const fallbackObject = objectRecordFromDocumentForImport(document);
      if (!fallbackObject) {
        summary.skipped += 1;
        summary.skippedMissingObject += 1;
        logSkippedSupabaseDocument(document, resolvedObject.reason, resolvedObject);
        continue;
      }
      try {
        console.log("[Supabase Dokumentimport] Objekt fehlt, wird aus Dokumentanalyse angelegt", {
          reason: resolvedObject.reason,
          document: summarizeDocumentForPersistence(document),
          fallbackObject
        });
        const createdObject = await createSupabaseObject(fallbackObject);
        const createdObjectRow: GenericSupabaseRow = {
          id: createdObject.id,
          object_number: createdObject.objectNumber,
          address: createdObject.address,
          postal_code: createdObject.postalCode,
          city: createdObject.city,
          total_area: createdObject.totalLivingAreaSqm,
          renovated_area: createdObject.wohnflaecheSanierteWohnung,
          residential_units: createdObject.unitCount
        };
        supabaseObjects.push(createdObjectRow);
        const createdObjectNumber = normalizeObjectNumber(createdObject.objectNumber);
        if (createdObjectNumber) objectsByNumber.set(createdObjectNumber, createdObjectRow);
        resolvedObject = {
          objectRow: createdObjectRow,
          objectNumber: createdObject.objectNumber,
          reason: "Objekt wurde aus Dokumentanalyse automatisch angelegt."
        };
      } catch (objectError) {
        summary.skipped += 1;
        summary.skippedMissingObject += 1;
        const reason = objectError instanceof Error ? objectError.message : "Objekt konnte nicht automatisch angelegt werden.";
        console.error("[Supabase Dokumentimport] Objekt konnte fuer Dokument nicht angelegt werden", {
          document: summarizeDocumentForPersistence(document),
          fallbackObject,
          error: objectError
        });
        logSkippedSupabaseDocument(document, `${resolvedObject.reason} Automatische Objektanlage fehlgeschlagen: ${reason}`, resolvedObject);
        continue;
      }
    }

    const resolvedObjectRow = resolvedObject.objectRow;
    if (!resolvedObjectRow) {
      summary.skipped += 1;
      summary.skippedMissingObject += 1;
      logSkippedSupabaseDocument(document, "Objekt konnte nicht aufgeloest werden.", resolvedObject);
      continue;
    }

    const objectId = stringValue(resolvedObjectRow.id);
    const documentTypeId = await ensureLookupId(supabase, "document_types", unwrapTextField(document.documentType), documentTypeIdByName, ["name"]);
    const companyId = await ensureLookupId(supabase, "companies", unwrapTextField(document.provider), companyIdByName, ["name", "company_name"]);
    const documentRow = documentRowToSupabase(document, objectId, resolvedObject.objectNumber, documentTypeId, companyId);
    assertPersistableDocumentRow(documentRow, document);
    const documentKey = documentDuplicateKey(documentRow);
    let supabaseDocumentId = documentIdByKey.get(documentKey) ?? null;

    try {
      console.log("[Supabase Dokumentimport] Persistenzobjekt vor UPSERT/INSERT", {
        localDocumentId: document.id,
        objectId,
        objectNumber: resolvedObject.objectNumber,
        extractedFields: summarizeDocumentForPersistence(document),
        documentRow
      });
      if (existingDocumentKeys.has(documentKey) && supabaseDocumentId) {
        const updatedDocument = await updateDocumentRowAdaptive(supabase, supabaseDocumentId, documentRow);
        supabaseDocumentId = stringValue(updatedDocument.id) || supabaseDocumentId;
        console.log("[Supabase Dokumentimport] Bestehendes Dokument per UPSERT aktualisiert", {
          documentKey,
          supabaseDocumentId,
          supabaseResponse: updatedDocument
        });
      } else {
        const insertedDocument = await insertDocumentRowAdaptive(supabase, documentRow);
        supabaseDocumentId = stringValue(insertedDocument.id);
        if (documentKey) existingDocumentKeys.add(documentKey);
        if (documentKey && supabaseDocumentId) documentIdByKey.set(documentKey, supabaseDocumentId);
        summary.documentsImported += 1;
      }

      const costRows = costItemRowsToSupabase(document, objectId, supabaseDocumentId, tradeIdByName);
      for (const costRow of costRows) {
        const costKey = costItemDuplicateKey(costRow);
        if (costKey && existingCostItemKeys.has(costKey)) {
          summary.skipped += 1;
          summary.skippedDuplicate += 1;
          continue;
        }
        await insertRowAdaptive(supabase, "cost_items", costRow, ["object_id", "document_id"]);
        if (costKey) existingCostItemKeys.add(costKey);
        summary.costItemsImported += 1;
      }
    } catch (error) {
      summary.errors.push(`${unwrapTextField(document.documentNumber) || document.id}: ${error instanceof Error ? error.message : "Import fehlgeschlagen."}`);
    }
  }

  return summary;
}

type GenericSupabaseRow = Record<string, unknown>;

function emptyQuarterlyReportBundle(): QuarterlyReportBundle {
  return {
    funds: [
      { id: "local-fonds-9", fundName: "Fonds 9", fundNumber: "Fonds 9", address: "", company: "", commercialRegisterNumber: "", currentValue: "", objectCount: 0, contactPerson: "", status: "active", remark: "Lokaler Beispiel-Fonds", updatedAt: "" },
      { id: "local-fonds-22", fundName: "Fonds 22", fundNumber: "Fonds 22", address: "", company: "", commercialRegisterNumber: "", currentValue: "", objectCount: 0, contactPerson: "", status: "active", remark: "Lokaler Beispiel-Fonds", updatedAt: "" },
      { id: "local-paif-1", fundName: "PAIF 1", fundNumber: "PAIF 1", address: "", company: "", commercialRegisterNumber: "", currentValue: "", objectCount: 0, contactPerson: "", status: "active", remark: "Lokaler Beispiel-Fonds", updatedAt: "" },
      { id: "local-paif-2", fundName: "PAIF 2", fundNumber: "PAIF 2", address: "", company: "", commercialRegisterNumber: "", currentValue: "", objectCount: 0, contactPerson: "", status: "active", remark: "Lokaler Beispiel-Fonds", updatedAt: "" }
    ],
    reports: [],
    files: [],
    powerBiLinks: [],
    values: []
  };
}

function assertQuarterlyResult(error: { message?: string; details?: string | null; hint?: string | null; code?: string | null } | null, label: string): void {
  if (!error) return;
  throw new Error(`${label} konnten nicht geladen werden. Bitte supabase/quarterly-reports-schema.sql im Supabase SQL Editor ausfuehren. ${formatSupabaseError(error)}`);
}

async function writeQuarterlyAuditLog(
  supabase: SupabaseClient,
  input: { reportId: string; fundId: string; action: string; area: string; details: Record<string, unknown> }
): Promise<void> {
  const { data } = await supabase.auth.getUser();
  const { error } = await supabase.from("quarterly_report_audit_log").insert({
    report_id: input.reportId || null,
    fund_id: input.fundId || null,
    action: input.action,
    area: input.area,
    details: input.details,
    created_by: data.user?.email ?? null
  });
  if (error) console.warn("[Quartalsberichte] Audit-Log konnte nicht geschrieben werden", { input, error });
}

function fundFromSupabase(row: GenericSupabaseRow): FundRecord {
  return {
    id: stringValue(row.id),
    fundName: stringValue(row.fund_name),
    fundNumber: stringValue(row.fund_number),
    address: stringValue(row.address),
    company: stringValue(row.company),
    commercialRegisterNumber: stringValue(row.commercial_register_number),
    currentValue: stringValue(row.current_value),
    objectCount: Number(row.object_count ?? 0),
    contactPerson: stringValue(row.contact_person),
    status: stringValue(row.status) || "active",
    remark: stringValue(row.remark),
    updatedAt: stringValue(row.updated_at)
  };
}

function quarterlyReportFromSupabase(row: GenericSupabaseRow): QuarterlyReportRecord {
  return {
    id: stringValue(row.id),
    fundId: stringValue(row.fund_id),
    quarter: stringValue(row.quarter),
    year: Number(row.year ?? new Date().getFullYear()),
    reportDate: stringValue(row.report_date),
    status: stringValue(row.status) || "draft",
    version: stringValue(row.version) || "1.0",
    editor: stringValue(row.editor),
    lastChangedAt: stringValue(row.last_changed_at)
  };
}

function quarterlyReportFileFromSupabase(row: GenericSupabaseRow): QuarterlyReportFileRecord {
  return {
    id: stringValue(row.id),
    reportId: stringValue(row.report_id),
    fundId: stringValue(row.fund_id),
    fileType: normalizeQuarterlyFileType(row.file_type),
    fileName: stringValue(row.file_name),
    uploadDate: stringValue(row.upload_date),
    assignedQuarter: stringValue(row.assigned_quarter),
    assignedYear: Number(row.assigned_year ?? new Date().getFullYear()),
    sheetName: stringValue(row.sheet_name),
    relevantCells: stringValue(row.relevant_cells),
    relevantColumns: stringValue(row.relevant_columns),
    importStatus: stringValue(row.import_status) || "pending",
    errorLog: stringValue(row.error_log)
  };
}

function quarterlyPowerBiFromSupabase(row: GenericSupabaseRow): QuarterlyReportPowerBiLinkRecord {
  return {
    id: stringValue(row.id),
    reportId: stringValue(row.report_id),
    fundId: stringValue(row.fund_id),
    workspace: stringValue(row.workspace),
    reportDashboard: stringValue(row.report_dashboard),
    dataset: stringValue(row.dataset),
    metric: stringValue(row.metric),
    sourceCell: stringValue(row.source_cell),
    reportDate: stringValue(row.report_date),
    value: stringValue(row.value),
    lastSyncAt: stringValue(row.last_sync_at),
    isOverridden: Boolean(row.is_overridden),
    manualValue: stringValue(row.manual_value),
    importStatus: stringValue(row.import_status) || "pending",
    errorLog: stringValue(row.error_log)
  };
}

function quarterlyValueFromSupabase(row: GenericSupabaseRow): QuarterlyReportValueRecord {
  return {
    id: stringValue(row.id),
    reportId: stringValue(row.report_id),
    fundId: stringValue(row.fund_id),
    valueKey: stringValue(row.value_key),
    label: stringValue(row.label),
    sourceType: stringValue(row.source_type),
    sourceReference: stringValue(row.source_reference),
    value: stringValue(row.value),
    reviewedValue: stringValue(row.reviewed_value),
    isReviewed: Boolean(row.is_reviewed),
    status: stringValue(row.status) || "open",
    remark: stringValue(row.remark)
  };
}

function normalizeQuarterlyFileType(value: unknown): QuarterlyReportFileType {
  const text = stringValue(value);
  return text === "Mieterliste" || text === "Verkehrswerte/VKW" || text === "CapEx/TDREV" || text === "Budget" || text === "Leerstand" || text === "Sonstige"
    ? text
    : "Sonstige";
}

function objectAnalysisFromSupabase(
  documentRow: GenericSupabaseRow,
  objectRow: GenericSupabaseRow,
  costItems: GenericSupabaseRow[]
): ObjectAnalysis {
  const documentId = stringValue(documentRow.local_document_id || documentRow.id || `supabase-document-${Date.now()}`);
  const sourceDocumentId = stringValue(documentRow.source_document_id || documentRow.file_name || documentRow.document_name || documentRow.name || documentId);
  const grossAmount = numberValue(documentRow.total_amount ?? documentRow.gross_amount ?? documentRow.amount ?? documentRow.cost_gross) ?? sumNumbers(costItems.map((item) =>
    numberValue(item.total_amount ?? item.gross_amount ?? item.amount ?? item.cost_gross)
  ));
  const clusters = costItems.map((item, index) => costItemRowToMeasureItem(item, documentId, sourceDocumentId, index));
  const measureDetails = costItems.map((item) => costItemRowToMeasureDetail(item));

  return {
    id: documentId,
    aiAgentName: textField("Supabase"),
    confidenceScore: numberField(numberValue(documentRow.confidence_score)),
    projectSuggestion: textField(""),
    assignmentSuggestion: textField(""),
    documentType: textField(stringValue(documentRow.document_type || documentRow.type)),
    installmentNumber: textField(stringValue(readMetadataValue(documentRow, "installmentNumber"))),
    projectType: textField(stringValue(readMetadataValue(documentRow, "projectType"))),
    provider: textField(stringValue(documentRow.supplier || documentRow.provider || documentRow.company_name)),
    year: numberField(yearFromDate(stringValue(documentRow.document_date))),
    fund: textField(stringValue(objectRow.fund)),
    objectNumber: textField(stringValue(documentRow.object_number || objectRow.object_number)),
    apartmentNumber: textField(stringValue(documentRow.apartment_number)),
    objectAddress: textField(stringValue(objectRow.address)),
    location: textField([objectRow.postal_code, objectRow.city].map(stringValue).filter(Boolean).join(" ")),
    documentDate: textField(stringValue(documentRow.document_date)),
    documentNumber: textField(stringValue(documentRow.document_number || documentRow.name || documentRow.document_name)),
    renovatedApartmentCount: numberField(numberValue(documentRow.renovated_apartment_count)),
    renovatedApartments: listField([]),
    livingAreaSqm: numberField(numberValue(documentRow.living_area_sqm)),
    totalAreaSqm: numberField(numberValue(objectRow.total_area)),
    renovatedAreaSqm: numberField(numberValue(objectRow.renovated_area)),
    netCost: numberField(numberValue(documentRow.net_amount ?? documentRow.subtotal_amount)),
    vatCost: numberField(numberValue(documentRow.vat_amount ?? documentRow.tax_amount)),
    totalCost: numberField(grossAmount),
    costPerApartment: numberField(null),
    costPerSqm: numberField(null),
    measureDescription: textField(clusters.map((cluster) => stringValue(cluster.description.value)).filter(Boolean).join(", ")),
    dataQuality: textField(stringValue(readMetadataValue(documentRow, "dataQuality")) || "Supabase"),
    missingInformation: listField(Array.isArray(readMetadataValue(documentRow, "missingInformation")) ? readMetadataValue(documentRow, "missingInformation") as string[] : []),
    costDebug: null,
    measureDetails,
    measureDebug: null,
    remarks: textField(""),
    manualChanges: [],
    clusters,
    sourceDocumentIds: [sourceDocumentId]
  };
}

function costItemRowToMeasureItem(
  row: GenericSupabaseRow,
  documentId: string,
  sourceDocumentId: string,
  index: number
): ObjectAnalysis["clusters"][number] {
  const tradeName = stringValue(row.trade_name || row.trade || row.trade_label || row.title || "Unklar");
  const description = stringValue(row.description || row.title || tradeName);
  const amount = numberValue(row.gross_amount ?? row.amount ?? row.cost_gross);
  return {
    id: stringValue(row.local_cost_item_id || row.id || `${documentId}:cost-item:${index}`),
    cluster: textField((tradeName || "Unklar") as MeasureCluster),
    description: textField(description),
    totalCost: numberField(amount),
    allocation: textField((stringValue(row.allocation) || null) as CostAllocation),
    sourceDocumentId,
    lineItems: []
  };
}

function costItemRowToMeasureDetail(row: GenericSupabaseRow): MeasureDetail {
  const tradeName = stringValue(row.trade_name || row.trade || row.trade_label || "Unklar");
  const description = stringValue(row.description || row.title || tradeName);
  return {
    abschnitt: stringValue(row.title || row.description || tradeName),
    cluster: (tradeName || "Unklar") as MeasureCluster,
    summe: numberValue(row.gross_amount ?? row.amount ?? row.cost_gross),
    beschreibung: description,
    quelle: stringValue(row.source || row.document_id)
  };
}

function textField<T extends string | MeasureCluster | CostAllocation>(value: T | null | undefined) {
  return {
    ...emptyField<T>(),
    value: value ?? null
  };
}

function numberField(value: number | null | undefined) {
  return {
    ...emptyField<number>(),
    value: value ?? null
  };
}

function listField<T>(value: T[]) {
  return {
    ...emptyField<T[]>(),
    value
  };
}

function readMetadataValue(row: GenericSupabaseRow, key: string): unknown {
  const metadata = row.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
  return (metadata as Record<string, unknown>)[key];
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function sumNumbers(values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => value !== null);
  if (!known.length) return null;
  return known.reduce((sum, value) => sum + value, 0);
}

function yearFromDate(value: string): number | null {
  const match = value.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function uniqueRowsById(rows: GenericSupabaseRow[]): GenericSupabaseRow[] {
  const seen = new Set<string>();
  return rows.filter((row, index) => {
    const key = stringValue(row.id || row.local_cost_item_id || row.description || index);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

interface SupabaseDocumentObjectResolution {
  objectRow: GenericSupabaseRow | null;
  objectNumber: string;
  reason: string;
}

function resolveSupabaseObjectForDocument(
  document: ObjectAnalysis,
  objectsByNumber: Map<string, GenericSupabaseRow>,
  supabaseObjects: GenericSupabaseRow[]
): SupabaseDocumentObjectResolution {
  const rawObjectNumber = unwrapTextField(document.objectNumber);
  const objectNumber = normalizeObjectNumber(rawObjectNumber);
  if (objectNumber) {
    const objectRow = objectsByNumber.get(objectNumber);
    if (objectRow?.id) {
      return {
        objectRow,
        objectNumber: stringValue(objectRow.object_number || rawObjectNumber),
        reason: "Objekt per Objektnummer gefunden."
      };
    }
  }

  const documentAddress = documentAddressValue(document);
  const addressMatches = findObjectMatchesByAddress(documentAddress, supabaseObjects);
  if (addressMatches.length === 1) {
    const objectRow = addressMatches[0];
    return {
      objectRow,
      objectNumber: stringValue(objectRow.object_number),
      reason: "Objekt per Adresse gefunden."
    };
  }

  if (addressMatches.length > 1) {
    return {
      objectRow: null,
      objectNumber: rawObjectNumber,
      reason: `Objektzuordnung mehrdeutig fuer Adresse "${documentAddress || "k.A."}" (${addressMatches.length} Treffer).`
    };
  }

  return {
    objectRow: null,
    objectNumber: rawObjectNumber,
    reason: objectNumber
      ? `Objekt ${rawObjectNumber} nicht in Supabase gefunden und kein Adress-Treffer fuer "${documentAddress || "k.A."}".`
      : `Keine Objektnummer vorhanden und kein Adress-Treffer fuer "${documentAddress || "k.A."}".`
  };
}

function findObjectMatchesByAddress(documentAddress: string, supabaseObjects: GenericSupabaseRow[]): GenericSupabaseRow[] {
  const normalizedDocumentAddress = normalizeAddress(documentAddress);
  if (!normalizedDocumentAddress.full) return [];

  return supabaseObjects.filter((object) => {
    const objectAddress = normalizeAddress([
      stringValue(object.address),
      stringValue(object.postal_code),
      stringValue(object.city)
    ].filter(Boolean).join(" "));
    if (!objectAddress.full) return false;

    if (objectAddress.full === normalizedDocumentAddress.full) return true;
    if (objectAddress.streetHouse && objectAddress.streetHouse === normalizedDocumentAddress.streetHouse) return true;
    if (objectAddress.houseNumber && normalizedDocumentAddress.houseNumber && objectAddress.houseNumber === normalizedDocumentAddress.houseNumber) {
      return objectAddress.street && normalizedDocumentAddress.street && (
        objectAddress.street.includes(normalizedDocumentAddress.street) ||
        normalizedDocumentAddress.street.includes(objectAddress.street)
      );
    }
    return objectAddress.full.includes(normalizedDocumentAddress.full) || normalizedDocumentAddress.full.includes(objectAddress.full);
  });
}

function documentAddressValue(document: ObjectAnalysis): string {
  return firstPresent(
    unwrapTextField(document.objectAddress),
    unwrapTextField(document.location)
  );
}

function objectRecordFromDocumentForImport(document: ObjectAnalysis): StoredObjectRecord | null {
  const objectNumber = unwrapTextField(document.objectNumber);
  const address = unwrapTextField(document.objectAddress);
  if (!objectNumber && !address) return null;
  const location = unwrapTextField(document.location);
  const { postalCode, city } = parsePostalCodeAndCity(firstPresent(address, location));
  return {
    id: createBrowserUuid(),
    fund: unwrapTextField(document.fund),
    objectNumber,
    objectName: firstPresent(address, objectNumber || document.id),
    address,
    postalCode,
    city,
    federalState: "",
    constructionYear: "",
    unitCount: stringValue(document.renovatedApartmentCount.value ?? ""),
    totalLivingAreaSqm: stringValue(document.totalAreaSqm.value ?? document.livingAreaSqm.value ?? ""),
    wohnflaecheSanierteWohnung: stringValue(document.renovatedAreaSqm.value ?? document.livingAreaSqm.value ?? ""),
    assetManager: "",
    portfolioManager: ""
  };
}

function parsePostalCodeAndCity(value: string): { postalCode: string; city: string } {
  const match = value.match(/\b(\d{5})\s+([A-Za-z\u00c4\u00d6\u00dc\u00e4\u00f6\u00fc\u00df .-]+)/);
  return {
    postalCode: match?.[1] ?? "",
    city: match?.[2]?.trim() ?? ""
  };
}

function normalizeAddress(value: string): { full: string; street: string; houseNumber: string; streetHouse: string } {
  const full = normalizeAddressText(value);
  const houseNumber = full.match(/\b\d+[a-z]?\b/i)?.[0] ?? "";
  const street = full
    .replace(/\b\d+[a-z]?\b/i, "")
    .replace(/\b\d{5}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return {
    full,
    street,
    houseNumber,
    streetHouse: [street, houseNumber].filter(Boolean).join(" ")
  };
}

function normalizeAddressText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/ÃƒÂ¤|Ã¤|ä/g, "ae")
    .replace(/ÃƒÂ¶|Ã¶|ö/g, "oe")
    .replace(/ÃƒÂ¼|Ã¼|ü/g, "ue")
    .replace(/ÃƒÅ¸|ÃŸ|ß/g, "ss")
    .replace(/strasse|straße/g, "str")
    .replace(/\bstra?\.?\b/g, "str")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isEmptyImportDocument(document: ObjectAnalysis): boolean {
  return !document.id
    && !documentLabel(document)
    && !documentAddressValue(document)
    && !unwrapTextField(document.objectNumber)
    && document.totalCost.value === null
    && document.netCost.value === null
    && document.vatCost.value === null
    && document.clusters.length === 0
    && !document.measureDetails?.length;
}

function logSkippedSupabaseDocument(
  document: ObjectAnalysis,
  reason: string,
  resolution: SupabaseDocumentObjectResolution | null
): void {
  console.warn("[Supabase Dokumentimport] Dokument uebersprungen", {
    dokumentname: documentLabel(document),
    erkannteAdresse: documentAddressValue(document) || "k.A.",
    erkannteObjektnummer: unwrapTextField(document.objectNumber) || "k.A.",
    erkannterObjectIdTreffer: resolution?.objectRow?.id ? stringValue(resolution.objectRow.id) : "k.A.",
    grund: reason
  });
}

function documentLabel(document: ObjectAnalysis): string {
  return unwrapTextField(document.documentNumber)
    || document.sourceDocumentIds[0]
    || documentAddressValue(document)
    || document.id;
}

function documentRowToSupabase(
  document: ObjectAnalysis,
  objectId: string,
  resolvedObjectNumber: string | undefined,
  documentTypeId: string | null,
  companyId: string | null
): GenericSupabaseRow {
  const documentTypeName = unwrapTextField(document.documentType);
  const companyName = unwrapTextField(document.provider);
  console.log("[Supabase Dokumentimport] document_type_id Mapping", {
    documentTypeName: documentTypeName || "k.A.",
    documentTypeId: documentTypeId ?? "NULL"
  });
  console.log("[Supabase Dokumentimport] company_id Mapping", {
    companyName: companyName || "k.A.",
    companyId: companyId ?? "NULL"
  });
  const row: GenericSupabaseRow = {
    object_id: objectId,
    document_type_id: documentTypeId,
    company_id: companyId,
    local_document_id: document.id,
    source_document_id: document.sourceDocumentIds[0] ?? document.id,
    document_number: emptyToNull(unwrapTextField(document.documentNumber)),
    number: emptyToNull(unwrapTextField(document.documentNumber)),
    file_name: emptyToNull(document.sourceDocumentIds[0] ?? document.id),
    document_name: emptyToNull(document.sourceDocumentIds[0] ?? unwrapTextField(document.documentNumber) ?? document.id),
    name: emptyToNull(document.sourceDocumentIds[0] ?? unwrapTextField(document.documentNumber) ?? document.id),
    file_url: emptyToNull(firstDocumentSource(document).fileName),
    document_type: emptyToNull(documentTypeName),
    type: emptyToNull(documentTypeName),
    provider: emptyToNull(companyName),
    supplier: emptyToNull(companyName),
    document_date: emptyToNull(toSupabaseDateString(unwrapTextField(document.documentDate))),
    date: emptyToNull(toSupabaseDateString(unwrapTextField(document.documentDate))),
    object_number: emptyToNull(firstPresent(unwrapTextField(document.objectNumber), resolvedObjectNumber)),
    apartment_number: emptyToNull(unwrapTextField(document.apartmentNumber)),
    net_amount: document.netCost.value,
    vat_amount: document.vatCost.value,
    gross_amount: document.totalCost.value,
    total_amount: document.totalCost.value,
    amount: document.totalCost.value,
    total_net_amount: document.netCost.value,
    tax_amount: document.vatCost.value,
    confidence_score: document.confidenceScore.value,
    analysis: buildDocumentAnalysisPayload(document),
    metadata: {
      localId: document.id,
      objectId,
      documentTypeId,
      companyId,
      supplier: companyName || null,
      projectType: unwrapTextField(document.projectType),
      installmentNumber: unwrapTextField(document.installmentNumber),
      dataQuality: unwrapTextField(document.dataQuality),
      missingInformation: document.missingInformation.value ?? [],
      sourceDocumentIds: document.sourceDocumentIds,
      analysis: buildDocumentAnalysisPayload(document)
    }
  };
  console.log("[Supabase Dokumentimport] Objekt wird gespeichert", {
    localDocumentId: document.id,
    objectId,
    objectNumber: row.object_number,
    documentTypeName,
    documentTypeId: documentTypeId ?? "NULL",
    companyName: companyName || "k.A.",
    companyId: companyId ?? "NULL",
    documentNumber: row.document_number,
    documentDate: row.document_date,
    totalAmount: row.total_amount,
    fileUrl: row.file_url
  });
  console.log("[Supabase Dokumentimport] JSON an Supabase documents", JSON.stringify(row, null, 2));
  return row;
}

function assertPersistableDocumentRow(row: GenericSupabaseRow, document: ObjectAnalysis): void {
  const meaningfulFields = [
    row.document_number,
    row.number,
    row.document_date,
    row.date,
    row.total_amount,
    row.gross_amount,
    row.amount,
    row.net_amount,
    row.vat_amount,
    row.supplier,
    row.provider,
    row.document_type,
    row.type,
    row.file_url,
    row.file_name,
    row.analysis
  ].filter((value) => {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
    return true;
  });

  if (meaningfulFields.length > 0) return;

  console.error("[Supabase Dokumentimport] Abbruch: Dokument-Mapping enthaelt keine fachlichen Felder. Insert/Update wird verhindert.", {
    localDocument: summarizeDocumentForPersistence(document),
    row,
    rowKeys: Object.keys(row)
  });
  throw new Error("Dokument wurde nicht gespeichert: Mapping enthielt keine fachlichen Dokumentfelder.");
}

function costItemRowsToSupabase(
  document: ObjectAnalysis,
  objectId: string,
  documentId: string,
  tradeIdByName: Map<string, string>
): GenericSupabaseRow[] {
  const detailRows = document.measureDetails?.length
    ? document.measureDetails.map((detail, index) => {
      const tradeName = String(detail.cluster ?? "");
      return {
        object_id: objectId,
        document_id: documentId,
        trade_id: tradeIdByName.get(normalizeTradeLookup(tradeName)) ?? null,
        trade_name: emptyToNull(tradeName),
        local_cost_item_id: `${document.id}:detail:${index}`,
        title: emptyToNull(firstPresent(detail.abschnitt, detail.beschreibung)),
        description: emptyToNull(firstPresent(detail.abschnitt, detail.beschreibung)),
        amount: detail.summe,
        gross_amount: detail.summe,
        cost_gross: detail.summe,
        allocation: null,
        source: emptyToNull(detail.quelle),
        metadata: {
          localDocumentId: document.id,
          section: detail.abschnitt,
          description: detail.beschreibung
        }
      };
    })
    : [];

  if (detailRows.length) return detailRows;

  return document.clusters.map((cluster, index) => {
    const tradeName = String(cluster.cluster.value ?? "");
    return {
      object_id: objectId,
      document_id: documentId,
      trade_id: tradeIdByName.get(normalizeTradeLookup(tradeName)) ?? null,
      trade_name: emptyToNull(tradeName),
      local_cost_item_id: cluster.id || `${document.id}:cluster:${index}`,
      title: emptyToNull(unwrapTextField(cluster.description)),
      description: emptyToNull(unwrapTextField(cluster.description)),
      amount: cluster.totalCost.value,
      gross_amount: cluster.totalCost.value,
      cost_gross: cluster.totalCost.value,
      allocation: emptyToNull(cluster.allocation.value ?? undefined),
      source: emptyToNull(cluster.sourceDocumentId || document.id),
      metadata: {
        localDocumentId: document.id,
        localClusterId: cluster.id,
        lineItems: cluster.lineItems ?? []
      }
    };
  });
}

async function autoRepairIncompleteDocumentRows(
  supabase: SupabaseClient,
  rawDocuments: GenericSupabaseRow[] | null,
  rawObjects: GenericSupabaseRow[] | null
): Promise<SupabaseDocumentAutoRepairSummary> {
  const documentRows = rawDocuments ?? [];
  const summary = emptyDocumentAutoRepairSummary(documentRows.length, true);
  const incompleteRows = documentRows.filter(isIncompleteDocumentRow);
  summary.incomplete = incompleteRows.length;

  console.log("[Supabase AutoRepair] Automatische Dokument-Reparatur aktiv", {
    loaded: summary.loaded,
    incomplete: summary.incomplete
  });

  if (!incompleteRows.length) return summary;

  const localDocuments = getDocuments();
  const localDocumentsByKey = buildLocalDocumentRepairIndex(localDocuments);
  const objectById = new Map<string, GenericSupabaseRow>();
  (rawObjects ?? []).forEach((row) => {
    const id = stringValue(row.id);
    if (id) objectById.set(id, row);
  });

  const [documentTypesResult, companiesResult] = await Promise.all([
    supabase.from("document_types").select("*"),
    supabase.from("companies").select("*")
  ]);
  const documentTypeIdByName = documentTypesResult.error
    ? new Map<string, string>()
    : buildLookupIdByName(documentTypesResult.data as GenericSupabaseRow[] | null, ["name", "label", "type", "title", "slug"]);
  const companyIdByName = companiesResult.error
    ? new Map<string, string>()
    : buildLookupIdByName(companiesResult.data as GenericSupabaseRow[] | null, ["name", "company_name", "label", "title", "slug"]);

  if (documentTypesResult.error) {
    console.warn("[Supabase AutoRepair] document_types konnte nicht fuer Reparatur geladen werden", documentTypesResult.error);
  }
  if (companiesResult.error) {
    console.warn("[Supabase AutoRepair] companies konnte nicht fuer Reparatur geladen werden", companiesResult.error);
  }

  for (const row of incompleteRows) {
    const documentId = stringValue(row.id);
    if (!documentId) {
      summary.skipped += 1;
      summary.details.push({ documentId: "k.A.", status: "skipped", reason: "Supabase Row hat keine id." });
      continue;
    }
    if (attemptedAutomaticDocumentRepairIds.has(documentId)) {
      summary.skipped += 1;
      summary.details.push({ documentId, status: "skipped", reason: "Reparatur wurde in dieser Sitzung bereits versucht." });
      continue;
    }
    attemptedAutomaticDocumentRepairIds.add(documentId);

    const localDocument = findLocalDocumentForRepair(row, localDocumentsByKey);
    if (!localDocument) {
      const reason = "Keine passende lokale Analyse/Metadaten gefunden.";
      console.warn("[Supabase AutoRepair] Dokument nicht reparierbar", { documentId, reason, row });
      await markDocumentAutoRepairStatus(supabase, documentId, row, "not_repairable", reason);
      summary.skipped += 1;
      summary.details.push({ documentId, status: "skipped", reason });
      continue;
    }

    const objectId = stringValue(row.object_id);
    if (!objectId) {
      const reason = "Keine object_id in Supabase Row vorhanden.";
      console.warn("[Supabase AutoRepair] Dokument nicht reparierbar", { documentId, reason, row });
      await markDocumentAutoRepairStatus(supabase, documentId, row, "not_repairable", reason);
      summary.skipped += 1;
      summary.details.push({ documentId, status: "skipped", reason });
      continue;
    }

    try {
      const objectRow = objectById.get(objectId);
      const documentTypeId = await ensureLookupId(supabase, "document_types", unwrapTextField(localDocument.documentType), documentTypeIdByName, ["name"]);
      const companyId = await ensureLookupId(supabase, "companies", unwrapTextField(localDocument.provider), companyIdByName, ["name", "company_name"]);
      const repairRow = documentRowToSupabase(
        localDocument,
        objectId,
        stringValue(objectRow?.object_number || row.object_number || unwrapTextField(localDocument.objectNumber)),
        documentTypeId,
        companyId
      );
      repairRow.metadata = {
        ...(isRecord(row.metadata) ? row.metadata : {}),
        ...(isRecord(repairRow.metadata) ? repairRow.metadata : {}),
        autoRepair: {
          status: "repaired",
          repairedAt: new Date().toISOString(),
          source: "localStorage analysis",
          reason: incompleteDocumentReasons(row)
        }
      };
      console.log("[Supabase AutoRepair] Reparatur wird ausgefuehrt", {
        documentId,
        reasons: incompleteDocumentReasons(row),
        localDocument: summarizeDocumentForPersistence(localDocument),
        repairRow
      });
      await updateDocumentRowAdaptive(supabase, documentId, repairRow);
      summary.repaired += 1;
      summary.details.push({ documentId, status: "repaired", reason: "Mit lokaler Analyse-Payload aktualisiert." });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Reparatur fehlgeschlagen.";
      console.error("[Supabase AutoRepair] Dokument-Reparatur fehlgeschlagen", { documentId, reason, row });
      summary.failed += 1;
      summary.details.push({ documentId, status: "failed", reason });
    }
  }

  console.log("[Supabase AutoRepair] Ergebnis", {
    loaded: summary.loaded,
    incomplete: summary.incomplete,
    repaired: summary.repaired,
    skipped: summary.skipped,
    failed: summary.failed,
    details: summary.details
  });
  return summary;
}

function emptyDocumentAutoRepairSummary(loaded: number, enabled: boolean): SupabaseDocumentAutoRepairSummary {
  return {
    enabled,
    loaded,
    incomplete: 0,
    repaired: 0,
    skipped: 0,
    failed: 0,
    details: []
  };
}

function isIncompleteDocumentRow(row: GenericSupabaseRow): boolean {
  return incompleteDocumentReasons(row).length > 0;
}

function incompleteDocumentReasons(row: GenericSupabaseRow): string[] {
  const reasons: string[] = [];
  if (!stringValue(row.document_number ?? row.number)) reasons.push("document_number fehlt");
  if (numberValue(row.total_amount ?? row.gross_amount ?? row.amount ?? row.cost_gross) === null) reasons.push("total_amount fehlt");
  if (!stringValue(row.file_url ?? row.file_name ?? row.document_name)) reasons.push("file_url/file_name fehlt");
  if (!isRecord(row.analysis)) reasons.push("analysis fehlt");
  if (!stringValue(row.supplier ?? row.provider ?? row.company_name)) reasons.push("supplier/provider fehlt");
  if (!stringValue(row.document_type ?? row.type) && !stringValue(row.document_type_id)) reasons.push("document_type fehlt");
  if (!stringValue(row.document_date ?? row.date)) reasons.push("document_date fehlt");
  return reasons;
}

function buildLocalDocumentRepairIndex(documents: ObjectAnalysis[]): Map<string, ObjectAnalysis> {
  const index = new Map<string, ObjectAnalysis>();
  documents.forEach((document) => {
    localDocumentRepairKeys(document).forEach((key) => {
      const existing = index.get(key);
      if (!existing || storedRepairDocumentCompletenessScore(document) > storedRepairDocumentCompletenessScore(existing)) {
        index.set(key, document);
      }
    });
  });
  return index;
}

function findLocalDocumentForRepair(row: GenericSupabaseRow, index: Map<string, ObjectAnalysis>): ObjectAnalysis | null {
  const keys = supabaseDocumentRepairKeys(row);
  return keys.map((key) => index.get(key)).find(Boolean) ?? null;
}

function localDocumentRepairKeys(document: ObjectAnalysis): string[] {
  return uniqueRepairKeys([
    repairKey("local", document.id),
    ...document.sourceDocumentIds.map((id) => repairKey("source", id)),
    repairKey("number", unwrapTextField(document.documentNumber)),
    repairKey("semantic", [
      unwrapTextField(document.documentNumber),
      unwrapTextField(document.objectNumber) || unwrapTextField(document.objectAddress),
      unwrapTextField(document.provider),
      unwrapTextField(document.documentDate),
      stringValue(document.totalCost.value)
    ].join("|"))
  ]);
}

function supabaseDocumentRepairKeys(row: GenericSupabaseRow): string[] {
  return uniqueRepairKeys([
    repairKey("local", stringValue(row.local_document_id || readMetadataValue(row, "localId"))),
    repairKey("source", stringValue(row.source_document_id || row.file_name || row.document_name || row.name)),
    repairKey("number", stringValue(row.document_number || row.number)),
    repairKey("semantic", [
      stringValue(row.document_number || row.number),
      stringValue(row.object_number),
      stringValue(row.supplier || row.provider || row.company_name),
      stringValue(row.document_date || row.date),
      stringValue(row.total_amount ?? row.gross_amount ?? row.amount)
    ].join("|"))
  ]);
}

function repairKey(kind: string, value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized ? `${kind}:${normalized}` : "";
}

function uniqueRepairKeys(keys: string[]): string[] {
  return Array.from(new Set(keys.filter(Boolean)));
}

function storedRepairDocumentCompletenessScore(document: ObjectAnalysis): number {
  return [
    unwrapTextField(document.documentNumber),
    unwrapTextField(document.documentType),
    unwrapTextField(document.provider),
    unwrapTextField(document.documentDate),
    unwrapTextField(document.objectNumber),
    document.totalCost.value !== null ? "1" : "",
    document.clusters.length ? "1" : "",
    document.measureDetails?.length ? "1" : ""
  ].filter(Boolean).length;
}

async function markDocumentAutoRepairStatus(
  supabase: SupabaseClient,
  documentId: string,
  row: GenericSupabaseRow,
  status: "not_repairable",
  reason: string
): Promise<void> {
  const metadata = {
    ...(isRecord(row.metadata) ? row.metadata : {}),
    autoRepair: {
      status,
      attemptedAt: new Date().toISOString(),
      reason
    }
  };
  try {
    const { error } = await supabase
      .from("documents")
      .update({ metadata })
      .eq("id", documentId);
    if (error) {
      console.warn("[Supabase AutoRepair] Nicht-reparierbar-Status konnte nicht gespeichert werden", { documentId, reason, error });
    }
  } catch (error) {
    console.warn("[Supabase AutoRepair] Nicht-reparierbar-Status konnte nicht gespeichert werden", { documentId, reason, error });
  }
}

async function ensureLookupId(
  supabase: SupabaseClient,
  table: string,
  rawName: string,
  idByName: Map<string, string>,
  insertNameColumns: string[]
): Promise<string | null> {
  const name = rawName.trim();
  if (!name) return null;
  const key = normalizeLookupKey(name);
  const existingId = idByName.get(key);
  if (existingId) return existingId;

  const insertRow = insertNameColumns.reduce<GenericSupabaseRow>((row, column) => {
    row[column] = name;
    return row;
  }, {});
  console.log(`[Supabase Dokumentimport] Lookup ${table} fehlt, Anlage wird versucht`, { name, insertRow });

  try {
    const created = await insertRowAdaptive(supabase, table, insertRow, [insertNameColumns[0]]);
    const id = stringValue(created.id);
    if (id) {
      idByName.set(key, id);
      console.log(`[Supabase Dokumentimport] Lookup ${table} angelegt`, { name, id, created });
      return id;
    }
    console.warn(`[Supabase Dokumentimport] Lookup ${table} Insert ohne ID`, { name, created });
    return null;
  } catch (error) {
    console.warn(`[Supabase Dokumentimport] Lookup ${table} konnte nicht angelegt werden`, {
      name,
      error: error instanceof Error ? error.message : error
    });
    return null;
  }
}

function summarizeDocumentForPersistence(document: ObjectAnalysis): GenericSupabaseRow {
  return {
    id: document.id,
    documentType: unwrapTextField(document.documentType),
    provider: unwrapTextField(document.provider),
    documentNumber: unwrapTextField(document.documentNumber),
    documentDate: unwrapTextField(document.documentDate),
    objectNumber: unwrapTextField(document.objectNumber),
    objectAddress: unwrapTextField(document.objectAddress),
    netCost: document.netCost.value,
    vatCost: document.vatCost.value,
    totalCost: document.totalCost.value,
    sourceDocumentIds: document.sourceDocumentIds,
    clusters: document.clusters.length,
    measureDetails: document.measureDetails?.length ?? 0
  };
}

function buildDocumentAnalysisPayload(document: ObjectAnalysis): GenericSupabaseRow {
  return {
    localDocumentId: document.id,
    aiAgentName: unwrapTextField(document.aiAgentName),
    confidenceScore: document.confidenceScore.value,
    projectSuggestion: unwrapTextField(document.projectSuggestion),
    assignmentSuggestion: unwrapTextField(document.assignmentSuggestion),
    documentType: unwrapTextField(document.documentType),
    installmentNumber: unwrapTextField(document.installmentNumber),
    projectType: unwrapTextField(document.projectType),
    supplier: unwrapTextField(document.provider),
    documentNumber: unwrapTextField(document.documentNumber),
    documentDate: unwrapTextField(document.documentDate),
    fund: unwrapTextField(document.fund),
    objectNumber: unwrapTextField(document.objectNumber),
    objectAddress: unwrapTextField(document.objectAddress),
    apartmentNumber: unwrapTextField(document.apartmentNumber),
    location: unwrapTextField(document.location),
    netAmount: document.netCost.value,
    vatAmount: document.vatCost.value,
    totalAmount: document.totalCost.value,
    measureDescription: unwrapTextField(document.measureDescription),
    dataQuality: unwrapTextField(document.dataQuality),
    missingInformation: document.missingInformation.value ?? [],
    sourceDocumentIds: document.sourceDocumentIds,
    fieldSources: {
      documentType: document.documentType.sources,
      provider: document.provider.sources,
      documentNumber: document.documentNumber.sources,
      documentDate: document.documentDate.sources,
      totalCost: document.totalCost.sources
    },
    measureDetails: document.measureDetails ?? [],
    clusters: document.clusters,
    costDebug: document.costDebug,
    measureDebug: document.measureDebug ?? null
  };
}

function firstDocumentSource(document: ObjectAnalysis): FieldSource {
  return (
    document.documentNumber.sources[0]
    ?? document.documentDate.sources[0]
    ?? document.totalCost.sources[0]
    ?? document.provider.sources[0]
    ?? document.objectNumber.sources[0]
    ?? {
      documentId: document.sourceDocumentIds[0] ?? document.id,
      fileName: document.sourceDocumentIds[0] ?? document.id,
      confidence: null
    }
  );
}

function objectRowToSupabase(object: StoredObjectRecord, options: { includeId?: boolean } = {}): SupabaseObjectRow {
  const row: SupabaseObjectRow & GenericSupabaseRow = {
    local_object_id: object.id,
    object_number: emptyToNull(object.objectNumber),
    address: emptyToNull(object.address),
    postal_code: emptyToNull(object.postalCode),
    city: emptyToNull(object.city),
    year_of_construction: emptyToNull(object.constructionYear),
    total_area: emptyToNull(object.totalLivingAreaSqm),
    renovated_area: emptyToNull(object.wohnflaecheSanierteWohnung),
    residential_units: emptyToNull(object.unitCount),
    latitude: emptyToNull(object.latitude),
    longitude: emptyToNull(object.longitude),
    metadata: {
      localId: object.id,
      fund: object.fund,
      objectName: object.objectName,
      federalState: object.federalState,
      assetManager: object.assetManager,
      portfolioManager: object.portfolioManager,
      createdAt: object.createdAt,
      updatedAt: object.updatedAt
    }
  };
  if (options.includeId) {
    row.id = isUuid(object.id) ? object.id : createBrowserUuid();
  }
  return row;
}

function objectRowFromSupabase(row: SupabaseObjectRow, fallback?: StoredObjectRecord): StoredObjectRecord {
  return {
    id: String(row.id ?? fallback?.id ?? `object-${Date.now()}`),
    fund: fallback?.fund ?? "",
    objectNumber: stringValue(row.object_number ?? fallback?.objectNumber),
    objectName: fallback?.objectName ?? "",
    address: stringValue(row.address ?? fallback?.address),
    postalCode: stringValue(row.postal_code ?? fallback?.postalCode),
    city: stringValue(row.city ?? fallback?.city),
    federalState: fallback?.federalState ?? "",
    constructionYear: stringValue(row.year_of_construction ?? fallback?.constructionYear),
    unitCount: stringValue(row.residential_units ?? fallback?.unitCount),
    totalLivingAreaSqm: stringValue(row.total_area ?? fallback?.totalLivingAreaSqm),
    wohnflaecheSanierteWohnung: stringValue(row.renovated_area ?? fallback?.wohnflaecheSanierteWohnung),
    assetManager: fallback?.assetManager ?? "",
    portfolioManager: fallback?.portfolioManager ?? "",
    latitude: stringValue(row.latitude ?? fallback?.latitude),
    longitude: stringValue(row.longitude ?? fallback?.longitude),
    createdAt: fallback?.createdAt,
    updatedAt: fallback?.updatedAt
  };
}

function entranceRowFromSupabase(row: GenericSupabaseRow): StoredEntranceRecord {
  const metadata = isRecord(row.metadata) ? row.metadata : {};
  const street = stringValue(row.street ?? row.street_name ?? metadata.street);
  const houseNumber = stringValue(row.house_number ?? row.number ?? metadata.houseNumber);
  const address = stringValue(row.address ?? row.name ?? row.label);
  return {
    id: stringValue(row.id ?? row.local_entrance_id ?? `entrance-${Date.now()}`),
    objectId: stringValue(row.object_id ?? row.local_object_id ?? metadata.objectId),
    street: street || address,
    houseNumber,
    suffix: stringValue(row.suffix ?? metadata.suffix),
    postalCode: stringValue(row.postal_code ?? row.zip ?? metadata.postalCode),
    city: stringValue(row.city ?? metadata.city),
    livingAreaSqm: stringValue(row.living_area_sqm ?? row.living_area ?? row.total_area ?? metadata.livingAreaSqm),
    unitCount: stringValue(row.unit_count ?? row.units ?? metadata.unitCount),
    createdAt: stringValue(row.created_at ?? metadata.createdAt),
    updatedAt: stringValue(row.updated_at ?? metadata.updatedAt)
  };
}

function entranceRowToSupabase(entrance: StoredEntranceRecord): GenericSupabaseRow {
  return {
    local_entrance_id: entrance.id,
    object_id: isUuid(entrance.objectId) ? entrance.objectId : null,
    local_object_id: entrance.objectId,
    street: emptyToNull(entrance.street),
    house_number: emptyToNull(entrance.houseNumber),
    suffix: emptyToNull(entrance.suffix),
    postal_code: emptyToNull(entrance.postalCode),
    city: emptyToNull(entrance.city),
    living_area_sqm: emptyToNull(entrance.livingAreaSqm),
    unit_count: emptyToNull(entrance.unitCount),
    metadata: {
      localId: entrance.id,
      objectId: entrance.objectId,
      street: entrance.street,
      houseNumber: entrance.houseNumber,
      suffix: entrance.suffix,
      postalCode: entrance.postalCode,
      city: entrance.city,
      livingAreaSqm: entrance.livingAreaSqm,
      unitCount: entrance.unitCount,
      createdAt: entrance.createdAt,
      updatedAt: entrance.updatedAt
    }
  };
}

function projectRowToSupabase(project: StoredProjectRecord, options: { includeId?: boolean } = {}): GenericSupabaseRow {
  const projectName = firstPresent(
    project.projectName,
    firstPresent(project.projectType, firstPresent(project.object, firstPresent(project.location, project.id)))
  );
  const row: GenericSupabaseRow = {
    local_project_id: project.id,
    project_name: emptyToNull(projectName),
    name: emptyToNull(projectName),
    project_type: emptyToNull(project.projectType),
    fund: emptyToNull(project.fund),
    object_id: isUuid(project.objectId) ? project.objectId : null,
    object_label: emptyToNull(project.object),
    entrance_id: emptyToNull(project.entranceId),
    entrance: emptyToNull(project.entrance),
    status: emptyToNull(project.status),
    budget_net: emptyToNull(project.budgetNet),
    budget_gross: emptyToNull(project.budgetGross),
    start_date: emptyToNull(toSupabaseDateString(project.startDate)),
    end_date: emptyToNull(toSupabaseDateString(project.endDate)),
    description: emptyToNull(project.description),
    apartment_number: emptyToNull(project.apartmentNumber),
    location: emptyToNull(project.location),
    renovated_apartment_count: emptyToNull(project.renovatedApartmentCount),
    living_area_sqm: emptyToNull(project.livingAreaSqm),
    metadata: {
      localId: project.id,
      objectId: project.objectId,
      object: project.object,
      entranceId: project.entranceId,
      entrance: project.entrance,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt
    }
  };
  if (options.includeId) row.id = project.id;
  return row;
}

function projectRowFromSupabase(row: GenericSupabaseRow, fallback?: StoredProjectRecord): StoredProjectRecord {
  const metadata = isRecord(row.metadata) ? row.metadata : {};
  const id = stringValue(row.id ?? row.local_project_id ?? fallback?.id ?? `project-${Date.now()}`);
  return {
    id,
    projectName: stringValue(row.project_name ?? row.name ?? row.title ?? fallback?.projectName),
    projectType: stringValue(row.project_type ?? metadata.projectType ?? fallback?.projectType),
    fund: stringValue(row.fund ?? metadata.fund ?? fallback?.fund),
    objectId: stringValue(row.object_id ?? metadata.objectId ?? fallback?.objectId),
    object: stringValue(row.object_label ?? metadata.object ?? fallback?.object),
    entranceId: stringValue(row.entrance_id ?? metadata.entranceId ?? fallback?.entranceId),
    entrance: stringValue(row.entrance ?? metadata.entrance ?? fallback?.entrance),
    status: stringValue(row.status ?? fallback?.status),
    budgetNet: stringValue(row.budget_net ?? fallback?.budgetNet),
    budgetGross: stringValue(row.budget_gross ?? fallback?.budgetGross),
    startDate: stringValue(row.start_date ?? fallback?.startDate),
    endDate: stringValue(row.end_date ?? fallback?.endDate),
    description: stringValue(row.description ?? fallback?.description),
    apartmentNumber: stringValue(row.apartment_number ?? fallback?.apartmentNumber),
    location: stringValue(row.location ?? fallback?.location),
    renovatedApartmentCount: stringValue(row.renovated_apartment_count ?? fallback?.renovatedApartmentCount),
    livingAreaSqm: stringValue(row.living_area_sqm ?? fallback?.livingAreaSqm),
    createdAt: stringValue(row.created_at ?? metadata.createdAt ?? fallback?.createdAt),
    updatedAt: stringValue(row.updated_at ?? metadata.updatedAt ?? fallback?.updatedAt)
  };
}

function assignmentRowToSupabase(
  documentId: string,
  projectId: string | null,
  resolvedDocumentId: string | null = null,
  resolvedProjectId: string | null = null
): GenericSupabaseRow {
  const localAssignmentId = `${documentId}:${projectId ?? "unassigned"}`;
  const payload = {
    localAssignmentId,
    localDocumentId: documentId,
    localProjectId: projectId,
    resolvedDocumentId,
    resolvedProjectId
  };
  return {
    id: createBrowserUuid(),
    document_id: resolvedDocumentId || (isUuid(documentId) ? documentId : null),
    project_id: resolvedProjectId || (projectId && isUuid(projectId) ? projectId : null),
    local_assignment_id: localAssignmentId,
    local_document_id: documentId,
    local_project_id: projectId,
    data: payload,
    metadata: payload
  };
}

function assignmentRowFromSupabase(row: GenericSupabaseRow): { documentId: string; projectId: string | null } {
  const metadata = isRecord(row.metadata) ? row.metadata : {};
  return {
    documentId: stringValue(row.local_document_id ?? metadata.localDocumentId ?? row.document_id),
    projectId: stringValue(row.local_project_id ?? metadata.localProjectId ?? row.project_id) || null
  };
}

async function resolveSupabaseObjectIdForProject(supabase: SupabaseClient, project: StoredProjectRecord): Promise<string | null> {
  if (isUuid(project.objectId)) return project.objectId;
  const byLocalId = project.objectId
    ? await resolveSupabaseIdByLocalId(supabase, "objects", project.objectId, "local_object_id")
    : null;
  if (byLocalId) return byLocalId;
  const { data, error } = await supabase.from("objects").select("*");
  if (error) {
    console.warn("[Supabase Backfill] Objekte konnten fuer Projekt-Mapping nicht geladen werden", { project, error });
    return null;
  }
  return resolveSupabaseObjectIdFromRows(projectObjectLookupText(project), data as GenericSupabaseRow[] | null);
}

async function resolveSupabaseObjectIdForEntrance(supabase: SupabaseClient, entrance: StoredEntranceRecord): Promise<string | null> {
  if (isUuid(entrance.objectId)) return entrance.objectId;
  const byLocalId = entrance.objectId
    ? await resolveSupabaseIdByLocalId(supabase, "objects", entrance.objectId, "local_object_id")
    : null;
  if (byLocalId) return byLocalId;
  const { data, error } = await supabase.from("objects").select("*");
  if (error) {
    console.warn("[Supabase Backfill] Objekte konnten fuer Entrance-Mapping nicht geladen werden", { entrance, error });
    return null;
  }
  return resolveSupabaseObjectIdFromRows(entranceObjectLookupText(entrance), data as GenericSupabaseRow[] | null);
}

function resolveSupabaseObjectIdFromRows(lookupText: string, rows: GenericSupabaseRow[] | null): string | null {
  const normalizedLookup = normalizeAddressText(lookupText);
  const normalizedNumber = normalizeObjectNumber(lookupText);
  for (const row of rows ?? []) {
    const id = stringValue(row.id);
    if (!id) continue;
    const rowNumber = normalizeObjectNumber(stringValue(row.object_number));
    const rowAddress = normalizeAddressText([row.address, row.postal_code, row.city].map(stringValue).join(" "));
    const localId = normalizeLookupKey(stringValue(row.local_object_id ?? readMetadataValue(row, "localId")));
    if (normalizedNumber && rowNumber && normalizedNumber === rowNumber) return id;
    if (normalizedLookup && rowAddress && (normalizedLookup.includes(rowAddress) || rowAddress.includes(normalizedLookup))) return id;
    if (localId && normalizedLookup.includes(localId)) return id;
  }
  return null;
}

function projectObjectLookupText(project: StoredProjectRecord): string {
  return [
    project.objectId,
    project.object,
    project.projectName,
    project.fund,
    project.location,
    project.description
  ].filter(Boolean).join(" ");
}

function entranceObjectLookupText(entrance: StoredEntranceRecord): string {
  return [
    entrance.objectId,
    entrance.street,
    entrance.houseNumber,
    entrance.postalCode,
    entrance.city
  ].filter(Boolean).join(" ");
}

async function countSupabaseRows(supabase: SupabaseClient, table: string): Promise<number> {
  const { count, error, data } = await supabase
    .from(table)
    .select("*", { count: "exact", head: false })
    .limit(1);
  if (error) {
    console.warn("[Supabase Backfill] Tabellenzaehlung fehlgeschlagen", { table, error });
    return 0;
  }
  return count ?? data?.length ?? 0;
}

async function loadSupabaseTableDiagnostics(
  supabase: SupabaseClient,
  tables: string[]
): Promise<SupabaseTableLoadDiagnostic[]> {
  const diagnostics = await Promise.all(tables.map(async (table) => {
    const query = `from("${table}").select("*", { count: "exact" }).limit(5)`;
    const filters: Record<string, unknown> = {};
    const { data, error, count } = await supabase
      .from(table)
      .select("*", { count: "exact" })
      .limit(5);
    const diagnostic: SupabaseTableLoadDiagnostic = {
      table,
      query,
      filters,
      loaded: !error,
      count: error ? 0 : count ?? data?.length ?? 0,
      sample: data ?? [],
      error: error ? formatSupabaseError(error) : null,
      rlsError: isSupabaseRlsError(error)
    };
    console.log("[Supabase Diagnose] Tabelle geladen", diagnostic);
    return diagnostic;
  }));
  return diagnostics;
}

function unwrapSupabaseLoadResult<T>(
  result: PromiseSettledResult<T>,
  label: string,
  fallback: T
): T {
  if (result.status === "fulfilled") return result.value;
  console.error(`[Supabase Online] ${label} konnte nicht geladen werden`, result.reason);
  return fallback;
}

function emptySupabaseDocumentLoadResult(autoRepairEnabled: boolean): SupabaseDocumentLoadResult {
  return {
    documents: [],
    supabaseDocumentCount: 0,
    supabaseCostItemCount: 0,
    appDocumentCount: 0,
    measureDetailsCount: 0,
    clustersCount: 0,
    autoRepair: emptyDocumentAutoRepairSummary(0, autoRepairEnabled)
  };
}

function isSupabaseRlsError(error: { message?: string; code?: string | null; details?: string | null } | null): boolean {
  if (!error) return false;
  const text = [error.message, error.details, error.code].filter(Boolean).join(" ").toLowerCase();
  return error.code === "42501" || /row-level security|rls|permission denied|policy/.test(text);
}

function profileFromSupabase(row: GenericSupabaseRow, fallbackEmail = ""): UserProfile {
  return {
    id: stringValue(row.id),
    email: stringValue(row.email ?? fallbackEmail),
    fullName: stringValue(row.full_name ?? row.fullName ?? ""),
    role: normalizeUserRole(row.role),
    status: normalizeUserStatus(row.status),
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at),
    lastLoginAt: stringValue(row.last_login_at)
  };
}

function activityLogFromSupabase(row: GenericSupabaseRow): ActivityLogEntry {
  return {
    id: stringValue(row.id),
    userId: stringValue(row.user_id) || null,
    userEmail: stringValue(row.user_email),
    action: stringValue(row.action),
    area: stringValue(row.area),
    targetType: stringValue(row.target_type),
    targetId: stringValue(row.target_id) || null,
    targetLabel: stringValue(row.target_label),
    details: isRecord(row.details) ? row.details : {},
    createdAt: stringValue(row.created_at)
  };
}

function normalizeUserRole(value: unknown): UserRole {
  return value === "owner" || value === "admin" || value === "editor" || value === "viewer" ? value : "viewer";
}

function normalizeUserStatus(value: unknown): UserStatus {
  return value === "active" || value === "blocked" || value === "pending" ? value : "pending";
}

function backfillObjectRecord(existing: StoredObjectRecord, incoming: StoredObjectRecord): StoredObjectRecord {
  return {
    ...existing,
    objectNumber: firstPresent(existing.objectNumber, incoming.objectNumber),
    address: firstPresent(existing.address, incoming.address),
    postalCode: firstPresent(existing.postalCode, incoming.postalCode),
    city: firstPresent(existing.city, incoming.city),
    constructionYear: firstPresent(existing.constructionYear, incoming.constructionYear),
    totalLivingAreaSqm: firstPresent(existing.totalLivingAreaSqm, incoming.totalLivingAreaSqm),
    wohnflaecheSanierteWohnung: firstPresent(existing.wohnflaecheSanierteWohnung, incoming.wohnflaecheSanierteWohnung),
    unitCount: firstPresent(existing.unitCount, incoming.unitCount),
    latitude: firstPresent(existing.latitude, incoming.latitude),
    longitude: firstPresent(existing.longitude, incoming.longitude),
    fund: firstPresent(existing.fund, incoming.fund),
    objectName: firstPresent(existing.objectName, incoming.objectName),
    federalState: firstPresent(existing.federalState, incoming.federalState),
    assetManager: firstPresent(existing.assetManager, incoming.assetManager),
    portfolioManager: firstPresent(existing.portfolioManager, incoming.portfolioManager),
    createdAt: existing.createdAt || incoming.createdAt,
    updatedAt: incoming.updatedAt || existing.updatedAt
  };
}

function objectImportKeys(object: StoredObjectRecord): string[] {
  return [
    normalizeObjectNumber(object.objectNumber) ? `number:${normalizeObjectNumber(object.objectNumber)}` : "",
    normalizeAddressText([object.address, object.postalCode, object.city].filter(Boolean).join(" ")) || object.address.trim()
      ? `address:${normalizeAddressText([object.address, object.postalCode, object.city].filter(Boolean).join(" ")) || object.address.trim().toLowerCase()}`
      : ""
  ].filter(Boolean);
}

function firstPresent(primary?: string, fallback?: string): string {
  const primaryValue = primary?.trim() ?? "";
  if (primaryValue) return primaryValue;
  return fallback?.trim() ?? "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function insertRowAdaptive(
  supabase: SupabaseClient,
  table: string,
  originalRow: GenericSupabaseRow,
  requiredColumns: string[]
): Promise<GenericSupabaseRow> {
  let row = { ...originalRow };
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const { data, error } = await supabase
      .from(table)
      .insert(row)
      .select("*")
      .single();

    if (!error) return data as GenericSupabaseRow;

    const missingColumn = extractMissingColumn(error.message ?? "");
    if (missingColumn && isImportIdentityColumn(missingColumn)) {
      throw new Error(formatMissingImportColumnError(table, missingColumn, error));
    }

    if (missingColumn && !requiredColumns.includes(missingColumn) && missingColumn in row) {
      console.warn(`[Supabase Import] Optionale Spalte ${table}.${missingColumn} existiert nicht und wird ausgelassen.`, { row, error });
      const { [missingColumn]: _removed, ...nextRow } = row;
      row = nextRow;
      continue;
    }

    console.error(`[Supabase Import] Insert public.${table} fehlgeschlagen`, { row, error });
    throw new Error(`Supabase-${table}-Datensatz konnte nicht gespeichert werden: ${formatSupabaseError(error)}`);
  }

  throw new Error(`Supabase-${table}-Datensatz konnte nicht gespeichert werden: zu viele Schema-Anpassungen.`);
}

async function updateRowAdaptive(
  supabase: SupabaseClient,
  table: string,
  id: string,
  originalRow: GenericSupabaseRow,
  requiredColumns: string[]
): Promise<GenericSupabaseRow> {
  let row = { ...originalRow };
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const { data, error } = await supabase
      .from(table)
      .update(row)
      .eq("id", id)
      .select("*")
      .single();

    if (!error) return data as GenericSupabaseRow;

    const missingColumn = extractMissingColumn(error.message ?? "");
    if (missingColumn && isImportIdentityColumn(missingColumn)) {
      throw new Error(formatMissingImportColumnError(table, missingColumn, error));
    }

    if (missingColumn && !requiredColumns.includes(missingColumn) && missingColumn in row) {
      console.warn(`[Supabase Import] Optionale Spalte ${table}.${missingColumn} existiert nicht und wird beim Update ausgelassen.`, { row, error });
      const { [missingColumn]: _removed, ...nextRow } = row;
      row = nextRow;
      continue;
    }

    throw new Error(`Supabase-${table}-Datensatz konnte nicht aktualisiert werden: ${formatSupabaseError(error)}`);
  }

  throw new Error(`Supabase-${table}-Datensatz konnte nicht aktualisiert werden: zu viele Schema-Anpassungen.`);
}

async function updateObjectRowAdaptive(
  supabase: SupabaseClient,
  objectId: string,
  originalRow: GenericSupabaseRow
): Promise<GenericSupabaseRow> {
  let row = { ...originalRow };
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const { data, error } = await supabase
      .from("objects")
      .update(row)
      .eq("id", objectId)
      .select("*")
      .single();

    if (!error) return data as GenericSupabaseRow;

    const missingColumn = extractMissingColumn(error.message ?? "");
    if (missingColumn && isImportIdentityColumn(missingColumn)) {
      throw new Error(formatMissingImportColumnError("objects", missingColumn, error));
    }
    if (missingColumn && missingColumn in row) {
      console.warn(`[Supabase Import] Optionale Spalte objects.${missingColumn} existiert nicht und wird beim Update ausgelassen.`, { row, error });
      const { [missingColumn]: _removed, ...nextRow } = row;
      row = nextRow;
      continue;
    }

    throw new Error(`Supabase-Objekt konnte nicht aktualisiert werden: ${formatSupabaseError(error)}`);
  }

  throw new Error("Supabase-Objekt konnte nicht aktualisiert werden: zu viele Schema-Anpassungen.");
}

async function resolveSupabaseIdByLocalId(
  supabase: SupabaseClient,
  table: string,
  value: string,
  localColumn: string
): Promise<string | null> {
  if (!value) return null;
  const { data, error } = await supabase
    .from(table)
    .select("id")
    .eq(localColumn, value)
    .limit(1);
  if (error) {
    const missingColumn = extractMissingColumn(error.message ?? "");
    if (missingColumn && isImportIdentityColumn(missingColumn)) {
      console.error(`[Supabase] ${table}.${localColumn} fehlt fuer Import-Zuordnung.`, { value, error });
      throw new Error(formatMissingImportColumnError(table, missingColumn, error));
    }
    console.warn(`[Supabase] ${table}.${localColumn} konnte nicht fuer Zuordnung aufgeloest werden.`, { value, error });
    return null;
  }
  return stringValue((data as GenericSupabaseRow[] | null)?.[0]?.id) || (isUuid(value) ? value : null);
}

async function insertDocumentRowAdaptive(supabase: SupabaseClient, originalRow: GenericSupabaseRow): Promise<GenericSupabaseRow> {
  console.log("[Supabase Dokumentimport] INSERT public.documents Datensatz", originalRow);
  let row = { ...originalRow };
  for (let attempt = 0; attempt < 24; attempt += 1) {
    console.log("[Supabase Dokumentimport] INSERT public.documents Versuch", {
      attempt: attempt + 1,
      fields: Object.keys(row),
      row,
      json: JSON.stringify(row, null, 2)
    });
    const { data, error } = await supabase
      .from("documents")
      .insert(row)
      .select("*")
      .single();

    if (!error) {
      console.log("[Supabase Dokumentimport] INSERT public.documents erfolgreich", {
        document_id: data?.id ?? "k.A.",
        fieldsSent: Object.keys(row),
        sentRow: row,
        supabaseResponse: data,
        supabaseResponseJson: JSON.stringify(data, null, 2)
      });
      return data as GenericSupabaseRow;
    }

    console.error("[Supabase Dokumentimport] INSERT public.documents fehlgeschlagen", {
      code: error.code ?? null,
      message: error.message ?? null,
      details: error.details ?? null,
      hint: error.hint ?? null,
      row,
      error
    });

    const missingColumn = extractMissingColumn(error.message ?? "");
    if (missingColumn && isImportIdentityColumn(missingColumn)) {
      throw new Error(formatMissingImportColumnError("documents", missingColumn, error));
    }
    if (missingColumn && missingColumn !== "object_id" && missingColumn in row) {
      console.warn(`[Supabase Dokumentimport] Optionale Spalte documents.${missingColumn} existiert nicht und wird ausgelassen.`, { row, error });
      const { [missingColumn]: _removed, ...nextRow } = row;
      row = nextRow;
      continue;
    }

    throw new Error(`Supabase-documents-Datensatz konnte nicht gespeichert werden: ${formatSupabaseError(error)}`);
  }

  throw new Error("Supabase-documents-Datensatz konnte nicht gespeichert werden: zu viele Schema-Anpassungen.");
}

async function updateDocumentRowAdaptive(
  supabase: SupabaseClient,
  documentId: string,
  originalRow: GenericSupabaseRow
): Promise<GenericSupabaseRow> {
  console.log("[Supabase Dokumentimport] UPSERT public.documents Datensatz", {
    documentId,
    row: originalRow,
    json: JSON.stringify(originalRow, null, 2)
  });
  let row = { ...originalRow };
  for (let attempt = 0; attempt < 24; attempt += 1) {
    console.log("[Supabase Dokumentimport] UPDATE public.documents Versuch", {
      attempt: attempt + 1,
      documentId,
      fields: Object.keys(row),
      row,
      json: JSON.stringify(row, null, 2)
    });
    const { data, error } = await supabase
      .from("documents")
      .update(row)
      .eq("id", documentId)
      .select("*")
      .single();

    if (!error) {
      console.log("[Supabase Dokumentimport] UPDATE public.documents erfolgreich", {
        document_id: data?.id ?? documentId,
        fieldsSent: Object.keys(row),
        sentRow: row,
        supabaseResponse: data,
        supabaseResponseJson: JSON.stringify(data, null, 2)
      });
      return data as GenericSupabaseRow;
    }

    console.error("[Supabase Dokumentimport] UPDATE public.documents fehlgeschlagen", {
      code: error.code ?? null,
      message: error.message ?? null,
      details: error.details ?? null,
      hint: error.hint ?? null,
      documentId,
      row,
      error
    });

    const missingColumn = extractMissingColumn(error.message ?? "");
    if (missingColumn && isImportIdentityColumn(missingColumn)) {
      throw new Error(formatMissingImportColumnError("documents", missingColumn, error));
    }
    if (missingColumn && missingColumn !== "object_id" && missingColumn in row) {
      console.warn(`[Supabase Dokumentimport] Optionale Spalte documents.${missingColumn} existiert nicht und wird beim UPDATE ausgelassen.`, { row, error });
      const { [missingColumn]: _removed, ...nextRow } = row;
      row = nextRow;
      continue;
    }

    throw new Error(`Supabase-documents-Datensatz konnte nicht aktualisiert werden: ${formatSupabaseError(error)}`);
  }

  throw new Error("Supabase-documents-Datensatz konnte nicht aktualisiert werden: zu viele Schema-Anpassungen.");
}

function extractMissingColumn(message: string): string | null {
  return message.match(/'([^']+)'\s+column/i)?.[1] ?? message.match(/column\s+"([^"]+)"/i)?.[1] ?? null;
}

function isImportIdentityColumn(column: string): boolean {
  return column.startsWith("local_") || column.startsWith("source_");
}

function formatMissingImportColumnError(
  table: string,
  column: string,
  error: { code?: string | null; message?: string; details?: string | null; hint?: string | null }
): string {
  return [
    `Supabase Import abgebrochen: public.${table}.${column} fehlt im Schema Cache.`,
    `Bitte zuerst supabase/fix-import-local-id-columns.sql im Supabase SQL Editor ausfuehren.`,
    "Danach App neu laden; falls der Fehler bleibt, Supabase/PostgREST Schema Cache bzw. Vercel Deployment neu laden.",
    `Supabase Fehler: ${formatSupabaseError(error)}`
  ].join(" ");
}

function documentDuplicateKey(row: GenericSupabaseRow): string {
  const objectId = stringValue(row.object_id);
  const documentNumber = stringValue(row.document_number);
  const sourceIdentifier = stringValue(row.local_document_id || row.source_document_id || row.file_name || row.document_name || row.name);
  const identifier = documentNumber || sourceIdentifier;
  if (!objectId || !identifier) return "";
  return normalizeGenericKey([objectId, identifier]);
}

function costItemDuplicateKey(row: GenericSupabaseRow): string {
  const key = normalizeGenericKey([
    stringValue(row.object_id),
    stringValue(row.document_id),
    stringValue(row.local_cost_item_id) || stringValue(row.description),
    stringValue(row.amount ?? row.gross_amount),
    stringValue(row.trade_id ?? row.trade_name)
  ]);
  return key;
}

function normalizeGenericKey(parts: string[]): string {
  return parts.map((part) => part.trim().toLowerCase()).filter(Boolean).join("|");
}

function buildLookupIdByName(rows: GenericSupabaseRow[] | null, nameFields: string[]): Map<string, string> {
  const result = new Map<string, string>();
  (rows ?? []).forEach((row) => {
    const id = stringValue(row.id);
    if (!id) return;
    nameFields.forEach((field) => {
      const key = normalizeLookupKey(stringValue(row[field]));
      if (key) result.set(key, id);
    });
  });
  return result;
}

function normalizeLookupKey(value: string): string {
  return normalizeTradeLookup(value);
}

function normalizeTradeLookup(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/ÃƒÂ¤|Ã¤/g, "ae")
    .replace(/ÃƒÂ¶|Ã¶/g, "oe")
    .replace(/ÃƒÂ¼|Ã¼/g, "ue")
    .replace(/ÃƒÅ¸|ÃŸ/g, "ss")
    .replace(/Ãƒâ€ž|Ã„/g, "ae")
    .replace(/Ãƒâ€“|Ã–/g, "oe")
    .replace(/ÃƒÅ“|Ãœ/g, "ue")
    .replace(/[^a-z0-9]/g, "");
}

function unwrapTextField(field: { value: unknown } | null | undefined): string {
  if (!field || field.value === null || field.value === undefined) return "";
  if (Array.isArray(field.value)) return field.value.join(", ");
  return String(field.value);
}

function emptyToNull(value: string | undefined): string | null {
  const next = value?.trim() ?? "";
  return next ? next : null;
}

function toSupabaseDateString(value: string | undefined): string {
  const raw = value?.trim() ?? "";
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const german = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (german) {
    const day = german[1].padStart(2, "0");
    const month = german[2].padStart(2, "0");
    return `${german[3]}-${month}-${day}`;
  }
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const day = slash[1].padStart(2, "0");
    const month = slash[2].padStart(2, "0");
    return `${slash[3]}-${month}-${day}`;
  }
  return raw;
}

function stringValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function normalizeObjectNumber(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function isHttpUrl(value: string | undefined): boolean {
  return Boolean(value && /^https?:\/\//i.test(value));
}

function formatMissingSupabaseEnvironment(): string {
  const runtime = runtimeSupabaseStatus;
  return `Supabase-Konfiguration fehlt (Runtime Config geladen: ${runtime?.loaded ? "Ja" : "Nein"}, Runtime hasUrl: ${runtime?.hasUrl ? "Ja" : "Nein"}, Runtime hasAnonKey: ${runtime?.hasAnonKey ? "Ja" : "Nein"}, HTTP Status: ${runtime?.httpStatus ?? "k.A."}, Laufzeit: ${runtime?.runtime ?? "k.A."}).`;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function createBrowserUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (character) =>
    (Number(character) ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> Number(character) / 4).toString(16)
  );
}

function formatSupabaseError(error: { message?: string; details?: string | null; hint?: string | null; code?: string | null }): string {
  return [
    error.message,
    error.code ? `Code: ${error.code}` : "",
    error.details ? `Details: ${error.details}` : "",
    error.hint ? `Hint: ${error.hint}` : ""
  ].filter(Boolean).join(" | ");
}
