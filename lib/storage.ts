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
    applySharedSnapshot(data.snapshot);
    return data.snapshot;
  } catch (error) {
    console.warn("Zentrale Speicherung konnte nicht geladen werden.", error);
    return null;
  }
}

export function applySharedSnapshot(snapshot: SharedStorageSnapshot): void {
  writeJson(STORAGE_KEYS.objects, snapshot.objects ?? []);
  writeJson(STORAGE_KEYS.entrances, snapshot.entrances ?? []);
  writeJson(STORAGE_KEYS.projects, snapshot.projects ?? []);
  writeJson(STORAGE_KEYS.documents, snapshot.documents ?? []);
  writeJson(STORAGE_KEYS.assignments, snapshot.assignments ?? {});
  writeJson(STORAGE_KEYS.objectImages, snapshot.objectImages ?? {});
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
  void fetch("/api/shared-storage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ collection, id, data })
  }).catch((error) => console.warn("Zentrale Speicherung konnte nicht synchronisiert werden.", error));
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
