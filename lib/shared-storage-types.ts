import type { ObjectAnalysis } from "../types/analysis";
import type { StoredEntranceRecord, StoredObjectRecord, StoredProjectRecord } from "./storage";

export interface SharedStorageSnapshot {
  objects: StoredObjectRecord[];
  entrances: StoredEntranceRecord[];
  projects: StoredProjectRecord[];
  documents: ObjectAnalysis[];
  assignments: Record<string, string | null>;
  objectImages: Record<string, string[]>;
}

export type SharedCollectionName =
  | "objects"
  | "entrances"
  | "projects"
  | "documents"
  | "assignments"
  | "objectImages";

