import type { SharedCollectionName, SharedStorageSnapshot } from "../shared-storage-types";

const REST_TABLES: Record<Exclude<SharedCollectionName, "objectImages">, string> = {
  objects: "objects",
  entrances: "entrances",
  projects: "projects",
  documents: "documents",
  assignments: "assignments"
};

export function sharedStorageConfigured(): boolean {
  return Boolean(supabaseProjectUrl() && supabaseServerKey());
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
  const normalized = value.replace(/\/$/, "");
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
