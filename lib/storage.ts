import type { ObjectAnalysis } from "../types/analysis";
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

export interface AppDataBackup {
  version: 1;
  exportedAt: string;
  keys: {
    objects: StoredObjectRecord[];
    entrances: StoredEntranceRecord[];
    projects: StoredProjectRecord[];
    documents: ObjectAnalysis[];
    assignments: Record<string, string | null>;
  };
}

export interface AppDataSummary {
  objects: number;
  entrances: number;
  projects: number;
  documents: number;
  assignments: number;
}

export interface LocalDocumentStorageDiagnostic {
  key: string;
  count: number;
  shape: string;
}

export interface AnalysisBackupResult {
  id: string | null;
  warning: string | null;
}

const STORAGE_KEYS = {
  objects: "paribus-baukosten.objects.v1",
  entrances: "paribus-baukosten.entrances.v1",
  projects: "paribus-baukosten.projects.v1",
  documents: "paribus-baukosten.documents.v1",
  assignments: "paribus-baukosten.assignments.v1",
  reanalysisBackups: "paribus-baukosten.reanalysis-backups.v1"
};

export function saveObject(object: StoredObjectRecord): StoredObjectRecord {
  const now = timestamp();
  const next = { ...object, createdAt: object.createdAt ?? now, updatedAt: now };
  upsertItem(STORAGE_KEYS.objects, next);
  return next;
}

export function updateObject(object: StoredObjectRecord): StoredObjectRecord {
  const next = { ...object, updatedAt: timestamp() };
  upsertItem(STORAGE_KEYS.objects, next);
  return next;
}

export function deleteObject(id: string): void {
  deleteItem(STORAGE_KEYS.objects, id);
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
  return next;
}

export function updateEntrance(entrance: StoredEntranceRecord): StoredEntranceRecord {
  const next = { ...entrance, updatedAt: timestamp() };
  upsertItem(STORAGE_KEYS.entrances, next);
  return next;
}

export function deleteEntrance(id: string): void {
  deleteItem(STORAGE_KEYS.entrances, id);
}

export function getEntrances(): StoredEntranceRecord[] {
  return readCollection<StoredEntranceRecord>(STORAGE_KEYS.entrances);
}

export function saveProject(project: StoredProjectRecord): StoredProjectRecord {
  const now = timestamp();
  const next = { ...project, createdAt: project.createdAt ?? now, updatedAt: now };
  upsertItem(STORAGE_KEYS.projects, next);
  return next;
}

export function updateProject(project: StoredProjectRecord): StoredProjectRecord {
  const next = { ...project, updatedAt: timestamp() };
  upsertItem(STORAGE_KEYS.projects, next);
  return next;
}

export function deleteProject(id: string): void {
  deleteItem(STORAGE_KEYS.projects, id);
}

export function getProjects(): StoredProjectRecord[] {
  return readCollection<StoredProjectRecord>(STORAGE_KEYS.projects);
}

export function saveDocument(document: ObjectAnalysis): ObjectAnalysis {
  const normalized = normalizeDocumentTrades(document).document;
  upsertItem(STORAGE_KEYS.documents, normalized);
  return normalized;
}

export function updateDocument(document: ObjectAnalysis): ObjectAnalysis {
  const normalized = normalizeDocumentTrades(document).document;
  upsertItem(STORAGE_KEYS.documents, normalized);
  return normalized;
}

export function deleteDocument(id: string): void {
  deleteItem(STORAGE_KEYS.documents, id);
}

export function getDocuments(): ObjectAnalysis[] {
  const documents = readCollection<ObjectAnalysis>(STORAGE_KEYS.documents);
  let changed = false;
  const normalized = documents.map((document) => {
    const result = normalizeDocumentTrades(document);
    if (result.changed) changed = true;
    return result.document;
  });
  const deduped = dedupeStoredDocuments(normalized);
  if (changed || deduped.length !== normalized.length) {
    console.warn("[Storage] Doppelte Dokumente im localStorage bereinigt", {
      vorher: normalized.length,
      nachher: deduped.length
    });
    writeJson(STORAGE_KEYS.documents, deduped);
  }
  return deduped;
}

export function getLocalDocumentStorageDiagnostics(): LocalDocumentStorageDiagnostic[] {
  if (typeof window === "undefined") return [];
  const diagnostics: LocalDocumentStorageDiagnostic[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index) ?? "";
    if (!/documents?|analysis/i.test(key)) continue;
    const raw = window.localStorage.getItem(key);
    const parsed = parseJsonSafely(raw);
    diagnostics.push({
      key,
      count: countDocumentLikeEntries(parsed),
      shape: describeStorageShape(parsed)
    });
  }
  diagnostics.sort((left, right) => left.key.localeCompare(right.key));
  return diagnostics;
}

export function saveAssignments(assignments: Record<string, string | null>): void {
  writeJson(STORAGE_KEYS.assignments, assignments);
}

export function getAssignments(): Record<string, string | null> {
  return readJson<Record<string, string | null>>(STORAGE_KEYS.assignments, {});
}

export function createAnalysisBackup(): AnalysisBackupResult {
  if (typeof window === "undefined") return { id: null, warning: null };
  const backup = {
    id: `backup-${Date.now()}`,
    createdAt: timestamp(),
    objects: readCollection<StoredObjectRecord>(STORAGE_KEYS.objects),
    entrances: readCollection<StoredEntranceRecord>(STORAGE_KEYS.entrances),
    projects: readCollection<StoredProjectRecord>(STORAGE_KEYS.projects),
    documents: getDocuments(),
    assignments: readJson<Record<string, string | null>>(STORAGE_KEYS.assignments, {})
  };
  try {
    writeJson(STORAGE_KEYS.reanalysisBackups, [backup]);
    return { id: backup.id, warning: null };
  } catch (error) {
    try {
      window.localStorage.removeItem(STORAGE_KEYS.reanalysisBackups);
    } catch {
      // Ignore cleanup failures; backup creation must never block the caller.
    }
    if (isStorageQuotaError(error)) {
      return {
        id: null,
        warning: "Automatisches Backup konnte wegen der Browser-Speichergrenze nicht erstellt werden."
      };
    }
    return {
      id: null,
      warning: "Automatisches Backup konnte nicht erstellt werden."
    };
  }
}

export function exportAppDataBackup(): AppDataBackup {
  return {
    version: 1,
    exportedAt: timestamp(),
    keys: {
      objects: readCollection<StoredObjectRecord>(STORAGE_KEYS.objects),
      entrances: readCollection<StoredEntranceRecord>(STORAGE_KEYS.entrances),
      projects: readCollection<StoredProjectRecord>(STORAGE_KEYS.projects),
      documents: getDocuments(),
      assignments: readJson<Record<string, string | null>>(STORAGE_KEYS.assignments, {})
    }
  };
}

export function importAppDataBackup(backup: unknown): AppDataSummary {
  const parsed = parseAppDataBackup(backup);
  createAnalysisBackup();
  writeJson(STORAGE_KEYS.objects, parsed.keys.objects);
  writeJson(STORAGE_KEYS.entrances, parsed.keys.entrances);
  writeJson(STORAGE_KEYS.projects, parsed.keys.projects);
  writeJson(STORAGE_KEYS.documents, parsed.keys.documents);
  writeJson(STORAGE_KEYS.assignments, parsed.keys.assignments);
  return summarizeAppDataBackup(parsed);
}

export function summarizeCurrentAppData(): AppDataSummary {
  return summarizeAppDataBackup(exportAppDataBackup());
}

export function summarizeAppDataBackupForImport(backup: unknown): AppDataSummary {
  return summarizeAppDataBackup(parseAppDataBackup(backup));
}

export function summarizeAppDataBackup(backup: AppDataBackup): AppDataSummary {
  return {
    objects: backup.keys.objects.length,
    entrances: backup.keys.entrances.length,
    projects: backup.keys.projects.length,
    documents: backup.keys.documents.length,
    assignments: Object.keys(backup.keys.assignments).length
  };
}

function parseAppDataBackup(value: unknown): AppDataBackup {
  if (!isRecord(value)) throw new Error("Die JSON-Datei ist kein gueltiges Backup-Objekt.");
  if (value.version !== 1) throw new Error("Die Backup-Version wird nicht unterstuetzt.");
  if (!isRecord(value.keys)) throw new Error("Im Backup fehlt der Bereich keys.");

  const keys = value.keys;
  const requiredArrays = ["objects", "entrances", "projects", "documents"] as const;
  requiredArrays.forEach((key) => {
    if (!Array.isArray(keys[key])) {
      throw new Error(`Im Backup fehlt der erwartete Array-Schluessel "${key}".`);
    }
  });
  if (!isRecord(keys.assignments)) {
    throw new Error('Im Backup fehlt der erwartete Objekt-Schluessel "assignments".');
  }

  return {
    version: 1,
    exportedAt: typeof value.exportedAt === "string" ? value.exportedAt : timestamp(),
    keys: {
      objects: keys.objects as StoredObjectRecord[],
      entrances: keys.entrances as StoredEntranceRecord[],
      projects: keys.projects as StoredProjectRecord[],
      documents: keys.documents as ObjectAnalysis[],
      assignments: keys.assignments as Record<string, string | null>
    }
  };
}

function dedupeStoredDocuments(documents: ObjectAnalysis[]): ObjectAnalysis[] {
  const byKey = new Map<string, ObjectAnalysis>();
  documents.forEach((document) => {
    const key = storedDocumentDedupeKey(document);
    const existing = byKey.get(key);
    if (!existing || storedDocumentCompletenessScore(document) > storedDocumentCompletenessScore(existing)) {
      byKey.set(key, document);
    }
  });
  return Array.from(byKey.values());
}

function storedDocumentDedupeKey(document: ObjectAnalysis): string {
  const sourceId = document.sourceDocumentIds?.[0]?.trim();
  if (sourceId) return `source:${sourceId.toLowerCase()}`;
  const documentNumber = stringFieldValue(document.documentNumber);
  const objectNumber = stringFieldValue(document.objectNumber);
  const address = stringFieldValue(document.objectAddress);
  const total = document.totalCost?.value ?? "";
  const fallback = [documentNumber, objectNumber || address, total].map((value) => String(value).trim().toLowerCase()).filter(Boolean).join("|");
  return fallback || `id:${document.id}`;
}

function storedDocumentCompletenessScore(document: ObjectAnalysis): number {
  return [
    document.clusters?.length ?? 0,
    document.measureDetails?.length ?? 0,
    document.totalCost?.value !== null ? 1 : 0,
    stringFieldValue(document.documentNumber) ? 1 : 0,
    stringFieldValue(document.objectNumber) ? 1 : 0,
    stringFieldValue(document.objectAddress) ? 1 : 0
  ].reduce((sum, value) => sum + Number(value), 0);
}

function stringFieldValue(field: { value: unknown } | null | undefined): string {
  if (!field || field.value === null || field.value === undefined) return "";
  if (Array.isArray(field.value)) return field.value.join(", ");
  return String(field.value);
}

function parseJsonSafely(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function countDocumentLikeEntries(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (!isRecord(value)) return 0;
  if (Array.isArray(value.documents)) return value.documents.length;
  if (isRecord(value.keys) && Array.isArray(value.keys.documents)) return value.keys.documents.length;
  if (Array.isArray(value.objects)) return value.objects.length;
  if (isRecord(value.analysis) && Array.isArray(value.analysis.objects)) return value.analysis.objects.length;
  return 0;
}

function describeStorageShape(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (!isRecord(value)) return typeof value;
  if (Array.isArray(value.documents)) return "object.documents";
  if (isRecord(value.keys) && Array.isArray(value.keys.documents)) return "backup.keys.documents";
  if (Array.isArray(value.objects)) return "object.objects";
  if (isRecord(value.analysis) && Array.isArray(value.analysis.objects)) return "analysis.objects";
  return "object";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function isStorageQuotaError(error: unknown): boolean {
  return error instanceof DOMException && (
    error.name === "QuotaExceededError" ||
    error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    error.code === 22 ||
    error.code === 1014
  );
}

function timestamp(): string {
  return new Date().toISOString();
}
