import { eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createDatabaseClient } from "../../../lib/db";
import { assignments, documents, entrances, objectImages, objects, projects } from "../../../lib/db/schema";
import type { ObjectAnalysis } from "../../../types/analysis";
import type { StoredEntranceRecord, StoredObjectRecord, StoredProjectRecord } from "../../../lib/storage";

export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function isoNow(): string {
  return new Date().toISOString();
}

function rowDate(value: unknown): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function objectToRow(object: StoredObjectRecord) {
  return {
    localObjectId: object.id,
    sourceObjectId: object.id,
    fund: object.fund || null,
    objectNumber: object.objectNumber || null,
    objectName: object.objectName || null,
    address: object.address || null,
    postalCode: object.postalCode || null,
    city: object.city || null,
    federalState: object.federalState || null,
    constructionYear: object.constructionYear || null,
    unitCount: numberOrNull(object.unitCount),
    totalLivingAreaSqm: object.totalLivingAreaSqm || null,
    renovatedLivingAreaSqm: object.wohnflaecheSanierteWohnung || null,
    energyClass: object.energyClass || null,
    assetManager: object.assetManager || null,
    portfolioManager: object.portfolioManager || null,
    latitude: object.latitude || null,
    longitude: object.longitude || null,
    metadata: {},
    updatedAt: new Date()
  };
}

function objectFromRow(row: typeof objects.$inferSelect): StoredObjectRecord {
  return {
    id: row.localObjectId ?? row.id,
    fund: row.fund ?? "",
    objectNumber: row.objectNumber ?? "",
    objectName: row.objectName ?? "",
    address: row.address ?? "",
    postalCode: row.postalCode ?? "",
    city: row.city ?? "",
    federalState: row.federalState ?? "",
    constructionYear: row.constructionYear ?? "",
    unitCount: row.unitCount == null ? "" : String(row.unitCount),
    totalLivingAreaSqm: row.totalLivingAreaSqm ?? "",
    wohnflaecheSanierteWohnung: row.renovatedLivingAreaSqm ?? "",
    energyClass: row.energyClass ?? "",
    assetManager: row.assetManager ?? "",
    portfolioManager: row.portfolioManager ?? "",
    latitude: row.latitude ?? "",
    longitude: row.longitude ?? "",
    createdAt: rowDate(row.createdAt),
    updatedAt: rowDate(row.updatedAt)
  };
}

function entranceToRow(entrance: StoredEntranceRecord, objectId: string | null) {
  return {
    objectId,
    localEntranceId: entrance.id,
    localObjectId: entrance.objectId || null,
    street: entrance.street || null,
    houseNumber: entrance.houseNumber || null,
    suffix: entrance.suffix || null,
    postalCode: entrance.postalCode || null,
    city: entrance.city || null,
    livingAreaSqm: entrance.livingAreaSqm || null,
    unitCount: numberOrNull(entrance.unitCount),
    metadata: {},
    updatedAt: new Date()
  };
}

function entranceFromRow(row: typeof entrances.$inferSelect): StoredEntranceRecord {
  return {
    id: row.localEntranceId ?? row.id,
    objectId: row.localObjectId ?? row.objectId ?? "",
    street: row.street ?? "",
    houseNumber: row.houseNumber ?? "",
    suffix: row.suffix ?? "",
    postalCode: row.postalCode ?? "",
    city: row.city ?? "",
    livingAreaSqm: row.livingAreaSqm ?? "",
    unitCount: row.unitCount == null ? "" : String(row.unitCount),
    createdAt: rowDate(row.createdAt),
    updatedAt: rowDate(row.updatedAt)
  };
}

function projectToRow(project: StoredProjectRecord, objectId: string | null, entranceId: string | null) {
  return {
    objectId,
    entranceId,
    localProjectId: project.id,
    sourceProjectId: project.id,
    localObjectId: project.objectId || null,
    localEntranceId: project.entranceId || null,
    projectName: project.projectName || null,
    projectType: project.projectType || null,
    fund: project.fund || null,
    objectLabel: project.object || null,
    entranceLabel: project.entrance || null,
    status: project.status || null,
    budgetNet: project.budgetNet || null,
    budgetGross: project.budgetGross || null,
    startDate: project.startDate || null,
    endDate: project.endDate || null,
    description: project.description || null,
    apartmentNumber: project.apartmentNumber || null,
    location: project.location || null,
    renovatedApartmentCount: numberOrNull(project.renovatedApartmentCount),
    livingAreaSqm: project.livingAreaSqm || null,
    metadata: {},
    updatedAt: new Date()
  };
}

function projectFromRow(row: typeof projects.$inferSelect): StoredProjectRecord {
  return {
    id: row.localProjectId ?? row.id,
    projectName: row.projectName ?? "",
    projectType: row.projectType ?? "",
    fund: row.fund ?? "",
    objectId: row.localObjectId ?? row.objectId ?? "",
    object: row.objectLabel ?? "",
    entranceId: row.localEntranceId ?? "",
    entrance: row.entranceLabel ?? "",
    status: row.status ?? "",
    budgetNet: row.budgetNet ?? "",
    budgetGross: row.budgetGross ?? "",
    startDate: row.startDate ?? "",
    endDate: row.endDate ?? "",
    description: row.description ?? "",
    apartmentNumber: row.apartmentNumber ?? "",
    location: row.location ?? "",
    renovatedApartmentCount: row.renovatedApartmentCount == null ? "" : String(row.renovatedApartmentCount),
    livingAreaSqm: row.livingAreaSqm ?? "",
    createdAt: rowDate(row.createdAt),
    updatedAt: rowDate(row.updatedAt)
  };
}

function fieldValue(document: ObjectAnalysis, key: keyof ObjectAnalysis): string | null {
  const value = document[key] as { value?: unknown } | undefined;
  const raw = value && typeof value === "object" && "value" in value ? value.value : null;
  return raw == null ? null : String(raw);
}

function numericFieldValue(document: ObjectAnalysis, key: keyof ObjectAnalysis): string | null {
  const value = document[key] as { value?: unknown } | undefined;
  const raw = value && typeof value === "object" && "value" in value ? value.value : null;
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  return null;
}

function documentToRow(document: ObjectAnalysis) {
  return {
    localDocumentId: document.id,
    sourceDocumentId: document.id,
    fileName: null,
    fileType: null,
    documentType: fieldValue(document, "documentType"),
    documentNumber: fieldValue(document, "documentNumber"),
    provider: fieldValue(document, "provider"),
    documentDate: fieldValue(document, "documentDate"),
    installmentNumber: fieldValue(document, "installmentNumber"),
    projectSuggestion: fieldValue(document, "projectSuggestion"),
    assignmentSuggestion: fieldValue(document, "assignmentSuggestion"),
    aiAgentName: fieldValue(document, "aiAgentName"),
    confidenceScore: numericFieldValue(document, "confidenceScore"),
    netCost: numericFieldValue(document, "netCost"),
    vatCost: numericFieldValue(document, "vatCost"),
    totalCost: numericFieldValue(document, "totalCost"),
    costPerApartment: numericFieldValue(document, "costPerApartment"),
    costPerSqm: numericFieldValue(document, "costPerSqm"),
    dataQuality: fieldValue(document, "dataQuality"),
    extractedData: document as unknown as JsonRecord,
    costDebug: document.costDebug as unknown as JsonRecord | null,
    measureDebug: document.measureDebug as unknown as JsonRecord | null,
    metadata: {},
    updatedAt: new Date()
  };
}

function documentFromRow(row: typeof documents.$inferSelect): ObjectAnalysis | null {
  const data = row.extractedData as ObjectAnalysis | null;
  return data && typeof data === "object" ? data : null;
}

async function resolveObjectUuid(database: ReturnType<typeof createDatabaseClient>, localObjectId?: string | null): Promise<string | null> {
  if (!localObjectId) return null;
  const [row] = await database.select({ id: objects.id }).from(objects).where(eq(objects.localObjectId, localObjectId)).limit(1);
  return row?.id ?? null;
}

async function resolveEntranceUuid(database: ReturnType<typeof createDatabaseClient>, localEntranceId?: string | null): Promise<string | null> {
  if (!localEntranceId) return null;
  const [row] = await database.select({ id: entrances.id }).from(entrances).where(eq(entrances.localEntranceId, localEntranceId)).limit(1);
  return row?.id ?? null;
}

async function loadAppData() {
  const database = createDatabaseClient();
  const [objectRows, entranceRows, projectRows, documentRows, assignmentRows, imageRows] = await Promise.all([
    database.select().from(objects),
    database.select().from(entrances),
    database.select().from(projects),
    database.select().from(documents),
    database.select().from(assignments),
    database.select().from(objectImages)
  ]);

  const loadedAssignments: Record<string, string | null> = {};
  assignmentRows.forEach((row) => {
    const documentId = row.localDocumentId;
    if (!documentId) return;
    loadedAssignments[documentId] = row.localProjectId ?? null;
  });

  const loadedImages: Record<string, string[]> = {};
  imageRows.forEach((row) => {
    const objectId = row.localObjectId ?? row.objectId;
    if (!objectId) return;
    loadedImages[objectId] = [...(loadedImages[objectId] ?? []), row.url];
  });

  return {
    objects: objectRows.map(objectFromRow),
    entrances: entranceRows.map(entranceFromRow),
    projects: projectRows.map(projectFromRow),
    documents: documentRows.map(documentFromRow).filter((document): document is ObjectAnalysis => Boolean(document)),
    assignments: loadedAssignments,
    objectImages: loadedImages
  };
}

async function saveObjectRecord(data: StoredObjectRecord) {
  const database = createDatabaseClient();
  const now = isoNow();
  const next = { ...data, createdAt: data.createdAt ?? now, updatedAt: now };
  await database.insert(objects).values(objectToRow(next)).onConflictDoUpdate({
    target: objects.localObjectId,
    set: objectToRow(next)
  });
  return next;
}

async function saveEntranceRecord(data: StoredEntranceRecord) {
  const database = createDatabaseClient();
  const now = isoNow();
  const next = { ...data, createdAt: data.createdAt ?? now, updatedAt: now };
  const objectId = await resolveObjectUuid(database, next.objectId);
  await database.insert(entrances).values(entranceToRow(next, objectId)).onConflictDoUpdate({
    target: entrances.localEntranceId,
    set: entranceToRow(next, objectId)
  });
  return next;
}

async function saveProjectRecord(data: StoredProjectRecord) {
  const database = createDatabaseClient();
  const now = isoNow();
  const next = { ...data, createdAt: data.createdAt ?? now, updatedAt: now };
  const [objectId, entranceId] = await Promise.all([
    resolveObjectUuid(database, next.objectId),
    resolveEntranceUuid(database, next.entranceId)
  ]);
  await database.insert(projects).values(projectToRow(next, objectId, entranceId)).onConflictDoUpdate({
    target: projects.localProjectId,
    set: projectToRow(next, objectId, entranceId)
  });
  return next;
}

async function saveDocumentRecord(data: ObjectAnalysis) {
  const database = createDatabaseClient();
  await database.insert(documents).values(documentToRow(data)).onConflictDoUpdate({
    target: documents.localDocumentId,
    set: documentToRow(data)
  });
  return data;
}

async function saveAssignmentRecord(data: Record<string, string | null>) {
  const database = createDatabaseClient();
  await database.delete(assignments);
  const rows = Object.entries(data).map(([documentId, projectId]) => ({
    localAssignmentId: `assignment-${documentId}`,
    localDocumentId: documentId,
    localProjectId: projectId,
    data: { documentId, projectId },
    metadata: {},
    updatedAt: new Date()
  }));
  if (rows.length) await database.insert(assignments).values(rows);
  return data;
}

async function saveObjectImagesRecord(data: Record<string, string[]>) {
  const database = createDatabaseClient();
  await database.delete(objectImages);
  const rows: Array<typeof objectImages.$inferInsert> = [];
  for (const [localObjectId, urls] of Object.entries(data)) {
    const objectId = await resolveObjectUuid(database, localObjectId);
    urls.forEach((url, index) => {
      rows.push({
        objectId,
        localImageId: `image-${localObjectId}-${index}`,
        localObjectId,
        url,
        imageUrl: url,
        sortOrder: index,
        metadata: {},
        updatedAt: new Date()
      });
    });
  }
  if (rows.length) await database.insert(objectImages).values(rows);
  return data;
}

export async function GET() {
  try {
    return NextResponse.json(await loadAppData());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Neon-Daten konnten nicht geladen werden." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const entity = text(body.entity);
    const operation = text(body.operation);
    const id = text(body.id);

    if (entity === "object" && operation === "save") return NextResponse.json(await saveObjectRecord(body.data));
    if (entity === "entrance" && operation === "save") return NextResponse.json(await saveEntranceRecord(body.data));
    if (entity === "project" && operation === "save") return NextResponse.json(await saveProjectRecord(body.data));
    if (entity === "document" && operation === "save") return NextResponse.json(await saveDocumentRecord(body.data));
    if (entity === "assignments" && operation === "save") return NextResponse.json(await saveAssignmentRecord(body.data));
    if (entity === "objectImages" && operation === "save") return NextResponse.json(await saveObjectImagesRecord(body.data));

    const database = createDatabaseClient();
    if (entity === "object" && operation === "delete") {
      await database.delete(objects).where(eq(objects.localObjectId, id));
      return NextResponse.json({ ok: true });
    }
    if (entity === "entrance" && operation === "delete") {
      await database.delete(entrances).where(eq(entrances.localEntranceId, id));
      return NextResponse.json({ ok: true });
    }
    if (entity === "project" && operation === "delete") {
      await database.delete(projects).where(eq(projects.localProjectId, id));
      return NextResponse.json({ ok: true });
    }
    if (entity === "document" && operation === "delete") {
      await database.delete(documents).where(eq(documents.localDocumentId, id));
      await database.delete(assignments).where(eq(assignments.localDocumentId, id));
      return NextResponse.json({ ok: true });
    }
    if (entity === "assignments" && operation === "deleteDocument") {
      await database.delete(assignments).where(eq(assignments.localDocumentId, id));
      return NextResponse.json({ ok: true });
    }
    if (entity === "assignments" && operation === "clearProjects") {
      const projectIds = Array.isArray(body.projectIds) ? body.projectIds.map(text).filter(Boolean) : [];
      if (projectIds.length) {
        await database.delete(assignments).where(inArray(assignments.localProjectId, projectIds));
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unbekannte Neon-Operation." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Neon-Daten konnten nicht gespeichert werden." }, { status: 500 });
  }
}
