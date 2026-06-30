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
  construction_year?: string | number | null;
  total_living_area_sqm?: string | number | null;
  renovated_living_area_sqm?: string | number | null;
  unit_count?: string | number | null;
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
    throw new Error(`Supabase-Objekte konnten nicht geladen werden: ${error.message}`);
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
    .insert(objectRowToSupabase(object))
    .select("*")
    .single();

  if (error) {
    throw new Error(`Supabase-Objekt konnte nicht gespeichert werden: ${error.message}`);
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

  const { data, error } = await supabase
    .from("objects")
    .update(objectRowToSupabase(object))
    .eq("id", object.id)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Supabase-Objekt konnte nicht aktualisiert werden: ${error.message}`);
  }

  return objectRowFromSupabase(data as SupabaseObjectRow, object);
}

export async function deleteSupabaseObject(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase-Objekt konnte nicht gelöscht werden: Environment Variables fehlen.");
  }

  const { error } = await supabase
    .from("objects")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(`Supabase-Objekt konnte nicht gelöscht werden: ${error.message}`);
  }
}

function objectRowToSupabase(object: StoredObjectRecord): SupabaseObjectRow {
  return {
    object_number: emptyToNull(object.objectNumber),
    address: emptyToNull(object.address),
    postal_code: emptyToNull(object.postalCode),
    city: emptyToNull(object.city),
    construction_year: emptyToNull(object.constructionYear),
    total_living_area_sqm: emptyToNull(object.totalLivingAreaSqm),
    renovated_living_area_sqm: emptyToNull(object.wohnflaecheSanierteWohnung),
    unit_count: emptyToNull(object.unitCount),
    latitude: emptyToNull(object.latitude),
    longitude: emptyToNull(object.longitude)
  };
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
    constructionYear: stringValue(row.construction_year ?? fallback?.constructionYear),
    unitCount: stringValue(row.unit_count ?? fallback?.unitCount),
    totalLivingAreaSqm: stringValue(row.total_living_area_sqm ?? fallback?.totalLivingAreaSqm),
    wohnflaecheSanierteWohnung: stringValue(row.renovated_living_area_sqm ?? fallback?.wohnflaecheSanierteWohnung),
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
