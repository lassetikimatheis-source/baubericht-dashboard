import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { StoredObjectRecord } from "./storage";

let browserSupabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("[Supabase] NEXT_PUBLIC_SUPABASE_URL oder NEXT_PUBLIC_SUPABASE_ANON_KEY fehlt.");
    return null;
  }

  if (!browserSupabaseClient) {
    browserSupabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  }

  return browserSupabaseClient;
}

export async function runSupabaseConnectionTest(): Promise<void> {
  console.log("[Supabase] Test wird ausgeführt");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  console.log("[Supabase] Verbindungstest gestartet", {
    hasUrl: Boolean(supabaseUrl),
    hasAnonKey: Boolean(supabaseAnonKey),
    urlHost: supabaseUrl ? new URL(supabaseUrl).host : null
  });

  const supabase = getSupabaseClient();
  if (!supabase) {
    console.error("[Supabase] Verbindungstest abgebrochen: Environment Variables fehlen.", {
      NEXT_PUBLIC_SUPABASE_URL: Boolean(supabaseUrl),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(supabaseAnonKey)
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
  const supabase = getSupabaseClient();
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
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase-Objekt konnte nicht gespeichert werden: Environment Variables fehlen.");
  }

  const { data, error } = await supabase
    .from("objects")
    .insert(objectRowToSupabase(object, { includeId: true }))
    .select("*")
    .single();

  if (error) {
    throw new Error(`Supabase-Objekt konnte nicht gespeichert werden: ${formatSupabaseError(error)}`);
  }

  return objectRowFromSupabase(data as SupabaseObjectRow, object);
}

export async function importMissingObjectsToSupabase(objects: StoredObjectRecord[]): Promise<SupabaseObjectImportSummary> {
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
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase-Objekt konnte nicht aktualisiert werden: Environment Variables fehlen.");
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
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase-Objekt konnte nicht gelöscht werden: Environment Variables fehlen.");
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
