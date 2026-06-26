import type { SharedCollectionName, SharedStorageSnapshot } from "../shared-storage-types";

const REST_TABLES: Record<Exclude<SharedCollectionName, "objectImages">, string> = {
  objects: "objects",
  entrances: "entrances",
  projects: "projects",
  documents: "documents",
  assignments: "assignments"
};

const EXPECTED_STORAGE_BUCKET = "paribus-files";
const DIAGNOSTIC_TABLES = ["objects", "entrances", "projects", "documents", "assignments", "object_images"] as const;
const DIAGNOSTIC_WRITE_ID = "__shared_storage_diagnostic__";

type DiagnosticState = "pass" | "fail" | "skip";

interface DiagnosticCheck {
  ok: boolean | null;
  state: DiagnosticState;
  message: string;
  status?: number;
  detail?: string;
}

interface EnvVarCheck {
  name: string;
  present: boolean;
  valid?: boolean;
  used: boolean;
  note?: string;
}

interface DiagnosticRequestResult {
  ok: boolean;
  status: number | null;
  detail: string;
}

export function sharedStorageConfigured(): boolean {
  return Boolean(supabaseProjectUrl() && supabaseServerKey());
}

export async function checkSharedStorageStatus() {
  const env = readSupabaseEnv();
  const projectUrl = env.projectUrl.value;
  const serverKey = env.serverKey.value;
  const bucket = env.storageBucket.value;
  const status = {
    generatedAt: new Date().toISOString(),
    configured: Boolean(projectUrl && serverKey),
    hasProjectUrl: env.projectUrl.valid,
    hasPublishableKey: env.publishableKey.present,
    hasServerKey: env.serverKey.present,
    storageBucket: bucket,
    bucketExists: false,
    canReadTables: false,
    canWrite: false,
    environment: {
      variables: env.variables,
      projectUrl: {
        present: env.projectUrl.present,
        valid: env.projectUrl.valid,
        source: env.projectUrl.source,
        message: env.projectUrl.message
      },
      publishableKey: {
        present: env.publishableKey.present,
        source: env.publishableKey.source,
        message: env.publishableKey.message
      },
      serverKey: {
        present: env.serverKey.present,
        source: env.serverKey.source,
        message: env.serverKey.message
      },
      storageBucket: {
        present: env.storageBucket.present,
        value: bucket,
        expected: EXPECTED_STORAGE_BUCKET,
        matchesExpected: bucket === EXPECTED_STORAGE_BUCKET,
        message: bucket === EXPECTED_STORAGE_BUCKET
          ? "Bucket-Name ist korrekt."
          : `Bucket-Name ist '${bucket}', erwartet wird '${EXPECTED_STORAGE_BUCKET}'.`
      }
    },
    connection: skippedCheck("Supabase-Verbindung wurde nicht getestet."),
    tables: {
      ...skippedCheck("Tabellen wurden nicht getestet."),
      required: DIAGNOSTIC_TABLES.map((name) => ({
        name,
        ok: null as boolean | null,
        state: "skip" as DiagnosticState,
        message: "Nicht getestet.",
        status: undefined as number | undefined,
        detail: undefined as string | undefined
      })),
      missing: [] as string[]
    },
    bucket: {
      ...skippedCheck("Storage Bucket wurde nicht getestet."),
      name: bucket,
      expected: EXPECTED_STORAGE_BUCKET,
      matchesExpected: bucket === EXPECTED_STORAGE_BUCKET
    },
    writeTest: {
      ...skippedCheck("Schreibtest wurde nicht getestet."),
      table: "assignments",
      id: DIAGNOSTIC_WRITE_ID
    },
    message: ""
  };
  if (!status.configured) {
    const reasons = [
      env.projectUrl.valid ? "" : env.projectUrl.message,
      env.serverKey.present ? "" : env.serverKey.message
    ].filter(Boolean);
    status.message = `Supabase nicht konfiguriert. ${reasons.join(" ") || "Project URL und serverseitiger Key fehlen."}`.trim();
    return status;
  }

  const connection = await diagnosticFetch("/rest/v1/");
  status.connection = checkFromResult(connection, {
    pass: "Supabase-Verbindung erfolgreich.",
    fail: "Supabase-Verbindung fehlgeschlagen."
  });

  const tableResults = await Promise.all(DIAGNOSTIC_TABLES.map(async (name) => {
    const result = await diagnosticFetch(`/rest/v1/${name}?select=id&limit=1`);
    const check = checkFromResult(result, {
      pass: `Tabelle '${name}' ist erreichbar.`,
      fail: `Tabelle '${name}' fehlt oder ist nicht lesbar.`
    });
    return { name, ...check, status: check.status, detail: check.detail };
  }));
  status.tables.required = tableResults;
  status.tables.missing = tableResults.filter((table) => !table.ok).map((table) => table.name);
  status.canReadTables = status.tables.missing.length === 0;
  status.tables.ok = status.canReadTables;
  status.tables.state = status.canReadTables ? "pass" : "fail";
  status.tables.message = status.canReadTables
    ? "Alle benoetigten Tabellen sind vorhanden und lesbar."
    : `Fehlende oder nicht lesbare Tabellen: ${status.tables.missing.join(", ")}. Bitte supabase-schema.sql ausfuehren.`;

  const bucketResult = await diagnosticFetch(`/storage/v1/bucket/${encodeURIComponent(bucket)}`);
  const bucketExists = bucketResult.ok;
  status.bucketExists = bucketExists && bucket === EXPECTED_STORAGE_BUCKET;
  status.bucket = {
    ...checkFromResult(bucketResult, {
      pass: `Bucket '${bucket}' ist vorhanden.`,
      fail: `Bucket '${bucket}' fehlt oder ist nicht erreichbar.`
    }),
    name: bucket,
    expected: EXPECTED_STORAGE_BUCKET,
    matchesExpected: bucket === EXPECTED_STORAGE_BUCKET
  };
  if (bucketExists && bucket !== EXPECTED_STORAGE_BUCKET) {
    status.bucket.ok = false;
    status.bucket.state = "fail";
    status.bucket.message = `Bucket '${bucket}' ist erreichbar, aber erwartet wird '${EXPECTED_STORAGE_BUCKET}'.`;
  }

  status.writeTest = await runSharedStorageWriteTest();
  status.canWrite = status.writeTest.ok === true;

  if (status.connection.ok && status.canReadTables && status.bucketExists && status.canWrite) {
    status.message = "Supabase ist vollstaendig verbunden: Verbindung, Tabellen, Bucket und Schreibtest sind erfolgreich.";
    return status;
  }

  const failed = [
    status.connection.ok ? "" : "Verbindung fehlgeschlagen",
    status.canReadTables ? "" : "Tabellen fehlen oder sind nicht lesbar",
    status.bucketExists ? "" : `Bucket '${EXPECTED_STORAGE_BUCKET}' fehlt oder ist falsch konfiguriert`,
    status.canWrite ? "" : "Schreibtest fehlgeschlagen"
  ].filter(Boolean);
  status.message = `Supabase Diagnose unvollstaendig: ${failed.join("; ")}.`;
  return status;
}

export async function readSharedSnapshot(): Promise<SharedStorageSnapshot> {
  if (!sharedStorageConfigured()) return emptySnapshot();

  const [objects, entrances, projects, documents, assignmentsRows, objectImages] = await Promise.all([
    readRows("objects"),
    readRows("entrances"),
    readRows("projects"),
    readRows("documents"),
    readRows("assignments"),
    readObjectImages()
  ]);

  const assignmentPayload = assignmentsRows[0]?.data;
  return {
    objects: objects.map((row) => row.data),
    entrances: entrances.map((row) => row.data),
    projects: projects.map((row) => row.data),
    documents: documents.map((row) => row.data),
    assignments: assignmentPayload && typeof assignmentPayload === "object" ? assignmentPayload : {},
    objectImages
  };
}

export async function upsertSharedRecord(collection: SharedCollectionName, id: string, data: unknown): Promise<void> {
  if (!sharedStorageConfigured()) return;
  if (collection === "objectImages") {
    await upsertObjectImages(id, Array.isArray(data) ? data.filter((entry): entry is string => typeof entry === "string") : []);
    return;
  }

  const table = REST_TABLES[collection];
  await supabaseFetch(`/rest/v1/${table}`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates"
    },
    body: JSON.stringify({ id, data, updated_at: new Date().toISOString() })
  });
}

export async function deleteSharedRecord(collection: SharedCollectionName, id: string): Promise<void> {
  if (!sharedStorageConfigured()) return;
  if (collection === "objectImages") {
    await supabaseFetch(`/rest/v1/object_images?object_id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
    return;
  }
  const table = REST_TABLES[collection];
  await supabaseFetch(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function uploadSharedFile(file: File, folder = "uploads"): Promise<{ url: string; path: string }> {
  if (!sharedStorageConfigured()) throw new Error("Shared storage is not configured.");
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "paribus-files";
  const path = `${folder}/${Date.now()}-${safeFileName(file.name)}`;
  await supabaseFetch(`/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "true"
    },
    body: Buffer.from(await file.arrayBuffer())
  });
  return { path, url: publicStorageUrl(bucket, path) };
}

async function readRows(collection: Exclude<SharedCollectionName, "objectImages">): Promise<Array<{ id: string; data: any }>> {
  const table = REST_TABLES[collection];
  return supabaseFetch(`/rest/v1/${table}?select=id,data&order=updated_at.asc`);
}

async function readObjectImages(): Promise<Record<string, string[]>> {
  const rows = await supabaseFetch("/rest/v1/object_images?select=object_id,url&order=created_at.asc");
  return rows.reduce((result: Record<string, string[]>, row: { object_id: string; url: string }) => {
    if (!row.object_id || !row.url) return result;
    result[row.object_id] = [...(result[row.object_id] ?? []), row.url];
    return result;
  }, {});
}

async function upsertObjectImages(objectId: string, urls: string[]): Promise<void> {
  await supabaseFetch(`/rest/v1/object_images?object_id=eq.${encodeURIComponent(objectId)}`, { method: "DELETE" });
  if (!urls.length) return;
  await supabaseFetch("/rest/v1/object_images", {
    method: "POST",
    body: JSON.stringify(urls.map((url) => ({ object_id: objectId, url })))
  });
}

function readSupabaseEnv() {
  const supabaseUrl = envVar("SUPABASE_URL");
  const nextPublicSupabaseUrl = envVar("NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey = envVar("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const fallbackPublishableKey = envVar("SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = envVar("SUPABASE_SERVICE_ROLE_KEY");
  const secretKey = envVar("SUPABASE_SECRET_KEY");
  const storageBucket = envVar("SUPABASE_STORAGE_BUCKET");
  const projectUrlSource = supabaseUrl.present ? supabaseUrl.name : nextPublicSupabaseUrl.present ? nextPublicSupabaseUrl.name : null;
  const projectUrlRaw = supabaseUrl.value || nextPublicSupabaseUrl.value;
  const projectUrl = normalizeSupabaseProjectUrl(projectUrlRaw);
  const serverKeySource = serviceRoleKey.present ? serviceRoleKey.name : secretKey.present ? secretKey.name : null;
  const serverKey = serviceRoleKey.value || secretKey.value || null;
  const publishableKeySource = publishableKey.present ? publishableKey.name : fallbackPublishableKey.present ? fallbackPublishableKey.name : null;
  const bucket = storageBucket.value || EXPECTED_STORAGE_BUCKET;

  const variables: EnvVarCheck[] = [
    {
      name: supabaseUrl.name,
      present: supabaseUrl.present,
      valid: supabaseUrl.present ? Boolean(normalizeSupabaseProjectUrl(supabaseUrl.value)) : false,
      used: projectUrlSource === supabaseUrl.name,
      note: "Serverseitige Project URL."
    },
    {
      name: nextPublicSupabaseUrl.name,
      present: nextPublicSupabaseUrl.present,
      valid: nextPublicSupabaseUrl.present ? Boolean(normalizeSupabaseProjectUrl(nextPublicSupabaseUrl.value)) : false,
      used: projectUrlSource === nextPublicSupabaseUrl.name,
      note: "Fallback fuer die Project URL."
    },
    {
      name: publishableKey.name,
      present: publishableKey.present,
      used: publishableKeySource === publishableKey.name,
      note: "Publishable Key, wird nicht als Secret angezeigt."
    },
    {
      name: fallbackPublishableKey.name,
      present: fallbackPublishableKey.present,
      used: publishableKeySource === fallbackPublishableKey.name,
      note: "Fallback Publishable Key."
    },
    {
      name: serviceRoleKey.name,
      present: serviceRoleKey.present,
      used: serverKeySource === serviceRoleKey.name,
      note: "Serverseitiger Schreib-/Leseschluessel."
    },
    {
      name: secretKey.name,
      present: secretKey.present,
      used: serverKeySource === secretKey.name,
      note: "Fallback fuer serverseitigen Schreib-/Leseschluessel."
    },
    {
      name: storageBucket.name,
      present: storageBucket.present,
      valid: bucket === EXPECTED_STORAGE_BUCKET,
      used: storageBucket.present,
      note: storageBucket.present ? "Konfigurierter Storage Bucket." : `Nicht gesetzt, Standard '${EXPECTED_STORAGE_BUCKET}' wird genutzt.`
    }
  ];

  return {
    variables,
    projectUrl: {
      value: projectUrl,
      present: Boolean(projectUrlRaw),
      valid: Boolean(projectUrl),
      source: projectUrlSource,
      message: projectUrl
        ? "Project URL ist gueltig."
        : projectUrlRaw
          ? "Project URL ist gesetzt, aber ungueltig. Erwartet wird https://xxxxx.supabase.co."
          : "Project URL fehlt. Setze SUPABASE_URL oder NEXT_PUBLIC_SUPABASE_URL."
    },
    publishableKey: {
      present: Boolean(publishableKeySource),
      source: publishableKeySource,
      message: publishableKeySource
        ? "Publishable Key ist vorhanden."
        : "Publishable Key fehlt. Fuer die aktuelle Server-Diagnose ist er nicht entscheidend, sollte aber in Vercel gesetzt sein."
    },
    serverKey: {
      value: serverKey,
      present: Boolean(serverKey),
      source: serverKeySource,
      message: serverKey
        ? "Serverseitiger Secret/Service-Key ist vorhanden."
        : "Serverseitiger Secret/Service-Key fehlt. Setze SUPABASE_SERVICE_ROLE_KEY oder SUPABASE_SECRET_KEY."
    },
    storageBucket: {
      value: bucket,
      present: storageBucket.present
    }
  };
}

function envVar(name: string): { name: string; value: string; present: boolean } {
  const value = process.env[name]?.trim() || "";
  return { name, value, present: Boolean(value) };
}

function skippedCheck(message: string): DiagnosticCheck {
  return { ok: null, state: "skip", message };
}

function checkFromResult(result: DiagnosticRequestResult, messages: { pass: string; fail: string }): DiagnosticCheck {
  if (result.ok) {
    return { ok: true, state: "pass", message: messages.pass, status: result.status ?? undefined };
  }
  return {
    ok: false,
    state: "fail",
    message: messages.fail,
    status: result.status ?? undefined,
    detail: result.detail || undefined
  };
}

async function runSharedStorageWriteTest(): Promise<DiagnosticCheck & { table: string; id: string; cleanupOk?: boolean }> {
  if (!sharedStorageConfigured()) {
    return { ...skippedCheck("Schreibtest wurde nicht ausgefuehrt, weil Supabase nicht konfiguriert ist."), table: "assignments", id: DIAGNOSTIC_WRITE_ID };
  }

  const checkedAt = new Date().toISOString();
  const write = await diagnosticFetch("/rest/v1/assignments?on_conflict=id", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify({
      id: DIAGNOSTIC_WRITE_ID,
      data: { diagnostic: true, checkedAt },
      updated_at: checkedAt
    })
  });

  if (!write.ok) {
    return {
      ...checkFromResult(write, {
        pass: "Schreibtest erfolgreich.",
        fail: "Schreibtest fehlgeschlagen. Tabelle 'assignments' ist nicht beschreibbar."
      }),
      table: "assignments",
      id: DIAGNOSTIC_WRITE_ID,
      cleanupOk: false
    };
  }

  const cleanup = await diagnosticFetch(`/rest/v1/assignments?id=eq.${encodeURIComponent(DIAGNOSTIC_WRITE_ID)}`, { method: "DELETE" });
  if (!cleanup.ok) {
    return {
      ok: false,
      state: "fail",
      message: "Schreibtest hat geschrieben, aber der Testdatensatz konnte nicht geloescht werden.",
      status: cleanup.status ?? undefined,
      detail: cleanup.detail || undefined,
      table: "assignments",
      id: DIAGNOSTIC_WRITE_ID,
      cleanupOk: false
    };
  }

  return {
    ok: true,
    state: "pass",
    message: "Schreibtest erfolgreich; Testdatensatz wurde wieder geloescht.",
    status: write.status ?? undefined,
    table: "assignments",
    id: DIAGNOSTIC_WRITE_ID,
    cleanupOk: true
  };
}

async function diagnosticFetch(path: string, init: RequestInit = {}): Promise<DiagnosticRequestResult> {
  const baseUrl = supabaseProjectUrl();
  const key = supabaseServerKey();
  if (!baseUrl || !key) {
    return { ok: false, status: null, detail: "Supabase ist nicht konfiguriert." };
  }

  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  try {
    const response = await fetch(`${baseUrl}${path}`, { ...init, headers, cache: "no-store" });
    const detail = response.ok ? "" : await response.text().catch(() => "");
    return {
      ok: response.ok,
      status: response.status,
      detail: sanitizeDiagnosticDetail(detail)
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      detail: error instanceof Error ? error.message : "Unbekannter Netzwerkfehler."
    };
  }
}

function sanitizeDiagnosticDetail(detail: string): string {
  return detail.replace(/\s+/g, " ").trim().slice(0, 500);
}

async function supabaseFetch(path: string, init: RequestInit = {}) {
  const baseUrl = supabaseProjectUrl();
  const key = supabaseServerKey();
  if (!baseUrl || !key) throw new Error("Supabase is not configured.");
  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers, cache: "no-store" });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Shared storage request failed: ${response.status} ${detail}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function publicStorageUrl(bucket: string, path: string): string {
  const baseUrl = supabaseProjectUrl();
  return `${baseUrl}/storage/v1/object/public/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function supabaseProjectUrl(): string | null {
  const value = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  return normalizeSupabaseProjectUrl(value);
}

function normalizeSupabaseProjectUrl(value: string): string | null {
  const normalized = value.trim().replace(/\/$/, "");
  return /^https:\/\/[a-zA-Z0-9-]+\.supabase\.co$/.test(normalized) ? normalized : null;
}

function supabaseServerKey(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || null;
}

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "datei";
}

function emptySnapshot(): SharedStorageSnapshot {
  return { objects: [], entrances: [], projects: [], documents: [], assignments: {}, objectImages: {} };
}
