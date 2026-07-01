import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { StoredObjectRecord } from "./storage";

let browserSupabaseClient: SupabaseClient | null = null;
let runtimeSupabaseConfig: { supabaseUrl: string; supabaseAnonKey: string } | null = null;
let runtimeSupabaseStatus: SupabaseRuntimeConfigStatus | null = null;

const SUPABASE_URL_ENV_NAME = "NEXT_PUBLIC_SUPABASE_URL";
const SUPABASE_ANON_KEY_ENV_NAME = "NEXT_PUBLIC_SUPABASE_ANON_KEY";

export interface SupabaseEnvironmentStatus {
  urlVariableName: typeof SUPABASE_URL_ENV_NAME;
  anonKeyVariableName: typeof SUPABASE_ANON_KEY_ENV_NAME;
  hasUrl: boolean;
  hasAnonKey: boolean;
  runtime: "client" | "server";
  urlHost: string | null;
}

export interface SupabaseRuntimeConfigStatus {
  loaded: boolean;
  hasUrl: boolean;
  hasAnonKey: boolean;
  hasNextPublicAnonKey: boolean;
  hasServerAnonKey: boolean;
  runtime: string;
}

export function getSupabaseEnvironmentStatus(): SupabaseEnvironmentStatus {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return {
    urlVariableName: SUPABASE_URL_ENV_NAME,
    anonKeyVariableName: SUPABASE_ANON_KEY_ENV_NAME,
    hasUrl: Boolean(supabaseUrl),
    hasAnonKey: Boolean(supabaseAnonKey),
    runtime: typeof window === "undefined" ? "server" : "client",
    urlHost: safeUrlHost(supabaseUrl)
  };
}

export function getSupabaseClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const environment = getSupabaseEnvironmentStatus();

  if (!supabaseUrl || !supabaseAnonKey || !isHttpUrl(supabaseUrl)) {
    console.warn("[Supabase] Environment Variables fehlen.", environment);
    return null;
  }

  if (!browserSupabaseClient) {
    browserSupabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  }

  return browserSupabaseClient;
}

async function getSupabaseClientAsync(): Promise<SupabaseClient | null> {
  const directClient = getSupabaseClient();
  if (directClient) return directClient;
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
    runtime: "server"
  };
}

export async function getRuntimeSupabaseConfig(options: { forceRefresh?: boolean } = {}): Promise<{ supabaseUrl: string; supabaseAnonKey: string } | null> {
  if (runtimeSupabaseConfig && !options.forceRefresh) {
    runtimeSupabaseStatus = {
      ...(runtimeSupabaseStatus ?? {
        hasNextPublicAnonKey: false,
        hasServerAnonKey: false,
        runtime: "server"
      }),
      loaded: true,
      hasUrl: true,
      hasAnonKey: true
    };
    return runtimeSupabaseConfig;
  }
  if (typeof window === "undefined") return null;
  try {
    const response = await fetch("/api/supabase-config", { cache: "no-store" });
    if (!response.ok) {
      console.error("[Supabase] Runtime-Konfiguration konnte nicht geladen werden.", { status: response.status });
      return null;
    }
    const data = await response.json() as {
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
      runtime: data.runtime ?? "server"
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
    if (!data.supabaseUrl || !data.supabaseAnonKey || !isHttpUrl(data.supabaseUrl)) return null;
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
      runtime: "server"
    };
    return null;
  }
}

export async function runSupabaseConnectionTest(): Promise<void> {
  console.log("[Supabase] Test wird ausgeführt");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const environment = getSupabaseEnvironmentStatus();

  console.log("[Supabase] Verbindungstest gestartet", {
    [environment.urlVariableName]: environment.hasUrl ? "vorhanden" : "fehlt",
    [environment.anonKeyVariableName]: environment.hasAnonKey ? "vorhanden" : "fehlt",
    runtime: environment.runtime,
    urlHost: environment.urlHost
  });

  const supabase = await getSupabaseClientAsync();
  if (!supabase) {
    console.error("[Supabase] Verbindungstest abgebrochen: Environment Variables fehlen.", {
      NEXT_PUBLIC_SUPABASE_URL: Boolean(supabaseUrl),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(supabaseAnonKey),
      environment
    });
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

  const { data, error } = await supabase
    .from("objects")
    .insert(insertRow)
    .select("*")
    .single();

  if (error) {
    console.error("[Supabase] Insert public.objects fehlgeschlagen", { row: insertRow, error });
    throw new Error(`Supabase-Objekt konnte nicht gespeichert werden: ${formatSupabaseError(error)}`);
  }
  if (!data) {
    console.error("[Supabase] Insert public.objects ohne Rueckgabedaten", { row: insertRow });
    throw new Error("Supabase-Objekt konnte nicht gespeichert werden: Insert lieferte keinen Datensatz zurueck.");
  }

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
  const existingObjectNumbers = new Set(existingObjects.map((object) => normalizeObjectNumber(object.objectNumber)).filter(Boolean));
  const processedObjectNumbers = new Set<string>();
  const summary: SupabaseObjectImportSummary = {
    imported: 0,
    skipped: 0,
    errors: []
  };

  for (const object of objects) {
    const objectNumber = normalizeObjectNumber(object.objectNumber);
    if (!objectNumber) {
      summary.skipped += 1;
      summary.errors.push(`${object.address || object.id}: keine Objektnummer vorhanden.`);
      continue;
    }

    if (existingObjectNumbers.has(objectNumber) || processedObjectNumbers.has(objectNumber)) {
      summary.skipped += 1;
      continue;
    }

    try {
      await createSupabaseObject(object);
      existingObjectNumbers.add(objectNumber);
      processedObjectNumbers.add(objectNumber);
      summary.imported += 1;
    } catch (error) {
      summary.errors.push(`${object.objectNumber}: ${error instanceof Error ? error.message : "Import fehlgeschlagen."}`);
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

  const { data, error } = await supabase
    .from("objects")
    .update(objectRowToSupabase(object))
    .eq("id", object.id)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Supabase-Objekt konnte nicht aktualisiert werden: ${formatSupabaseError(error)}`);
  }

  return objectRowFromSupabase(data as SupabaseObjectRow, object);
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

function objectRowToSupabase(object: StoredObjectRecord, options: { includeId?: boolean } = {}): SupabaseObjectRow {
  const row: SupabaseObjectRow = {
    object_number: emptyToNull(object.objectNumber),
    address: emptyToNull(object.address),
    postal_code: emptyToNull(object.postalCode),
    city: emptyToNull(object.city),
    year_of_construction: emptyToNull(object.constructionYear),
    total_area: emptyToNull(object.totalLivingAreaSqm),
    renovated_area: emptyToNull(object.wohnflaecheSanierteWohnung),
    residential_units: emptyToNull(object.unitCount),
    latitude: emptyToNull(object.latitude),
    longitude: emptyToNull(object.longitude)
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

function emptyToNull(value: string | undefined): string | null {
  const next = value?.trim() ?? "";
  return next ? next : null;
}

function stringValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function normalizeObjectNumber(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function safeUrlHost(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

function isHttpUrl(value: string | undefined): boolean {
  return Boolean(value && /^https?:\/\//i.test(value));
}

function formatMissingSupabaseEnvironment(): string {
  const environment = getSupabaseEnvironmentStatus();
  const runtime = runtimeSupabaseStatus;
  return `Supabase-Konfiguration fehlt (Client ${environment.urlVariableName}: ${environment.hasUrl ? "vorhanden" : "fehlt"}, Client ${environment.anonKeyVariableName}: ${environment.hasAnonKey ? "vorhanden" : "fehlt"}, Runtime Config geladen: ${runtime?.loaded ? "Ja" : "Nein"}, Runtime hasAnonKey: ${runtime?.hasAnonKey ? "Ja" : "Nein"}, Laufzeit: ${environment.runtime}).`;
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
