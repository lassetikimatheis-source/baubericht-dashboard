import type { ObjectAnalysis } from "../types/analysis";
import type { StoredEntranceRecord, StoredObjectRecord, StoredProjectRecord } from "./storage";

export interface NeonAppData {
  objects: StoredObjectRecord[];
  entrances: StoredEntranceRecord[];
  projects: StoredProjectRecord[];
  documents: ObjectAnalysis[];
  assignments: Record<string, string | null>;
  objectImages: Record<string, string[]>;
}

type NeonEntity = "object" | "entrance" | "project" | "document" | "assignments";

async function requestNeon<T>(body?: unknown): Promise<T> {
  const response = await fetch("/api/app-data", {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store"
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Neon-Anfrage fehlgeschlagen.");
  }
  return response.json() as Promise<T>;
}

export function loadNeonAppData(): Promise<NeonAppData> {
  return requestNeon<NeonAppData>();
}

export function saveNeonObject(object: StoredObjectRecord): Promise<StoredObjectRecord> {
  return requestNeon<StoredObjectRecord>({ entity: "object" satisfies NeonEntity, operation: "save", data: object });
}

export function deleteNeonObject(id: string): Promise<{ ok: true }> {
  return requestNeon<{ ok: true }>({ entity: "object" satisfies NeonEntity, operation: "delete", id });
}

export function saveNeonEntrance(entrance: StoredEntranceRecord): Promise<StoredEntranceRecord> {
  return requestNeon<StoredEntranceRecord>({ entity: "entrance" satisfies NeonEntity, operation: "save", data: entrance });
}

export function deleteNeonEntrance(id: string): Promise<{ ok: true }> {
  return requestNeon<{ ok: true }>({ entity: "entrance" satisfies NeonEntity, operation: "delete", id });
}

export function saveNeonProject(project: StoredProjectRecord): Promise<StoredProjectRecord> {
  return requestNeon<StoredProjectRecord>({ entity: "project" satisfies NeonEntity, operation: "save", data: project });
}

export function deleteNeonProject(id: string): Promise<{ ok: true }> {
  return requestNeon<{ ok: true }>({ entity: "project" satisfies NeonEntity, operation: "delete", id });
}

export function saveNeonDocument(document: ObjectAnalysis): Promise<ObjectAnalysis> {
  return requestNeon<ObjectAnalysis>({ entity: "document" satisfies NeonEntity, operation: "save", data: document });
}

export function deleteNeonDocument(id: string): Promise<{ ok: true }> {
  return requestNeon<{ ok: true }>({ entity: "document" satisfies NeonEntity, operation: "delete", id });
}

export function saveNeonAssignments(assignments: Record<string, string | null>): Promise<Record<string, string | null>> {
  return requestNeon<Record<string, string | null>>({ entity: "assignments" satisfies NeonEntity, operation: "save", data: assignments });
}

export function saveNeonObjectImages(objectImages: Record<string, string[]>): Promise<Record<string, string[]>> {
  return requestNeon<Record<string, string[]>>({ entity: "objectImages", operation: "save", data: objectImages });
}
