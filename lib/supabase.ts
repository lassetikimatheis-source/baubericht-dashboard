import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { emptyField } from "./analysis-state";
import type { StoredObjectRecord } from "./storage";
import type { CostAllocation, MeasureCluster, MeasureDetail, ObjectAnalysis } from "../types/analysis";

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
  httpStatus: number | null;
  responseText: string;
  error: string | null;
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
  const existingByObjectNumber = new Map<string, StoredObjectRecord>();
  existingObjects.forEach((object) => {
    const objectNumber = normalizeObjectNumber(object.objectNumber);
    if (objectNumber) existingByObjectNumber.set(objectNumber, object);
  });
  const processedObjectNumbers = new Set<string>();
  const sampleObject = objects.find((object) => normalizeObjectNumber(object.objectNumber)) ?? objects[0] ?? null;
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
    const objectNumber = normalizeObjectNumber(object.objectNumber);
    if (!objectNumber) {
      summary.skipped += 1;
      summary.errors.push(`${object.address || object.id}: keine Objektnummer vorhanden.`);
      continue;
    }

    if (processedObjectNumbers.has(objectNumber)) {
      summary.skipped += 1;
      continue;
    }

    try {
      const existingObject = existingByObjectNumber.get(objectNumber);
      if (existingObject) {
        const backfilledObject = backfillObjectRecord(existingObject, object);
        await updateSupabaseObject(backfilledObject);
        existingByObjectNumber.set(objectNumber, backfilledObject);
        summary.skipped += 1;
      } else {
        const createdObject = await createSupabaseObject(object);
        existingByObjectNumber.set(objectNumber, createdObject);
        summary.imported += 1;
      }
      processedObjectNumbers.add(objectNumber);
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
  const updateRow = objectRowToSupabase(object);
  console.log("[Supabase Import] Lokales Objekt vor Update", object);
  console.log("[Supabase Import] Supabase-Datensatz vor Update", updateRow);

  const { data, error } = await supabase
    .from("objects")
    .update(updateRow)
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

export async function loadSupabaseDocumentsWithCostItems(): Promise<SupabaseDocumentLoadResult> {
  const supabase = await getSupabaseClientAsync();
  if (!supabase) {
    return {
      documents: [],
      supabaseDocumentCount: 0,
      supabaseCostItemCount: 0,
      appDocumentCount: 0,
      measureDetailsCount: 0,
      clustersCount: 0
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
    clustersCount: appDocuments.reduce((count, document) => count + document.clusters.length, 0)
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

  const [objectsResult, documentsResult, costItemsResult, tradesResult] = await Promise.all([
    supabase.from("objects").select("*"),
    supabase.from("documents").select("*"),
    supabase.from("cost_items").select("*"),
    supabase.from("trades").select("*")
  ]);

  if (objectsResult.error) throw new Error(`Supabase-Objekte konnten nicht geladen werden: ${formatSupabaseError(objectsResult.error)}`);
  if (documentsResult.error) throw new Error(`Supabase-Dokumente konnten nicht geladen werden: ${formatSupabaseError(documentsResult.error)}`);
  if (costItemsResult.error) throw new Error(`Supabase-Kostenpositionen konnten nicht geladen werden: ${formatSupabaseError(costItemsResult.error)}`);
  if (tradesResult.error) throw new Error(`Supabase-Gewerke konnten nicht geladen werden: ${formatSupabaseError(tradesResult.error)}`);

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
    const sampleDocumentRow = sampleObject.objectRow ? documentRowToSupabase(sampleDocument, stringValue(sampleObject.objectRow.id), sampleObject.objectNumber) : null;
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

    const resolvedObject = resolveSupabaseObjectForDocument(document, objectsByNumber, supabaseObjects);
    if (!resolvedObject.objectRow) {
      summary.skipped += 1;
      summary.skippedMissingObject += 1;
      logSkippedSupabaseDocument(document, resolvedObject.reason, resolvedObject);
      continue;
    }

    const objectId = stringValue(resolvedObject.objectRow.id);
    const documentRow = documentRowToSupabase(document, objectId, resolvedObject.objectNumber);
    const documentKey = documentDuplicateKey(documentRow);
    let supabaseDocumentId = documentIdByKey.get(documentKey) ?? null;

    try {
      if (existingDocumentKeys.has(documentKey) && supabaseDocumentId) {
        summary.skipped += 1;
        summary.skippedDuplicate += 1;
        logSkippedSupabaseDocument(document, `Duplikat erkannt (${documentKey}).`, resolvedObject);
      } else {
        const insertedDocument = await insertRowAdaptive(supabase, "documents", documentRow, ["object_id"]);
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

function objectAnalysisFromSupabase(
  documentRow: GenericSupabaseRow,
  objectRow: GenericSupabaseRow,
  costItems: GenericSupabaseRow[]
): ObjectAnalysis {
  const documentId = stringValue(documentRow.local_document_id || documentRow.id || `supabase-document-${Date.now()}`);
  const sourceDocumentId = stringValue(documentRow.source_document_id || documentRow.file_name || documentRow.document_name || documentRow.name || documentId);
  const grossAmount = numberValue(documentRow.gross_amount ?? documentRow.amount ?? documentRow.cost_gross) ?? sumNumbers(costItems.map((item) =>
    numberValue(item.gross_amount ?? item.amount ?? item.cost_gross)
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
    provider: textField(stringValue(documentRow.provider)),
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
    netCost: numberField(numberValue(documentRow.net_amount)),
    vatCost: numberField(numberValue(documentRow.vat_amount)),
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

function documentRowToSupabase(document: ObjectAnalysis, objectId: string, resolvedObjectNumber?: string): GenericSupabaseRow {
  return {
    object_id: objectId,
    local_document_id: document.id,
    source_document_id: document.sourceDocumentIds[0] ?? document.id,
    document_number: emptyToNull(unwrapTextField(document.documentNumber)),
    file_name: emptyToNull(document.sourceDocumentIds[0] ?? document.id),
    document_name: emptyToNull(document.sourceDocumentIds[0] ?? unwrapTextField(document.documentNumber) ?? document.id),
    name: emptyToNull(document.sourceDocumentIds[0] ?? unwrapTextField(document.documentNumber) ?? document.id),
    document_type: emptyToNull(unwrapTextField(document.documentType)),
    type: emptyToNull(unwrapTextField(document.documentType)),
    provider: emptyToNull(unwrapTextField(document.provider)),
    document_date: emptyToNull(unwrapTextField(document.documentDate)),
    object_number: emptyToNull(firstPresent(unwrapTextField(document.objectNumber), resolvedObjectNumber)),
    apartment_number: emptyToNull(unwrapTextField(document.apartmentNumber)),
    net_amount: document.netCost.value,
    vat_amount: document.vatCost.value,
    gross_amount: document.totalCost.value,
    confidence_score: document.confidenceScore.value,
    metadata: {
      localId: document.id,
      projectType: unwrapTextField(document.projectType),
      installmentNumber: unwrapTextField(document.installmentNumber),
      dataQuality: unwrapTextField(document.dataQuality),
      missingInformation: document.missingInformation.value ?? [],
      sourceDocumentIds: document.sourceDocumentIds
    }
  };
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

function firstPresent(primary?: string, fallback?: string): string {
  const primaryValue = primary?.trim() ?? "";
  if (primaryValue) return primaryValue;
  return fallback?.trim() ?? "";
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

function extractMissingColumn(message: string): string | null {
  return message.match(/'([^']+)'\s+column/i)?.[1] ?? message.match(/column\s+"([^"]+)"/i)?.[1] ?? null;
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
