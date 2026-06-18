import type { ObjectAnalysis } from "../types/analysis";

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
  assignments: "paribus-baukosten.assignments.v1"
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
  return readCollection<StoredObjectRecord>(STORAGE_KEYS.objects);
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
  upsertItem(STORAGE_KEYS.documents, document);
  return document;
}

export function updateDocument(document: ObjectAnalysis): ObjectAnalysis {
  upsertItem(STORAGE_KEYS.documents, document);
  return document;
}

export function deleteDocument(id: string): void {
  deleteItem(STORAGE_KEYS.documents, id);
}

export function getDocuments(): ObjectAnalysis[] {
  return readCollection<ObjectAnalysis>(STORAGE_KEYS.documents);
}

export function saveAssignments(assignments: Record<string, string | null>): void {
  writeJson(STORAGE_KEYS.assignments, assignments);
}

export function getAssignments(): Record<string, string | null> {
  return readJson<Record<string, string | null>>(STORAGE_KEYS.assignments, {});
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

function timestamp(): string {
  return new Date().toISOString();
}
