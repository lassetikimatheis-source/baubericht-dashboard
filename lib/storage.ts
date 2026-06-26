import type { ObjectAnalysis } from "../types/analysis";
import type { SharedCollectionName, SharedStorageSnapshot } from "./shared-storage-types";
import { normalizeDocumentTrades } from "./trades";

export interface StoredObjectRecord {
  id: string;
  fund: string;
  objectNumber: string;
  objectName: string;
  address: string;
  postalCode: string;
  city: string;
  federalState: string;
  constructionYear: string;
  unitCount: string;
  totalLivingAreaSqm: string;
  wohnflaecheSanierteWohnung: string;
  assetManager: string;
  portfolioManager: string;
  latitude?: string;
  longitude?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface StoredProjectRecord {
  id: string;
  projectName: string;
  projectType: string;
  fund: string;
  objectId: string;
  object: string;
  entranceId?: string;
  entrance?: string;
  status: string;
  budgetNet: string;
  budgetGross: string;
  startDate: string;
  endDate: string;
  description: string;
  apartmentNumber: string;
  location: string;
  renovatedApartmentCount: string;
  livingAreaSqm: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface StoredEntranceRecord {
  id: string;
  objectId: string;
  street: string;
  houseNumber: string;
  suffix: string;
  postalCode: string;
  city: string;
  livingAreaSqm: string;
  unitCount: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LocalStorageKeyDiagnostic {
  key: string;
  expected: boolean;
  present: boolean;
  entries: number | null;
  chars: number;
  validJson: boolean | null;
  valueType: string;
}

export interface LocalStorageDiagnostics {
  origin: string;
  totalKeys: number;
  totalChars: number;
  keys: LocalStorageKeyDiagnostic[];
}

const STORAGE_KEYS = {
  objects: "paribus-baukosten.objects.v1",
  entrances: "paribus-baukosten.entrances.v1",
  projects: "paribus-baukosten.projects.v1",
  documents: "paribus-baukosten.documents.v1",
  assignments: "paribus-baukosten.assignments.v1",
  objectImages: "paribus-baukosten.object-images.v1"
};

export function saveObject(object: StoredObjectRecord): StoredObjectRecord {
  const now = timestamp();
  const next = { ...object, createdAt: object.createdAt ?? now, updatedAt: now };
  upsertItem(STORAGE_KEYS.objects, next);
  syncSharedRecord("objects", next.id, next);
  return next;
}

export function updateObject(object: StoredObjectRecord): StoredObjectRecord {
  const next = { ...object, updatedAt: timestamp() };
  upsertItem(STORAGE_KEYS.objects, next);
  syncSharedRecord("objects", next.id, next);
  return next;
}

export function deleteObject(id: string): void {
  deleteItem(STORAGE_KEYS.objects, id);
  deleteSharedRecord("objects", id);
}

export function getObjects(): StoredObjectRecord[] {
  return readCollection<StoredObjectRecord>(STORAGE_KEYS.objects).map((object) => ({
    ...object,
    wohnflaecheSanierteWohnung: object.wohnflaecheSanierteWohnung ?? ""
  }));
}

export function saveEntrance(entrance: StoredEntranceRecord): StoredEntranceRecord {
  const now = timestamp();
  const next = { ...entrance, createdAt: entrance.createdAt ?? now, updatedAt: now };
  upsertItem(STORAGE_KEYS.entrances, next);
  syncSharedRecord("entrances", next.id, next);
  return next;
}

export function updateEntrance(entrance: StoredEntranceRecord): StoredEntranceRecord {
  const next = { ...entrance, updatedAt: timestamp() };
  upsertItem(STORAGE_KEYS.entrances, next);
  syncSharedRecord("entrances", next.id, next);
  return next;
}

export function deleteEntrance(id: string): void {
  deleteItem(STORAGE_KEYS.entrances, id);
  deleteSharedRecord("entrances", id);
}

export function getEntrances(): StoredEntranceRecord[] {
  return readCollection<StoredEntranceRecord>(STORAGE_KEYS.entrances);
}

export function saveProject(project: StoredProjectRecord): StoredProjectRecord {
  const now = timestamp();
  const next = { ...project, createdAt: project.createdAt ?? now, updatedAt: now };
  upsertItem(STORAGE_KEYS.projects, next);
  syncSharedRecord("projects", next.id, next);
  return next;
}

export function updateProject(project: StoredProjectRecord): StoredProjectRecord {
  const next = { ...project, updatedAt: timestamp() };
  upsertItem(STORAGE_KEYS.projects, next);
  syncSharedRecord("projects", next.id, next);
  return next;
}

export function deleteProject(id: string): void {
  deleteItem(STORAGE_KEYS.projects, id);
  deleteSharedRecord("projects", id);
}

export function getProjects(): StoredProjectRecord[] {
  return readCollection<StoredProjectRecord>(STORAGE_KEYS.projects);
}

export function saveDocument(document: ObjectAnalysis): ObjectAnalysis {
  const normalized = normalizeDocumentTrades(document).document;
  upsertItem(STORAGE_KEYS.documents, normalized);
  syncSharedRecord("documents", normalized.id, normalized);
  return normalized;
}

export function updateDocument(document: ObjectAnalysis): ObjectAnalysis {
  const normalized = normalizeDocumentTrades(document).document;
  upsertItem(STORAGE_KEYS.documents, normalized);
  syncSharedRecord("documents", normalized.id, normalized);
  return normalized;
}

export function deleteDocument(id: string): void {
  deleteItem(STORAGE_KEYS.documents, id);
  deleteSharedRecord("documents", id);
}

export function getDocuments(): ObjectAnalysis[] {
  const documents = readCollection<ObjectAnalysis>(STORAGE_KEYS.documents);
  let changed = false;
  const normalized = documents.map((document) => {
    const result = normalizeDocumentTrades(document);
    if (result.changed) changed = true;
    return result.document;
  });
  if (changed) writeJson(STORAGE_KEYS.documents, normalized);
  return normalized;
}

export function saveAssignments(assignments: Record<string, string | null>): void {
  writeJson(STORAGE_KEYS.assignments, assignments);
  syncSharedRecord("assignments", "default", assignments);
}

export function getAssignments(): Record<string, string | null> {
  return readJson<Record<string, string | null>>(STORAGE_KEYS.assignments, {});
}

export function saveObjectImages(objectId: string, urls: string[]): void {
  const images = getObjectImages();
  const next = { ...images, [objectId]: urls };
  writeJson(STORAGE_KEYS.objectImages, next);
  syncSharedRecord("objectImages", objectId, urls);
}

export function getObjectImages(): Record<string, string[]> {
  return readJson<Record<string, string[]>>(STORAGE_KEYS.objectImages, {});
}

export function getLocalStorageDiagnostics(): LocalStorageDiagnostics {
  if (typeof window === "undefined") {
    return { origin: "server", totalKeys: 0, totalChars: 0, keys: [] };
  }

  const expectedKeys = new Set(Object.values(STORAGE_KEYS));
  const discoveredKeys = new Set<string>(expectedKeys);
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith("paribus-baukosten")) discoveredKeys.add(key);
  }

  const keys = Array.from(discoveredKeys).sort((left, right) => {
    const leftExpected = expectedKeys.has(left) ? 0 : 1;
    const rightExpected = expectedKeys.has(right) ? 0 : 1;
    return leftExpected - rightExpected || left.localeCompare(right);
  }).map((key) => inspectLocalStorageKey(key, expectedKeys.has(key)));

  return {
    origin: window.location.origin,
    totalKeys: keys.filter((entry) => entry.present).length,
    totalChars: keys.reduce((sum, entry) => sum + entry.chars, 0),
    keys
  };
}

export async function uploadSharedFiles(files: File[], folder: string): Promise<string[]> {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  formData.append("folder", folder);
  const response = await fetch("/api/shared-storage/upload", { method: "POST", body: formData });
  if (!response.ok) throw new Error("Shared file upload failed.");
  const data = await response.json() as { ok: boolean; files?: Array<{ url: string }> };
  if (!data.ok) throw new Error("Shared file upload failed.");
  return (data.files ?? []).map((file) => file.url).filter(Boolean);
}

export async function loadSharedStorageSnapshot(): Promise<SharedStorageSnapshot | null> {
  if (typeof window === "undefined") return null;
  try {
    const response = await fetch("/api/shared-storage", { cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json() as { ok: boolean; configured?: boolean; snapshot?: SharedStorageSnapshot };
    if (!data.ok || !data.configured || !data.snapshot) return null;
    return data.snapshot;
  } catch (error) {
    console.warn("Zentrale Speicherung konnte nicht geladen werden.", error);
    return null;
  }
}

export async function getSharedStorageStatus(): Promise<{ configured: boolean; message: string; bucketExists?: boolean; canReadTables?: boolean; canWrite?: boolean } | null> {
  if (typeof window === "undefined") return null;
  try {
    const response = await fetch("/api/shared-storage/status", { cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json() as { configured: boolean; message: string; bucketExists?: boolean; canReadTables?: boolean; canWrite?: boolean };
    return data;
  } catch {
    return null;
  }
}

export async function migrateLocalStorageToSharedStorage(): Promise<{ ok: boolean; message: string }> {
  const status = await getSharedStorageStatus();
  if (!status?.configured || !status.bucketExists || !status.canReadTables || !status.canWrite) {
    return { ok: false, message: status?.message || "Supabase ist nicht verbunden. Migration wurde nicht gestartet." };
  }
  const snapshot = await loadSharedStorageSnapshot();
  if (snapshot && sharedSnapshotHasData(snapshot)) {
    return { ok: false, message: "Migration gestoppt: Supabase enthaelt bereits Daten. Es wurde nichts ueberschrieben." };
  }
  const localObjects = getObjects();
  const localEntrances = getEntrances();
  const localProjects = getProjects();
  const localDocuments = getDocuments();
  const localAssignments = getAssignments();
  const localObjectImages = getObjectImages();
  if (!localObjects.length && !localEntrances.length && !localProjects.length && !localDocuments.length && !Object.keys(localAssignments).length && !Object.keys(localObjectImages).length) {
    return { ok: false, message: "Keine lokalen Daten gefunden. Migration wurde nicht gestartet." };
  }
  const operations: Array<Promise<void>> = [];
  localObjects.forEach((object) => operations.push(postSharedRecord("objects", object.id, object)));
  localEntrances.forEach((entrance) => operations.push(postSharedRecord("entrances", entrance.id, entrance)));
  localProjects.forEach((project) => operations.push(postSharedRecord("projects", project.id, project)));
  localDocuments.forEach((document) => operations.push(postSharedRecord("documents", document.id, document)));
  operations.push(postSharedRecord("assignments", "default", localAssignments));
  Object.entries(localObjectImages).forEach(([objectId, urls]) => operations.push(postSharedRecord("objectImages", objectId, urls)));
  await Promise.all(operations);
  return { ok: true, message: "Lokale Daten wurden nach Supabase uebertragen. LocalStorage wurde nicht veraendert." };
}

export function applySharedSnapshot(snapshot: SharedStorageSnapshot): void {
  writeJson(STORAGE_KEYS.objects, mergeByIdKeepLocal(snapshot.objects ?? [], getObjects()));
  writeJson(STORAGE_KEYS.entrances, mergeByIdKeepLocal(snapshot.entrances ?? [], getEntrances()));
  writeJson(STORAGE_KEYS.projects, mergeByIdKeepLocal(snapshot.projects ?? [], getProjects()));
  writeJson(STORAGE_KEYS.documents, mergeByIdKeepLocal(snapshot.documents ?? [], getDocuments()));
  writeJson(STORAGE_KEYS.assignments, { ...(snapshot.assignments ?? {}), ...getAssignments() });
  writeJson(STORAGE_KEYS.objectImages, { ...(snapshot.objectImages ?? {}), ...getObjectImages() });
}

function sharedSnapshotHasData(snapshot: SharedStorageSnapshot): boolean {
  return Boolean(
    snapshot.objects.length ||
    snapshot.entrances.length ||
    snapshot.projects.length ||
    snapshot.documents.length ||
    Object.keys(snapshot.assignments).length ||
    Object.keys(snapshot.objectImages).length
  );
}

function mergeByIdKeepLocal<T extends { id: string }>(remoteItems: T[], localItems: T[]): T[] {
  const result = new Map<string, T>();
  remoteItems.forEach((item) => result.set(item.id, item));
  localItems.forEach((item) => result.set(item.id, item));
  return Array.from(result.values());
}

function upsertItem<T extends { id: string }>(key: string, item: T): void {
  const items = readCollection<T>(key);
  const index = items.findIndex((entry) => entry.id === item.id);
  const next = index >= 0 ? items.map((entry) => entry.id === item.id ? item : entry) : [...items, item];
  writeJson(key, next);
}

function deleteItem(key: string, id: string): void {
  writeJson(key, readCollection<{ id: string }>(key).filter((entry) => entry.id !== id));
}

function readCollection<T>(key: string): T[] {
  return readJson<T[]>(key, []);
}

function inspectLocalStorageKey(key: string, expected: boolean): LocalStorageKeyDiagnostic {
  if (typeof window === "undefined") {
    return { key, expected, present: false, entries: null, chars: 0, validJson: null, valueType: "server" };
  }

  const raw = window.localStorage.getItem(key);
  if (raw === null) {
    return { key, expected, present: false, entries: null, chars: 0, validJson: null, valueType: "missing" };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    const entries = Array.isArray(parsed)
      ? parsed.length
      : parsed && typeof parsed === "object"
        ? Object.keys(parsed).length
        : null;
    return {
      key,
      expected,
      present: true,
      entries,
      chars: raw.length,
      validJson: true,
      valueType: Array.isArray(parsed) ? "array" : parsed === null ? "null" : typeof parsed
    };
  } catch {
    return {
      key,
      expected,
      present: true,
      entries: null,
      chars: raw.length,
      validJson: false,
      valueType: "invalid-json"
    };
  }
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function syncSharedRecord(collection: SharedCollectionName, id: string, data: unknown): void {
  if (typeof window === "undefined") return;
  void postSharedRecord(collection, id, data).catch((error) => console.warn("Zentrale Speicherung konnte nicht synchronisiert werden.", error));
}

async function postSharedRecord(collection: SharedCollectionName, id: string, data: unknown): Promise<void> {
  const payload = { collection, id, data };
  const response = await fetch("/api/shared-storage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || "Zentrale Speicherung fehlgeschlagen.");
  }
}

function deleteSharedRecord(collection: SharedCollectionName, id: string): void {
  if (typeof window === "undefined") return;
  void fetch(`/api/shared-storage?collection=${encodeURIComponent(collection)}&id=${encodeURIComponent(id)}`, {
    method: "DELETE"
  }).catch((error) => console.warn("Zentrale Speicherung konnte nicht gelöscht werden.", error));
}

function timestamp(): string {
  return new Date().toISOString();
}
