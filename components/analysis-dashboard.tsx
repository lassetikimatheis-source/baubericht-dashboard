"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { UploadPanel } from "./upload-panel";
import type { ObjectMapEntry } from "./map/ObjectMap";
import { TradeCostBarChart, type TradeCostChartRow } from "./charts/TradeCostBarChart";
import { emptyAnalysisState, emptyField } from "../lib/analysis-state";
import { fieldOrUnknown, formatCurrency, formatNumber, formatSqm, sourceLabel, unwrap } from "../lib/format";
import {
  deleteDocument as deleteStoredDocument,
  deleteEntrance as deleteStoredEntrance,
  deleteObject as deleteStoredObject,
  deleteProject as deleteStoredProject,
  getAssignments,
  getDocuments,
  getEntrances,
  getObjects,
  getProjects,
  saveAssignments,
  saveDocument,
  saveEntrance,
  saveObject,
  saveProject,
  updateDocument as updateStoredDocument,
  updateEntrance as updateStoredEntrance,
  updateObject as updateStoredObject,
  updateProject as updateStoredProject,
  type StoredEntranceRecord,
  type StoredObjectRecord,
  type StoredProjectRecord
} from "../lib/storage";
import type { CostAllocation, ExtractedField, MeasureCluster, ObjectAnalysis, PortfolioAnalysisState, SourceDocument } from "../types/analysis";

const ObjectMap = dynamic<{ entries: ObjectMapEntry[]; onOpenObject: (id: string) => void }>(
  () => import("./map/ObjectMap").then((module) => module.ObjectMap),
  {
  ssr: false,
  loading: () => <div className="mapEmpty">Karte wird geladen...</div>
  }
);

type ViewKey = "dashboard" | "objects" | "map" | "upload" | "projects" | "unassigned" | "reports" | "settings";
type ProjectTab = "overview" | "documents" | "costs" | "measures" | "ai";
type ObjectTab = "overview" | "measures" | "trades" | "documents" | "images" | "apartments" | "entrances" | "ai";
type OverviewGroup = "object" | "entrance" | "project" | "document";
type CostViewMode = "comparison" | "offers" | "invoices";
type CostBasisMode =
  | "all"
  | "offers"
  | "orders"
  | "incomingInvoices"
  | "progressInvoices"
  | "finalInvoices"
  | "finalOnly"
  | "withoutProgress"
  | "manual";
interface ObjectPageFilters {
  year: string;
  trade: string;
  documentType: string;
  object: string;
}
type TextFieldKey =
  | "fund"
  | "objectNumber"
  | "objectAddress"
  | "projectType"
  | "documentType"
  | "provider"
  | "documentNumber"
  | "documentDate"
  | "apartmentNumber"
  | "location"
  | "measureDescription"
  | "dataQuality"
  | "projectSuggestion"
  | "assignmentSuggestion";
type NumberFieldKey =
  | "year"
  | "renovatedApartmentCount"
  | "livingAreaSqm"
  | "netCost"
  | "vatCost"
  | "totalCost"
  | "confidenceScore";

interface ParsedPreview {
  id: string;
  fileName: string;
  fileType: string;
  textLength: number;
  preview: string;
  issues: string[];
}

type ObjectRecord = StoredObjectRecord;
type EntranceRecord = StoredEntranceRecord;
type ProjectRecord = StoredProjectRecord;
type UploadPhase = "idle" | "selected" | "analyzing" | "analyzed";

interface UploadObjectDraft extends ObjectRecord {
  year: string;
  trade: string;
  totalCost: string;
  apartmentCount: string;
  costPerApartment: string;
  costPerSqm: string;
  sourceFile: string;
}

interface Filters {
  year: string;
  fund: string;
  object: string;
  objectNumber: string;
  address: string;
  project: string;
  projectType: string;
  documentType: string;
  provider: string;
  apartmentNumber: string;
  location: string;
  cluster: string;
  dataQuality: string;
  status: string;
}

interface KpiShape {
  gross: number | null;
  net: number | null;
  objects: number;
  projects: number;
  documents: number;
  apartments: number | null;
  costPerApartment: number | null;
  costPerSqm: number | null;
  reviewCases: number;
  unknownFields: number;
}

interface ProjectCostSummary {
  offersNet: number | null;
  offersGross: number | null;
  progressNet: number | null;
  progressGross: number | null;
  invoicesNet: number | null;
  invoicesGross: number | null;
  supplementsNet: number | null;
  supplementsGross: number | null;
  finalInvoicesNet: number | null;
  finalInvoicesGross: number | null;
  offerToInvoiceDelta: number | null;
  budgetToActualDelta: number | null;
  costPerApartment: number | null;
  costPerSqm: number | null;
}

interface OverviewRow {
  id: string;
  level: string;
  objectNumber: string;
  addressRange: string;
  economicUnit: string;
  entrance: string;
  apartments: string;
  renovatedCount: number | null;
  clusters: string;
  description: string;
  netCost: number | null;
  grossCost: number | null;
  costPerRenovatedUnit: number | null;
  costPerSqm: number | null;
  documentCount: number;
  dataQuality: string;
  documentId?: string;
}

interface MeasureRow {
  id: string;
  documentId: string;
  measureId: string;
  cluster: string;
  description: string;
  netCost: number | null;
  vatCost: number | null;
  grossCost: number | null;
  source: string;
  status: string;
  section: string;
  confidence: string;
  lineItems: LineItemView[];
}

interface TradeGroupRow {
  cluster: MeasureCluster;
  count: number;
  total: number;
  offer: number;
  invoice: number;
  share: number | null;
  status: string;
}

interface TradeAllocation {
  cluster: MeasureCluster;
  value: number | null;
  document: ObjectAnalysis;
}

interface LineItemView {
  position: string;
  description: string | null;
  totalPrice: number | null;
}

interface MapEntry {
  key: string;
  objectId: string;
  title: string;
  objectNumber: string;
  address: string;
  fund: string;
  projectCount: number;
  documents: ObjectAnalysis[];
  totalCost: number | null;
  latitude: number | null;
  longitude: number | null;
}


const emptyFilters: Filters = {
  year: "",
  fund: "",
  object: "",
  objectNumber: "",
  address: "",
  project: "",
  projectType: "",
  documentType: "",
  provider: "",
  apartmentNumber: "",
  location: "",
  cluster: "",
  dataQuality: "",
  status: ""
};

const navItems: Array<{ key: ViewKey; label: string; locked?: boolean }> = [
  { key: "dashboard", label: "Dashboard", locked: true },
  { key: "map", label: "Karte", locked: true },
  { key: "objects", label: "Objekte" },
  { key: "upload", label: "Dokumente" },
  { key: "reports", label: "Auswertungen" },
  { key: "unassigned", label: "KI Analyse" },
  { key: "settings", label: "Einstellungen" }
];

const projectTabs: Array<{ key: ProjectTab; label: string }> = [
  { key: "overview", label: "Übersicht" },
  { key: "documents", label: "Dokumente" },
  { key: "costs", label: "Kosten" },
  { key: "measures", label: "Maßnahmen" },
  { key: "ai", label: "KI-Prüfung" }
];

const objectTabs: Array<{ key: ObjectTab; label: string }> = [
  { key: "overview", label: "Übersicht" },
  { key: "measures", label: "Maßnahmen" },
  { key: "trades", label: "Gewerke" },
  { key: "documents", label: "Dokumente" },
  { key: "images", label: "Bilder" },
  { key: "apartments", label: "Wohnungen" },
  { key: "entrances", label: "Häuser / Hauseingänge" },
  { key: "ai", label: "KI-Auswertung" }
];

const costBasisOptions: Array<{ value: CostBasisMode; label: string }> = [
  { value: "all", label: "Alle Dokumente" },
  { value: "offers", label: "Nur Angebote" },
  { value: "orders", label: "Nur Aufträge" },
  { value: "incomingInvoices", label: "Nur Eingangsrechnungen" },
  { value: "progressInvoices", label: "Nur Abschlagsrechnungen" },
  { value: "finalInvoices", label: "Nur Schlussrechnungen" },
  { value: "finalOnly", label: "Nur finale Rechnungen" },
  { value: "withoutProgress", label: "Ohne Abschlagsrechnungen" },
  { value: "manual", label: "Manuelle Auswahl" }
];

const emptyObjectPageFilters: ObjectPageFilters = {
  year: "",
  trade: "",
  documentType: "",
  object: ""
};

const standardTradeCatalog: MeasureCluster[] = [
  "Dach",
  "Fassade",
  "Fenster",
  "Türen",
  "Balkone",
  "Heizung",
  "Sanitär",
  "Elektro",
  "Brandschutz",
  "Aufzüge",
  "Treppenhäuser",
  "Keller",
  "Außenanlagen",
  "Tiefgarage",
  "Malerarbeiten",
  "Bodenbeläge",
  "Trockenbau",
  "Dachentwässerung",
  "Wärmedämmung",
  "Schornstein",
  "Trinkwasser",
  "Abwasser",
  "Lüftung",
  "Photovoltaik",
  "Sonstiges"
];

export function AnalysisDashboard() {
  const [analysis, setAnalysis] = useState<PortfolioAnalysisState>(emptyAnalysisState);
  const [view, setView] = useState<ViewKey>("objects");
  const [objects, setObjects] = useState<ObjectRecord[]>([]);
  const [entrances, setEntrances] = useState<EntranceRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [objectImages, setObjectImages] = useState<Record<string, string[]>>({});
  const [assignments, setAssignments] = useState<Record<string, string | null>>({});
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [objectTab, setObjectTab] = useState<ObjectTab>("overview");
  const [overviewGroup, setOverviewGroup] = useState<OverviewGroup>("object");
  const [projectTab, setProjectTab] = useState<ProjectTab>("overview");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [previews, setPreviews] = useState<ParsedPreview[]>([]);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [uploadDocument, setUploadDocument] = useState<ObjectAnalysis | null>(null);
  const [uploadDocuments, setUploadDocuments] = useState<ObjectAnalysis[]>([]);
  const [objectDraft, setObjectDraft] = useState<UploadObjectDraft>(() => uploadDraftFromDocument());
  const [uploadSourceDocument, setUploadSourceDocument] = useState<SourceDocument | null>(null);
  const [uploadSourceDocuments, setUploadSourceDocuments] = useState<SourceDocument[]>([]);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>("idle");
  const [uploadedFileName, setUploadedFileName] = useState("");

  useEffect(() => {
    const storedObjects = getObjects();
    const storedEntrances = getEntrances();
    const storedProjects = getProjects();
    const storedDocuments = getDocuments();
    const storedAssignments = getAssignments();

    setObjects(storedObjects);
    setEntrances(storedEntrances);
    setProjects(storedProjects);
    setAssignments(storedAssignments);
    setAnalysis(buildAnalysisFromDocuments(storedDocuments));
    setSelectedObjectId(storedObjects[0]?.id ?? null);
    setSelectedProjectId(storedProjects[0]?.id ?? null);
    setSelectedDocumentId(storedDocuments[0]?.id ?? null);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || objects.length === 0) return;
    const match = window.location.pathname.match(/^\/objekte\/([^/]+)/);
    if (!match) return;
    const requested = decodeURIComponent(match[1]);
    const object = objects.find((entry) => objectSlug(entry) === requested || entry.objectNumber === requested || entry.id === requested);
    if (!object) return;
    setSelectedObjectId(object.id);
    setObjectTab("overview");
    setView("objects");
  }, [objects]);

  const filteredDocuments = useMemo(() => {
    return analysis.objects.filter((document) => matchesFilters(document, filters, projects, assignments));
  }, [analysis.objects, assignments, filters, projects]);

  const selectedDocument = useMemo(() => {
    const visibleDocument = filteredDocuments.find((document) => document.id === selectedDocumentId) ?? filteredDocuments[0] ?? null;
    if (visibleDocument || hasFilters(filters)) return visibleDocument;
    return analysis.objects.find((document) => document.id === selectedDocumentId) ?? null;
  }, [analysis.objects, filteredDocuments, filters, selectedDocumentId]);

  const selectedProject = useMemo(() => {
    return projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? null;
  }, [projects, selectedProjectId]);

  const selectedObject = useMemo(() => {
    if (!selectedObjectId) return null;
    return objects.find((object) => object.id === selectedObjectId) ?? null;
  }, [objects, selectedObjectId]);

  const unassignedDocuments = filteredDocuments.filter((document) => !assignments[document.id]);
  const selectedProjectDocuments = selectedProject
    ? filteredDocuments.filter((document) => assignments[document.id] === selectedProject.id)
    : [];

  const kpis = useMemo<KpiShape>(() => {
    const gross = sumValues(filteredDocuments.map((document) => document.totalCost.value));
    const net = sumValues(filteredDocuments.map((document) => document.netCost.value));
    const apartments = sumValues(filteredDocuments.map((document) => document.renovatedApartmentCount.value));
    const area = sumValues(objects.map((object) => parseGermanNumber(object.wohnflaecheSanierteWohnung ?? "")));
    const hasActiveFilters = hasFilters(filters);
    const projectCount = hasActiveFilters
      ? new Set(filteredDocuments.map((document) => assignments[document.id]).filter(Boolean)).size
      : projects.length;
    const objectKeys = hasActiveFilters
      ? filteredDocuments.map((document) => document.objectNumber.value || document.objectAddress.value || document.id)
      : [
          ...objects.map((object) => object.objectNumber || object.address || object.id),
          ...filteredDocuments.map((document) => document.objectNumber.value || document.objectAddress.value || document.id)
        ];
    const objectCount = new Set(objectKeys).size;

    return {
      gross,
      net,
      objects: objectCount,
      projects: projectCount,
      documents: filteredDocuments.length,
      apartments,
      costPerApartment: gross !== null && apartments ? gross / apartments : null,
      costPerSqm: gross !== null && area ? roundMoney(gross / area) : null,
      reviewCases: countReviewCases(filteredDocuments),
      unknownFields: countUnknownFields(filteredDocuments)
    };
  }, [assignments, filteredDocuments, filters, objects, projects.length]);

  async function handleAnalyze(files: File[]) {
    setIsAnalyzing(true);
    setMessage(null);
    setUploadDocument(null);
    setUploadDocuments([]);
    setUploadSourceDocument(null);
    setUploadSourceDocuments([]);
    setObjectDraft(uploadDraftFromDocument(undefined, uploadSourceName(files)));
    setUploadPhase("analyzing");
    setSelectedObjectId(null);
    setSelectedDocumentId(null);

    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.message || "Analyse fehlgeschlagen.");
      }

      const mergedDocuments = mergeDocumentsPreferManual(getDocuments(), data.analysis.objects);
      mergedDocuments.forEach(saveDocument);
      const currentDocument = data.analysis.objects[0] ?? null;
      const currentSourceDocument = data.analysis.sourceDocuments?.[0] ?? null;
      const nextDraft = uploadDraftFromDocument(currentDocument ?? undefined, uploadSourceName(files));
      setAnalysis(buildAnalysisFromDocuments(mergedDocuments, data.analysis));
      setUploadDocument(currentDocument);
      setUploadDocuments(data.analysis.objects ?? []);
      setUploadSourceDocument(currentSourceDocument);
      setUploadSourceDocuments(data.analysis.sourceDocuments ?? []);
      setObjectDraft(nextDraft);
      setUploadPhase("analyzed");
      setSelectedDocumentId(currentDocument?.id ?? null);
      setAssignments((current) => {
        const next = autoAssignDocuments(mergedDocuments, projects, current);
        saveAssignments(next);
        return next;
      });
      const analyzedCount = (data.analysis.objects ?? []).length;
      setMessage(hasRecognizedUploadValues(nextDraft) ? `${formatNumber(analyzedCount)} Dokument(e) analysiert - bitte Daten prüfen.` : "Analyse abgeschlossen - keine Werte erkannt. Bitte manuell ergänzen.");
    } catch (error) {
      setUploadPhase(files.length > 0 ? "selected" : "idle");
      setMessage(error instanceof Error ? error.message : "Analyse fehlgeschlagen.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  function handleFilesSelected(files: File[]) {
    setMessage(null);
    setPreviews([]);
    setUploadDocument(null);
    setUploadDocuments([]);
    setUploadSourceDocument(null);
    setUploadSourceDocuments([]);
    setSelectedDocumentId(null);
    setSelectedObjectId(null);
    setUploadedFileName(uploadSourceName(files));
    setObjectDraft(uploadDraftFromDocument(undefined, uploadSourceName(files)));
    setUploadPhase(files.length > 0 ? "selected" : "idle");
  }

  async function handlePreview(files: File[]) {
    setMessage(null);
    handleFilesSelected(files);
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    const response = await fetch("/api/parse-preview", {
      method: "POST",
      body: formData
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      setMessage(data.message || "Textvorschau fehlgeschlagen.");
      return;
    }
    setPreviews(data.documents);
    setMessage("Textvorschau erstellt.");
  }

  async function exportFile(type: "excel" | "pdf") {
    const response = await fetch(`/api/export/${type}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(analysis)
    });

    if (!response.ok) {
      setMessage("Export fehlgeschlagen.");
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = type === "excel" ? "paribus-baukosten-analyse.xlsx" : "paribus-baukosten-analyse.pdf";
    link.click();
    URL.revokeObjectURL(url);
  }

  function createObject(seed?: ObjectAnalysis) {
    const object = saveObject(objectFromDocument(seed));
    setObjects((current) => [...current.filter((entry) => entry.id !== object.id), object]);
    setSelectedObjectId(object.id);
    setView("objects");
  }

  function saveUploadObject() {
    const object = saveObject(uploadDraftToObjectRecord(objectDraft, `object-${Date.now()}`));
    const documentsToAssign = uploadDocuments.length ? uploadDocuments : uploadDocument ? [uploadDocument] : [];
    const createdProjects = documentsToAssign.map((document, index) => saveProject({
      ...projectFromDocument(document, objects),
      id: `project-${Date.now()}-${index}`,
      objectId: object.id,
      object: objectLabel(object),
      projectName: fieldOrUnknown(document.projectSuggestion) !== "k.A." ? fieldOrUnknown(document.projectSuggestion) : `Dokument ${fieldOrUnknown(document.documentNumber)}`
    }));
    setObjects((current) => [...current, object]);
    setProjects((current) => [...current, ...createdProjects]);
    if (documentsToAssign.length) {
      setAssignments((current) => {
        const next = { ...current };
        documentsToAssign.forEach((document, index) => {
          next[document.id] = createdProjects[index]?.id ?? null;
        });
        saveAssignments(next);
        return next;
      });
    }
    setSelectedObjectId(object.id);
    setUploadDocument(null);
    setUploadDocuments([]);
    setUploadSourceDocument(null);
    setUploadSourceDocuments([]);
    setObjectDraft(uploadDraftFromDocument());
    setUploadPhase("idle");
    setUploadedFileName("");
    setObjectTab("overview");
    setView("objects");
  }

  function assignUploadDocumentToObject(objectId: string) {
    const documentsToAssign = uploadDocuments.length ? uploadDocuments : uploadDocument ? [uploadDocument] : [];
    if (!documentsToAssign.length) return;
    const object = objects.find((entry) => entry.id === objectId);
    if (!object) return;
    const createdProjects = documentsToAssign.map((document, index) => saveProject({
      ...projectFromDocument(document, objects),
      id: `project-${Date.now()}-${index}`,
      objectId: object.id,
      object: objectLabel(object),
      projectName: fieldOrUnknown(document.projectSuggestion) !== "k.A." ? fieldOrUnknown(document.projectSuggestion) : `Dokument ${fieldOrUnknown(document.documentNumber)}`
    }));
    setProjects((current) => [...current, ...createdProjects]);
    setAssignments((current) => {
      const next = { ...current };
      documentsToAssign.forEach((document, index) => {
        next[document.id] = createdProjects[index]?.id ?? null;
      });
      saveAssignments(next);
      return next;
    });
    setSelectedObjectId(object.id);
    setUploadDocument(null);
    setUploadDocuments([]);
    setUploadSourceDocument(null);
    setUploadSourceDocuments([]);
    setObjectDraft(uploadDraftFromDocument());
    setUploadPhase("idle");
    setUploadedFileName("");
    setObjectTab("documents");
    setView("objects");
  }

  function updateObject(objectId: string, field: keyof ObjectRecord, value: string) {
    setObjects((current) => current.map((object) => {
      if (object.id !== objectId) return object;
      return updateStoredObject({ ...object, [field]: value });
    }));
  }

  function deleteObject(objectId: string) {
    deleteStoredObject(objectId);
    entrances.filter((entrance) => entrance.objectId === objectId).forEach((entrance) => deleteStoredEntrance(entrance.id));
    setObjects((current) => current.filter((object) => object.id !== objectId));
    setEntrances((current) => current.filter((entrance) => entrance.objectId !== objectId));
    setProjects((current) => current.map((project) => {
      if (project.objectId !== objectId) return project;
      return updateStoredProject({ ...project, objectId: "", object: "", entranceId: "", entrance: "" });
    }));
    setSelectedObjectId(null);
  }

  function createEntrance(objectId: string) {
    const entrance = saveEntrance(emptyEntrance(objectId));
    setEntrances((current) => [...current.filter((entry) => entry.id !== entrance.id), entrance]);
    setObjectTab("entrances");
  }

  function updateEntrance(entranceId: string, field: keyof EntranceRecord, value: string) {
    let updatedEntrance: EntranceRecord | null = null;
    setEntrances((current) => current.map((entrance) => {
      if (entrance.id !== entranceId) return entrance;
      const updated = updateStoredEntrance({ ...entrance, [field]: value });
      updatedEntrance = updated;
      return updated;
    }));
    if (updatedEntrance) {
      const entranceName = entranceLabel(updatedEntrance);
      setProjects((current) => current.map((project) => {
        if (project.entranceId !== entranceId) return project;
        return updateStoredProject({ ...project, entrance: entranceName });
      }));
    }
  }

  function deleteEntrance(entranceId: string) {
    deleteStoredEntrance(entranceId);
    setEntrances((current) => current.filter((entrance) => entrance.id !== entranceId));
    setProjects((current) => current.map((project) => {
      if (project.entranceId !== entranceId) return project;
      return updateStoredProject({ ...project, entranceId: "", entrance: "" });
    }));
  }

  function createProject(seed?: ObjectAnalysis) {
    const project = saveProject(projectFromDocument(seed, objects));
    setProjects((current) => [...current.filter((entry) => entry.id !== project.id), project]);
    setSelectedProjectId(project.id);
    setProjectTab("overview");
    if (seed) {
      setAssignments((current) => {
        const next = { ...current, [seed.id]: project.id };
        saveAssignments(next);
        return next;
      });
      setSelectedDocumentId(seed.id);
    }
    setView("projects");
  }

  function deleteProject(projectId: string) {
    deleteStoredProject(projectId);
    setProjects((current) => current.filter((project) => project.id !== projectId));
    setAssignments((current) => {
      const next = { ...current };
      Object.keys(next).forEach((documentId) => {
        if (next[documentId] === projectId) next[documentId] = null;
      });
      saveAssignments(next);
      return next;
    });
    setSelectedProjectId(null);
  }

  function updateProject(projectId: string, field: keyof ProjectRecord, value: string) {
    setProjects((current) =>
      current.map((project) => {
        if (project.id !== projectId) return project;
        if (field === "objectId") {
          const object = objects.find((entry) => entry.id === value);
          return updateStoredProject({ ...project, objectId: value, object: object ? objectLabel(object) : "", entranceId: "", entrance: "" });
        }
        if (field === "entranceId") {
          const entrance = entrances.find((entry) => entry.id === value);
          return updateStoredProject({ ...project, entranceId: value, entrance: entrance ? entranceLabel(entrance) : "" });
        }
        return updateStoredProject({ ...project, [field]: value });
      })
    );
  }

  function updateDocument(documentId: string, updater: (document: ObjectAnalysis) => ObjectAnalysis) {
    setAnalysis((current) => {
      const documents = current.objects.map((document) => document.id === documentId ? updateStoredDocument(updater(document)) : document);
      return buildAnalysisFromDocuments(documents, current);
    });
  }

  function deleteDocument(documentId: string) {
    deleteStoredDocument(documentId);
    setAnalysis((current) => buildAnalysisFromDocuments(current.objects.filter((document) => document.id !== documentId), current));
    setAssignments((current) => {
      const next = { ...current };
      delete next[documentId];
      saveAssignments(next);
      return next;
    });
    setSelectedDocumentId(null);
  }

  function assignDocument(documentId: string, projectId: string | null) {
    setAssignments((current) => {
      const next = { ...current, [documentId]: projectId };
      saveAssignments(next);
      return next;
    });
  }

  function openObjectDetail(objectId: string) {
    const object = objects.find((entry) => entry.id === objectId);
    setSelectedObjectId(objectId);
    setObjectTab("overview");
    setView("objects");
    if (typeof window !== "undefined" && object) {
      window.history.pushState({}, "", `/objekte/${objectSlug(object)}`);
    }
  }

  const pageTitle = getPageTitle(view);
  const showDocumentEditor = view === "projects" || view === "unassigned" || view === "reports" || view === "settings";
  const showUploadPanel = view === "upload";

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">P</div>
          <div>
            <strong>PARIBUS</strong>
            <span>Asset Management</span>
          </div>
        </div>
        <nav className="nav">
          {navItems.map((item) => (
            <button
              key={item.key}
              className={[
                "navButton",
                view === item.key ? "navButtonActive" : "",
                item.locked ? "navButtonLocked" : ""
              ].filter(Boolean).join(" ")}
              type="button"
              disabled={item.locked}
              aria-disabled={item.locked}
              title={item.locked ? "Dieser Bereich ist gesperrt" : item.label}
              onClick={() => {
                if (!item.locked) setView(item.key);
              }}
              >
              <span>{item.label}</span>
              {item.locked ? <span className="navLock" aria-hidden="true">🔒</span> : null}
            </button>
          ))}
        </nav>
        <div className="sideNote">
          <span>Struktur</span>
          <strong>Fonds - Objekt - Hauseingang - Projekt - Dokumente</strong>
          <p>Keine einzelne Wohnungsverwaltung in diesem Schritt.</p>
        </div>
      </aside>

      <section className="content appWorkspace">
        <header className="pageHeader">
          <div>
            <p className="eyebrow">PARIBUS Asset Management</p>
            <h1>{pageTitle}</h1>
            <p className="muted">Objekte, Projekte, Dokumente und Baukosten strukturiert auswerten.</p>
          </div>
          <div className="headerActions">
            <button type="button" onClick={() => exportFile("excel")}>Export Excel</button>
            <button type="button" onClick={() => exportFile("pdf")}>Export PDF</button>
            <button className="buttonPrimary" type="button" onClick={() => setView("upload")}>+ Dokument hochladen</button>
          </div>
        </header>

        {view === "dashboard" ? (
          <DashboardView
            kpis={kpis}
            objects={objects}
            entrances={entrances}
            projects={projects}
            documents={filteredDocuments}
            allDocuments={analysis.objects}
            assignments={assignments}
            overviewGroup={overviewGroup}
            selectedDocument={selectedDocument}
            filters={filters}
            setFilters={setFilters}
            onSetOverviewGroup={setOverviewGroup}
            onSelectDocument={setSelectedDocumentId}
            onOpenObject={(objectId) => {
              openObjectDetail(objectId);
            }}
            onOpenProjects={() => setView("projects")}
            onOpenObjects={() => setView("objects")}
          />
        ) : (
          <section className={showDocumentEditor || showUploadPanel ? "workspaceGrid" : "workspaceGrid workspaceGridFull"}>
            <div className="workspaceMain">
              {view === "objects" ? (
              <ObjectsView
                objects={objects}
                entrances={entrances}
                projects={projects}
                assignments={assignments}
                documents={filteredDocuments}
                selectedObject={selectedObject}
                activeTab={objectTab}
                objectImages={objectImages}
                onCreate={() => createObject()}
                onCreateFromDocument={createObject}
                onCreateEntrance={createEntrance}
                onDelete={deleteObject}
                onDeleteEntrance={deleteEntrance}
                onDeleteDocument={deleteDocument}
                onSetTab={setObjectTab}
                onUpdateObject={updateObject}
                onUpdateEntrance={updateEntrance}
                onUpdateDocument={updateDocument}
                onAddObjectImages={(objectId, files) => {
                  const urls = Array.from(files).map((file) => URL.createObjectURL(file));
                  setObjectImages((current) => ({ ...current, [objectId]: [...(current[objectId] ?? []), ...urls] }));
                }}
                onSelectDocument={setSelectedDocumentId}
                onOpenObject={openObjectDetail}
              />
              ) : null}

              {view === "map" ? (
              <MapView
                objects={objects}
                projects={projects}
                documents={filteredDocuments}
                assignments={assignments}
                onOpenObject={(objectId) => {
                  openObjectDetail(objectId);
                }}
              />
              ) : null}

              {view === "upload" ? (
              <DocumentUploadView
                previews={previews}
                isAnalyzing={isAnalyzing}
                message={message}
                onAnalyze={handleAnalyze}
                onPreview={handlePreview}
                onFilesSelected={handleFilesSelected}
              />
              ) : null}

              {view === "projects" ? (
              <ProjectsView
                projects={projects}
                objects={objects}
                entrances={entrances}
                selectedProject={selectedProject}
                activeTab={projectTab}
                documents={selectedProjectDocuments}
                assignments={assignments}
                onCreate={() => createProject()}
                onDelete={deleteProject}
                onSelectProject={setSelectedProjectId}
                onSetTab={setProjectTab}
                onUpdateProject={updateProject}
                onSelectDocument={setSelectedDocumentId}
                onAssign={assignDocument}
                onRemoveDocument={(documentId) => assignDocument(documentId, null)}
                onDeleteDocument={deleteDocument}
              />
              ) : null}

              {view === "unassigned" ? (
              <UnassignedView
                documents={unassignedDocuments}
                projects={projects}
                onSelect={setSelectedDocumentId}
                onAssign={assignDocument}
                onCreateProject={createProject}
                onDelete={deleteDocument}
              />
              ) : null}

              {view === "reports" ? (
              <ReportsView documents={filteredDocuments} projects={projects} assignments={assignments} />
              ) : null}

              {view === "settings" ? (
              <SettingsView />
              ) : null}
            </div>

            {showDocumentEditor ? (
              <DocumentEditor
                document={selectedDocument}
                projects={projects}
                assignedProjectId={selectedDocument ? assignments[selectedDocument.id] ?? null : null}
                onAssign={(projectId) => selectedDocument && assignDocument(selectedDocument.id, projectId)}
                onCreateProject={() => selectedDocument && createProject(selectedDocument)}
                onDelete={() => selectedDocument && deleteDocument(selectedDocument.id)}
                onUpdate={updateDocument}
              />
            ) : null}
            {showUploadPanel ? (
              <UploadObjectPanel
                document={uploadDocument}
                documents={uploadDocuments}
                sourceDocument={uploadSourceDocument}
                sourceDocuments={uploadSourceDocuments}
                draft={objectDraft}
                existingObject={findExistingObjectForDraft(objectDraft, objects)}
                isAnalyzing={isAnalyzing}
                message={message}
                phase={uploadPhase}
                uploadedFileName={uploadedFileName}
                onChange={(field, value) => setObjectDraft((current) => ({ ...current, [field]: value }))}
                onSaveNew={saveUploadObject}
                onAssignExisting={(objectId) => assignUploadDocumentToObject(objectId)}
              />
            ) : null}
          </section>
        )}
      </section>
    </main>
  );
}

function DashboardView({
  kpis,
  objects,
  entrances,
  projects,
  documents,
  allDocuments,
  assignments,
  overviewGroup,
  selectedDocument,
  filters,
  setFilters,
  onSetOverviewGroup,
  onSelectDocument,
  onOpenObject,
  onOpenProjects,
  onOpenObjects
}: {
  kpis: KpiShape;
  objects: ObjectRecord[];
  entrances: EntranceRecord[];
  projects: ProjectRecord[];
  documents: ObjectAnalysis[];
  allDocuments: ObjectAnalysis[];
  assignments: Record<string, string | null>;
  overviewGroup: OverviewGroup;
  selectedDocument: ObjectAnalysis | null;
  filters: Filters;
  setFilters: (value: Filters) => void;
  onSetOverviewGroup: (value: OverviewGroup) => void;
  onSelectDocument: (id: string) => void;
  onOpenObject: (id: string) => void;
  onOpenProjects: () => void;
  onOpenObjects: () => void;
}) {
  const hasActiveFilters = hasFilters(filters);
  const dashboardObjects = hasActiveFilters
    ? objects.filter((object) => documents.some((document) => documentBelongsToObject(document, object, projects, assignments)))
    : objects;
  const dashboardProjects = hasActiveFilters
    ? projects.filter((project) => documents.some((document) => assignments[document.id] === project.id))
    : projects;

  return (
    <section className="portfolioDashboard">
      <div className="dashboardToolbar">
        <div>
          <h2>UEBERSICHT</h2>
          <p>Portfolio Baukosten und Dokumentanalyse</p>
        </div>
        <div className="headerActions">
          <label className="periodSelect">
            <span>Zeitraum</span>
            <select value={filters.year} onChange={(event) => setFilters({ ...filters, year: event.target.value })}>
              <option value="">Alle Jahre</option>
              <option value="2024">2024</option>
              <option value="2025">2025</option>
              <option value="2026">2026</option>
            </select>
          </label>
          <button type="button" onClick={onOpenProjects}>Projekte</button>
          <button type="button" onClick={onOpenObjects}>Objekte</button>
        </div>
      </div>

      <KpiGrid kpis={kpis} />

      <DashboardFilterPanel
        filters={filters}
        setFilters={setFilters}
        documents={allDocuments}
        filteredCount={documents.length}
        projects={projects}
        assignments={assignments}
      />

      <section className="mapObjectGrid dashboardMapGrid">
        <PortfolioMap
          objects={dashboardObjects}
          projects={dashboardProjects}
          documents={documents}
          assignments={assignments}
          selectedDocument={selectedDocument}
          onSelectDocument={onSelectDocument}
          onOpenObject={onOpenObject}
        />
        <ObjectSideList
          objects={dashboardObjects}
          projects={dashboardProjects}
          documents={documents}
          assignments={assignments}
          selectedDocument={selectedDocument}
          onSelectDocument={onSelectDocument}
          onOpenObject={onOpenObject}
        />
      </section>

      <PortfolioOverviewTable
        group={overviewGroup}
        objects={dashboardObjects}
        entrances={entrances}
        projects={dashboardProjects}
        documents={documents}
        assignments={assignments}
        selectedDocumentId={selectedDocument?.id ?? null}
        onSetGroup={onSetOverviewGroup}
        onSelectDocument={onSelectDocument}
      />
    </section>
  );
}

function DocumentUploadView({
  previews,
  isAnalyzing,
  message,
  onAnalyze,
  onPreview,
  onFilesSelected
}: {
  previews: ParsedPreview[];
  isAnalyzing: boolean;
  message: string | null;
  onAnalyze: (files: File[]) => Promise<void>;
  onPreview: (files: File[]) => Promise<void>;
  onFilesSelected: (files: File[]) => void;
}) {
  return (
    <section className="uploadWorkspace">
      <div className="panelHeader uploadTitle">
        <div>
          <h2>Dokument Upload / KI</h2>
          <p>Hier landen Upload, Textprüfung und die Analyse mit der PARIBUS Baukosten KI. Das Dashboard bleibt nur für Objekte und Portfolio-Kennzahlen.</p>
        </div>
        <span className="status statusNeutral">KI Arbeitsbereich</span>
      </div>
      <UploadPanel isAnalyzing={isAnalyzing} message={message} onAnalyze={onAnalyze} onPreview={onPreview} onFilesSelected={onFilesSelected} />
      <PreviewPanel previews={previews} />
    </section>
  );
}

function MapView({
  objects,
  projects,
  documents,
  assignments,
  onOpenObject
}: {
  objects: ObjectRecord[];
  projects: ProjectRecord[];
  documents: ObjectAnalysis[];
  assignments: Record<string, string | null>;
  onOpenObject: (id: string) => void;
}) {
  return (
    <section className="mapWorkspace">
      <div className="sectionIntro">
        <div>
          <p className="eyebrow">Kartenansicht</p>
          <h2>Objekte auf OpenStreetMap</h2>
          <p>Die Karte zeigt nur Objekte mit gepflegten Koordinaten. Latitude und Longitude bearbeitest du direkt im Objektformular.</p>
        </div>
      </div>
      <section className="mapObjectGrid">
        <PortfolioMap
          objects={objects}
          projects={projects}
          documents={documents}
          assignments={assignments}
          selectedDocument={null}
          onSelectDocument={() => undefined}
          onOpenObject={onOpenObject}
        />
        <ObjectSideList
          objects={objects}
          projects={projects}
          documents={documents}
          assignments={assignments}
          selectedDocument={null}
          onSelectDocument={() => undefined}
          onOpenObject={onOpenObject}
        />
      </section>
    </section>
  );
}

function PortfolioMap({
  objects,
  projects,
  documents,
  assignments,
  selectedDocument,
  onSelectDocument,
  onOpenObject
}: {
  objects: ObjectRecord[];
  projects: ProjectRecord[];
  documents: ObjectAnalysis[];
  assignments: Record<string, string | null>;
  selectedDocument: ObjectAnalysis | null;
  onSelectDocument: (id: string) => void;
  onOpenObject: (id: string) => void;
}) {
  const entries = buildMapEntries(objects, projects, documents, assignments);
  const [query, setQuery] = useState("");
  const [geocodedCoordinates, setGeocodedCoordinates] = useState<Record<string, { latitude: number; longitude: number }>>({});
  const [geocodeStatus, setGeocodeStatus] = useState<Record<string, "loading" | "found" | "missing">>({});
  const filteredEntries = entries.filter((entry) =>
    `${entry.title} ${entry.fund} ${entry.address}`.toLowerCase().includes(query.toLowerCase())
  );
  useEffect(() => {
    const unresolved = filteredEntries.filter((entry) =>
      entry.latitude === null &&
      entry.longitude === null &&
      entry.address &&
      entry.address !== "k.A." &&
      !geocodedCoordinates[entry.key] &&
      geocodeStatus[entry.key] !== "loading" &&
      geocodeStatus[entry.key] !== "missing"
    );

    unresolved.slice(0, 5).forEach((entry) => {
      setGeocodeStatus((current) => ({ ...current, [entry.key]: "loading" }));
      fetch(`/api/geocode?address=${encodeURIComponent(entry.address)}`)
        .then((response) => response.json())
        .then((data) => {
          if (!data.ok || typeof data.latitude !== "number" || typeof data.longitude !== "number") {
            setGeocodeStatus((current) => ({ ...current, [entry.key]: "missing" }));
            return;
          }
          setGeocodedCoordinates((current) => ({
            ...current,
            [entry.key]: { latitude: data.latitude, longitude: data.longitude }
          }));
          setGeocodeStatus((current) => ({ ...current, [entry.key]: "found" }));
        })
        .catch(() => setGeocodeStatus((current) => ({ ...current, [entry.key]: "missing" })));
    });
  }, [filteredEntries, geocodedCoordinates, geocodeStatus]);

  const mappedEntries = filteredEntries.filter((entry) =>
    (entry.latitude !== null && entry.longitude !== null) || Boolean(geocodedCoordinates[entry.key])
  );
  const objectMapEntries: ObjectMapEntry[] = mappedEntries.map((entry) => ({
    key: entry.key,
    objectId: entry.objectId,
    title: entry.title,
    objectNumber: entry.objectNumber,
    address: entry.address,
    fund: entry.fund,
    projectCount: entry.projectCount,
    documentCount: entry.documents.length,
    totalCost: entry.totalCost,
    latitude: entry.latitude ?? geocodedCoordinates[entry.key]?.latitude ?? 0,
    longitude: entry.longitude ?? geocodedCoordinates[entry.key]?.longitude ?? 0
  }));
  const missingCount = filteredEntries.length - mappedEntries.length;
  const loadingCount = Object.values(geocodeStatus).filter((status) => status === "loading").length;
  return (
    <section className="portfolioMap panel">
      <div className="mapSearchBar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Objekt oder Adresse suchen..." />
        <span>
          {loadingCount > 0
            ? "Adressen werden markiert..."
            : missingCount > 0
              ? `${missingCount} Objekt(e): Adresse/Koordinaten nicht gefunden`
              : "Alle Objekte markiert"}
        </span>
      </div>
      <div className="leafletCard">
        {objectMapEntries.length === 0 ? (
          <div className="mapEmpty">Koordinaten fehlen. Bitte latitude und longitude im Objektformular ergaenzen.</div>
        ) : (
          <ObjectMap
            entries={objectMapEntries}
            onOpenObject={onOpenObject}
          />
        )}
      </div>
    </section>
  );
}

function ObjectSideList({
  objects,
  projects,
  documents,
  assignments,
  selectedDocument,
  onSelectDocument,
  onOpenObject
}: {
  objects: ObjectRecord[];
  projects: ProjectRecord[];
  documents: ObjectAnalysis[];
  assignments: Record<string, string | null>;
  selectedDocument: ObjectAnalysis | null;
  onSelectDocument: (id: string) => void;
  onOpenObject: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const entries = buildMapEntries(objects, projects, documents, assignments)
    .filter((entry) => `${entry.title} ${entry.address} ${entry.fund} ${entry.objectNumber}`.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 8);
  return (
    <section className="panel objectSidePanel">
      <div className="panelHeader">
        <div>
          <h2>Objekte</h2>
          <p>Erkannte Objektbereiche</p>
        </div>
      </div>
      <input className="sideSearch" placeholder="Suche Objekt..." value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="sideObjectRows">
        {entries.length === 0 ? <p className="muted">Noch keine Objekte vorhanden.</p> : null}
        {entries.map((entry) => {
          const active = selectedDocument ? entry.documents.some((document) => document.id === selectedDocument.id) : false;
          return (
            <button
              key={entry.key}
              className={active ? "sideObjectRow selectedRow" : "sideObjectRow"}
              type="button"
              onClick={() => entry.objectId ? onOpenObject(entry.objectId) : entry.documents[0] && onSelectDocument(entry.documents[0].id)}
            >
              <span className="pinDot" />
              <span className="sideObjectText">
                <strong>{entry.title}</strong>
                <em>{entry.address}</em>
              </span>
              <span className="sideObjectMeta">{entry.projectCount} P / {entry.documents.length} D</span>
              <span className="sideObjectCost">{entry.latitude === null || entry.longitude === null ? "Koordinaten fehlen" : formatNullableCurrency(entry.totalCost)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function SelectedPortfolioDetail({ document }: { document: ObjectAnalysis | null }) {
  if (!document) {
    return (
      <section className="panel detailPortfolioPanel">
        <div className="emptyState">
          <p>Waehle ein Objekt aus oder lade Dokumente hoch.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="panel detailPortfolioPanel">
      <div className="backLink">&lt;- Zurueck zur Karte</div>
      <h2>{fieldOrUnknown(document.objectAddress)}</h2>
      <div className="portfolioDetailGrid">
        <div className="buildingPreview">
          <div className="buildingImage">
            <div className="buildingFacade" />
          </div>
          <div className="thumbStrip">
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
        <div className="infoCard">
          <h3>Objektinformationen</h3>
          <InfoLine label="Adresse" value={fieldOrUnknown(document.objectAddress)} />
          <InfoLine label="Objektnummer" value={fieldOrUnknown(document.objectNumber)} />
          <InfoLine label="Fonds" value={fieldOrUnknown(document.fund)} />
          <InfoLine label="Wohnung / Lage" value={formatApartment(document)} />
          <InfoLine label="Wohnfläche" value={formatSqm(document.livingAreaSqm)} />
        </div>
        <div className="infoCard">
          <h3>Kostenübersicht</h3>
          <InfoLine label="Netto" value={formatCurrency(document.netCost)} />
          <InfoLine label="MwSt" value={formatCurrency(document.vatCost)} />
          <InfoLine label="Brutto" value={formatCurrency(document.totalCost)} />
          <div className="donutMini">
            <span>{formatCurrency(document.totalCost)}</span>
          </div>
        </div>
        <div className="infoCard">
          <h3>KI-Prüfung</h3>
          <InfoLine label="Agent" value={fieldOrUnknown(document.aiAgentName)} />
          <InfoLine label="Status" value={formatKiStatus(document)} />
          <InfoLine label="Projektvorschlag" value={fieldOrUnknown(document.projectSuggestion)} />
          <InfoLine label="Zuordnung" value={fieldOrUnknown(document.assignmentSuggestion)} />
        </div>
      </div>
      <div className="tableWrap compactTable">
        <table>
          <thead>
            <tr>
              <th>Maßnahme</th>
              <th>Beschreibung</th>
              <th>Kosten</th>
              <th>Art</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {document.clusters.length === 0 ? (
              <tr><td colSpan={5}>k.A.</td></tr>
            ) : document.clusters.map((cluster) => (
              <tr key={cluster.id}>
                <td>{fieldOrUnknown(cluster.cluster)}</td>
                <td>{fieldOrUnknown(cluster.description)}</td>
                <td>{formatCurrency(cluster.totalCost)}</td>
                <td>{fieldOrUnknown(cluster.allocation as ExtractedField<string>)}</td>
                <td>{fieldOrUnknown(document.dataQuality)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="infoLine">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const chartPalette = ["#466389", "#6E8CB0", "#92A9C4", "#FF6E42", "#8AB17D", "#D9A441", "#7A8590", "#A6B2BF"];

function tradeChartColor(index: number): string {
  return index === 0 ? "#FF6E42" : chartPalette[index % chartPalette.length];
}

function ObjectYearCostChart({ documents }: { documents: ObjectAnalysis[] }) {
  const data = groupByYear(documents);
  return (
    <section className="panel insightCard">
      <div className="panelHeader compactHeader">
        <div>
          <h3>Kosten nach Jahr</h3>
          <p>Bruttokosten aus zugeordneten Dokumenten.</p>
        </div>
      </div>
      {data.length === 0 ? <p className="muted">k.A.</p> : (
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data} margin={{ top: 10, right: 18, bottom: 0, left: 0 }}>
            <XAxis dataKey="year" tick={{ fill: "#737B84", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#DCE2E8" }} />
            <YAxis tick={{ fill: "#737B84", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#DCE2E8" }} tickFormatter={(value) => formatShortEuro(Number(value))} />
            <Tooltip formatter={(value) => formatNullableCurrency(Number(value))} />
            <Area type="monotone" dataKey="cost" stroke="#466389" fill="#DDE7F2" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}

function ObjectTimeline({ documents, projects }: { documents: ObjectAnalysis[]; projects: ProjectRecord[] }) {
  const entries = documents
    .map((document) => ({
      id: document.id,
      year: fieldOrUnknown(document.year),
      title: fieldOrUnknown(document.projectType) !== "k.A." ? fieldOrUnknown(document.projectType) : fieldOrUnknown(document.documentType),
      cost: document.totalCost.value,
      documentNumber: fieldOrUnknown(document.documentNumber)
    }))
    .sort((a, b) => a.year.localeCompare(b.year));
  return (
    <section className="panel insightCard">
      <div className="panelHeader compactHeader">
        <div>
          <h3>Kostenentwicklung als Zeitstrahl</h3>
          <p>{projects.length ? `${projects.length} Projekt(e) im Objekt` : "Projektbezug k.A."}</p>
        </div>
      </div>
      <div className="timelineList">
        {entries.length === 0 ? <p className="muted">k.A.</p> : entries.map((entry) => (
          <article key={entry.id} className="timelineItem">
            <span>{entry.year}</span>
            <strong>{entry.title}</strong>
            <em>{entry.documentNumber}</em>
            <b>{formatNullableCurrency(entry.cost)}</b>
          </article>
        ))}
      </div>
    </section>
  );
}

function getPageTitle(view: ViewKey): string {
  const titles: Record<ViewKey, string> = {
    dashboard: "Dashboard",
    objects: "Objekte",
    map: "Karte",
    upload: "Dokument Upload / KI",
    projects: "Projekte",
    unassigned: "KI Analyse",
    reports: "Auswertungen",
    settings: "Einstellungen"
  };
  return titles[view];
}

function KpiGrid({ kpis }: { kpis: KpiShape }) {
  return (
    <section className="kpiGrid" aria-label="Kennzahlen">
      <Kpi label="Gesamtkosten brutto" value={formatNullableCurrency(kpis.gross)} accent />
      <Kpi label="Gesamtkosten netto" value={formatNullableCurrency(kpis.net)} />
      <Kpi label="Anzahl Objekte" value={formatNumber(kpis.objects)} />
      <Kpi label="Anzahl Projekte" value={formatNumber(kpis.projects)} />
      <Kpi label="Anzahl Dokumente" value={formatNumber(kpis.documents)} />
      <Kpi label="Sanierte Wohnungen" value={formatNullableNumber(kpis.apartments)} />
      <Kpi label="Kosten pro Wohnung" value={formatNullableCurrency(kpis.costPerApartment)} />
      <Kpi label="Kosten pro m²" value={formatEuroPerSqm(kpis.costPerSqm)} />
      <Kpi label="Offene Prüffälle" value={formatNumber(kpis.reviewCases)} warning />
      <Kpi label="k.A.-Felder" value={formatNumber(kpis.unknownFields)} warning />
    </section>
  );
}

function DashboardFilterPanel({
  filters,
  setFilters,
  documents,
  filteredCount,
  projects,
  assignments
}: {
  filters: Filters;
  setFilters: (value: Filters) => void;
  documents: ObjectAnalysis[];
  filteredCount: number;
  projects: ProjectRecord[];
  assignments: Record<string, string | null>;
}) {
  const options = buildFilterOptions(documents, projects, assignments);
  const activeCount = Object.values(filters).filter((value) => value.trim()).length;

  return (
    <section className="dashboardFilterPanel">
      <div className="filterPanelHeader">
        <div>
          <h3>Filter</h3>
          <p>{activeCount ? `${activeCount} Filter aktiv - ${filteredCount} Treffer` : `${filteredCount} Datensaetze sichtbar`}</p>
        </div>
        <button type="button" onClick={() => setFilters(emptyFilters)}>Filter zuruecksetzen</button>
      </div>
      <div className="dashboardFilters">
        <label className="filterInput filterWide">
          <span>Suche</span>
          <input
            value={filters.object}
            onChange={(event) => setFilters({ ...filters, object: event.target.value })}
            placeholder="Objekt, Adresse, Projekt, Anbieter..."
          />
        </label>
        <FilterSelect label="Jahr" value={filters.year} options={options.years} onChange={(value) => setFilters({ ...filters, year: value })} />
        <FilterSelect label="Fonds" value={filters.fund} options={options.funds} onChange={(value) => setFilters({ ...filters, fund: value })} />
        <FilterSelect label="Objektnummer" value={filters.objectNumber} options={options.objectNumbers} onChange={(value) => setFilters({ ...filters, objectNumber: value })} />
        <FilterSelect label="Adresse" value={filters.address} options={options.addresses} onChange={(value) => setFilters({ ...filters, address: value })} />
        <FilterSelect label="Projekt" value={filters.project} options={options.projects} onChange={(value) => setFilters({ ...filters, project: value })} />
        <FilterSelect label="Projektart" value={filters.projectType} options={options.projectTypes} onChange={(value) => setFilters({ ...filters, projectType: value })} />
        <FilterSelect label="Dokumenttyp" value={filters.documentType} options={options.documentTypes} onChange={(value) => setFilters({ ...filters, documentType: value })} />
        <FilterSelect label="Anbieter" value={filters.provider} options={options.providers} onChange={(value) => setFilters({ ...filters, provider: value })} />
        <FilterSelect label="WE-Nummer" value={filters.apartmentNumber} options={options.apartments} onChange={(value) => setFilters({ ...filters, apartmentNumber: value })} />
        <FilterSelect label="Lage" value={filters.location} options={options.locations} onChange={(value) => setFilters({ ...filters, location: value })} />
        <FilterSelect label="Maßnahme" value={filters.cluster} options={options.clusters} onChange={(value) => setFilters({ ...filters, cluster: value })} />
        <FilterSelect label="Datenqualität" value={filters.dataQuality} options={options.qualities} onChange={(value) => setFilters({ ...filters, dataQuality: value })} />
        <FilterSelect label="Status" value={filters.status} options={options.statuses} onChange={(value) => setFilters({ ...filters, status: value })} />
      </div>
    </section>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="filterInput">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Alle</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function PortfolioOverviewTable({
  group,
  objects,
  entrances,
  projects,
  documents,
  assignments,
  selectedDocumentId,
  onSetGroup,
  onSelectDocument
}: {
  group: OverviewGroup;
  objects: ObjectRecord[];
  entrances: EntranceRecord[];
  projects: ProjectRecord[];
  documents: ObjectAnalysis[];
  assignments: Record<string, string | null>;
  selectedDocumentId: string | null;
  onSetGroup: (value: OverviewGroup) => void;
  onSelectDocument: (id: string) => void;
}) {
  const rows = buildOverviewRows(group, objects, entrances, projects, documents, assignments);

  return (
    <section className="panel panelFlush overviewPanel">
      <div className="panelHeader tableHeader">
        <div>
          <h2>Objektübersicht</h2>
          <p>Umschaltbar nach Gesamtobjekt, Hauseingang, Projekt oder Dokument.</p>
        </div>
        <div className="segmentedControl" aria-label="Gruppierung">
          {([
            ["object", "Gesamtobjekt"],
            ["entrance", "Hauseingang"],
            ["project", "Projekt"],
            ["document", "Dokument"]
          ] as Array<[OverviewGroup, string]>).map(([key, label]) => (
            <button
              key={key}
              className={group === key ? "segmentButton segmentButtonActive" : "segmentButton"}
              type="button"
              onClick={() => onSetGroup(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="tableWrap">
        <table className="dataTable overviewTable">
          <thead>
            <tr>
              <th>Ebene</th>
              <th>Objektnummer</th>
              <th>Objektadresse / Adressbereich</th>
              <th>Gesamtobjekt / Wirtschaftseinheit</th>
              <th>Hauseingang</th>
              <th>Welche WE / Wohnungen saniert</th>
              <th>Anzahl sanierte WE</th>
              <th>Maßnahmencluster</th>
              <th>Kurzbeschreibung</th>
              <th>Kosten netto</th>
              <th>Kosten brutto</th>
              <th>Durchschnitt pro WE</th>
              <th>Kosten pro m²</th>
              <th>Anzahl Dokumente</th>
              <th>Datenqualität / Prüffall</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={15}>k.A.</td></tr>
            ) : rows.map((row) => (
              <tr
                key={row.id}
                className={row.documentId && row.documentId === selectedDocumentId ? "selectedRow" : ""}
                onClick={() => row.documentId && onSelectDocument(row.documentId)}
              >
                <td>{row.level}</td>
                <td>{row.objectNumber}</td>
                <td className="wideCell">{row.addressRange}</td>
                <td>{row.economicUnit}</td>
                <td>{row.entrance}</td>
                <td>{row.apartments}</td>
                <td>{formatNullableNumber(row.renovatedCount)}</td>
                <td className="clusterCell">{row.clusters}</td>
                <td className="wideCell">{row.description}</td>
                <td>{formatNullableCurrency(row.netCost)}</td>
                <td className="moneyStrong">{formatNullableCurrency(row.grossCost)}</td>
                <td>{formatNullableCurrency(row.costPerRenovatedUnit)}</td>
                <td>{formatEuroPerSqm(row.costPerSqm)}</td>
                <td>{formatNumber(row.documentCount)}</td>
                <td>{row.dataQuality}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FilterBar({ filters, setFilters }: { filters: Filters; setFilters: (value: Filters) => void }) {
  return (
    <section className="filterBar" aria-label="Filter">
      {([
        ["year", "Jahr"],
        ["fund", "Fonds"],
        ["object", "Objekt"],
        ["objectNumber", "Objektnummer"],
        ["address", "Adresse"],
        ["project", "Projekt"],
        ["projectType", "Projektart"],
        ["documentType", "Dokumenttyp"],
        ["provider", "Anbieter"],
        ["apartmentNumber", "WE-Nummer"],
        ["location", "Lage"],
        ["cluster", "Maßnahmencluster"],
        ["dataQuality", "Datenqualität"],
        ["status", "Status"]
      ] as Array<[keyof Filters, string]>).map(([key, label]) => (
        <label className="filterInput" key={key}>
          <span>{label}</span>
          <input
            value={filters[key]}
            onChange={(event) => setFilters({ ...filters, [key]: event.target.value })}
            placeholder="Alle"
          />
        </label>
      ))}
      <button type="button" onClick={() => setFilters(emptyFilters)}>Filter zuruecksetzen</button>
    </section>
  );
}

function PreviewPanel({ previews }: { previews: ParsedPreview[] }) {
  if (previews.length === 0) return null;
  return (
    <section className="panel">
      <div className="panelHeader">
        <div>
          <h2>Textvorschau</h2>
          <p>Rohtext-Prüfung vor der KI-Auswertung.</p>
        </div>
      </div>
      <div className="previewList">
        {previews.map((preview) => (
          <article className="previewItem" key={preview.id}>
            <div className="previewHeader">
              <strong>{preview.fileName}</strong>
              <span className="status statusNeutral">{preview.textLength} Zeichen</span>
            </div>
            <pre>{preview.preview || "k.A."}</pre>
          </article>
        ))}
      </div>
    </section>
  );
}

function DocumentTable({
  documents,
  projects,
  assignments,
  selectedDocumentId,
  onSelect,
  onAssign,
  onCreateProject,
  onDelete
}: {
  documents: ObjectAnalysis[];
  projects: ProjectRecord[];
  assignments: Record<string, string | null>;
  selectedDocumentId: string | null;
  onSelect: (id: string) => void;
  onAssign: (documentId: string, projectId: string | null) => void;
  onCreateProject: (document: ObjectAnalysis) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="panel panelFlush">
      <div className="panelHeader tableHeader">
        <div>
          <h2>Dokumente & Kosten</h2>
          <p>Eine Zeile je erkanntem Dokument. Wohnungsdaten sind nur Felder, keine eigene Verwaltungsebene.</p>
        </div>
      </div>
      <div className="tableWrap">
        <table className="dataTable">
          <thead>
            <tr>
              <th>Projekt</th>
              <th>Fonds</th>
              <th>Objektnummer</th>
              <th>Adresse</th>
              <th>Projektart</th>
              <th>Dokumenttyp</th>
              <th>Anbieter</th>
              <th>Datum</th>
              <th>WE / Lage</th>
              <th>Wohnfläche</th>
              <th>Cluster</th>
              <th>Netto</th>
              <th>MwSt</th>
              <th>Brutto</th>
              <th>KI-Status</th>
              <th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {documents.length === 0 ? (
              <tr><td colSpan={16}>k.A.</td></tr>
            ) : documents.map((document) => (
              <tr
                key={document.id}
                className={selectedDocumentId === document.id ? "selectedRow" : ""}
                onClick={() => onSelect(document.id)}
              >
                <td>
                  <select
                    value={assignments[document.id] ?? ""}
                    onChange={(event) => onAssign(document.id, event.target.value || null)}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <option value="">Unzugeordnet</option>
                    {projects.map((project) => <option key={project.id} value={project.id}>{project.projectName || "k.A."}</option>)}
                  </select>
                </td>
                <td>{fieldOrUnknown(document.fund)}</td>
                <td>{fieldOrUnknown(document.objectNumber)}</td>
                <td className="wideCell">{fieldOrUnknown(document.objectAddress)}</td>
                <td>{fieldOrUnknown(document.projectType)}</td>
                <td><span className={`documentTypeBadge ${documentTypeBadgeClass(document)}`}>{documentTypeValue(document)}</span></td>
                <td>{fieldOrUnknown(document.provider)}</td>
                <td>{fieldOrUnknown(document.documentDate)}</td>
                <td>{formatApartment(document)}</td>
                <td>{formatSqm(document.livingAreaSqm)}</td>
                <td className="clusterCell">{formatClusters(document)}</td>
                <td>{formatCurrency(document.netCost)}</td>
                <td>{formatCurrency(document.vatCost)}</td>
                <td className="moneyStrong">{formatCurrency(document.totalCost)}</td>
                <td>{formatKiStatus(document)}</td>
                <td>
                  <div className="rowActions">
                    <button type="button" onClick={(event) => { event.stopPropagation(); onSelect(document.id); }}>Ansehen</button>
                    <button type="button" onClick={(event) => { event.stopPropagation(); onCreateProject(document); }}>Projekt erstellen</button>
                    <button type="button" onClick={(event) => { event.stopPropagation(); onDelete(document.id); }}>Loeschen</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ObjectsView({
  objects,
  entrances,
  projects,
  assignments,
  documents,
  selectedObject,
  activeTab,
  objectImages,
  onCreate,
  onCreateFromDocument,
  onCreateEntrance,
  onDelete,
  onDeleteEntrance,
  onDeleteDocument,
  onSetTab,
  onUpdateObject,
  onUpdateEntrance,
  onUpdateDocument,
  onAddObjectImages,
  onSelectDocument,
  onOpenObject
}: {
  objects: ObjectRecord[];
  entrances: EntranceRecord[];
  projects: ProjectRecord[];
  assignments: Record<string, string | null>;
  documents: ObjectAnalysis[];
  selectedObject: ObjectRecord | null;
  activeTab: ObjectTab;
  objectImages: Record<string, string[]>;
  onCreate: () => void;
  onCreateFromDocument: (document: ObjectAnalysis) => void;
  onCreateEntrance: (objectId: string) => void;
  onDelete: (id: string) => void;
  onDeleteEntrance: (id: string) => void;
  onDeleteDocument: (id: string) => void;
  onSetTab: (tab: ObjectTab) => void;
  onUpdateObject: (id: string, field: keyof ObjectRecord, value: string) => void;
  onUpdateEntrance: (id: string, field: keyof EntranceRecord, value: string) => void;
  onUpdateDocument: (id: string, updater: (document: ObjectAnalysis) => ObjectAnalysis) => void;
  onAddObjectImages: (id: string, files: FileList) => void;
  onSelectDocument: (id: string) => void;
  onOpenObject: (id: string) => void;
}) {
  const [objectSearch, setObjectSearch] = useState("");
  const [costBasis, setCostBasis] = useState<CostBasisMode>("all");
  const [objectPageFilters, setObjectPageFilters] = useState<ObjectPageFilters>(emptyObjectPageFilters);
  const [manualCostDocumentIds, setManualCostDocumentIds] = useState<Set<string>>(new Set());
  const detectedGroups = groupByObject(documents);
  const filteredObjects = objects
    .filter((object) =>
      `${object.objectNumber} ${object.objectName} ${object.address} ${object.fund}`.toLowerCase().includes(objectSearch.toLowerCase())
    )
    .sort(compareObjectsByNumber);
  const selectedEntrances = selectedObject ? entrances.filter((entrance) => entrance.objectId === selectedObject.id) : [];
  const selectedProjects = selectedObject ? projects.filter((project) => project.objectId === selectedObject.id) : [];
  const selectedDocuments = selectedObject ? documents.filter((document) => documentBelongsToObject(document, selectedObject, projects, assignments)) : [];
  const objectFilteredDocuments = applyObjectPageFilters(selectedDocuments, objectPageFilters);
  const selectedCostDocuments = applyCostBasis(objectFilteredDocuments, costBasis, manualCostDocumentIds);
  const toggleManualCostDocument = (documentId: string, checked: boolean) => {
    setManualCostDocumentIds((current) => {
      const next = new Set(current);
      if (checked) next.add(documentId);
      else next.delete(documentId);
      return next;
    });
  };
  return (
    <section className="objectWorkspace">
      <div className="panelHeader objectPageHeader">
        <div>
          <h2>Objekte</h2>
          <p>Wirtschaftseinheiten, Hauseingänge, Projekte, Dokumente, Kosten und Bilder in einer sauberen Objektakte.</p>
        </div>
        <button className="buttonPrimary" type="button" onClick={onCreate}>Objekt erstellen</button>
      </div>

      <div className="objectKpiStrip">
        <CostMetric label="Objekte" value={formatNumber(objects.length)} />
        <CostMetric label="Projekte" value={formatNumber(projects.length)} />
        <CostMetric label="Dokumente" value={formatNumber(documents.length)} />
        <CostMetric label="Prüffälle" value={formatNumber(countReviewCases(documents))} />
      </div>

      <div className="objectManagementLayout">
        <aside className="objectDirectory">
          <input className="sideSearch" value={objectSearch} onChange={(event) => setObjectSearch(event.target.value)} placeholder="Objekt suchen..." />
          {filteredObjects.length === 0 ? <p className="muted">Noch keine passenden Objekte.</p> : null}
          {filteredObjects.map((object) => {
            const objectDocuments = documents.filter((document) => documentBelongsToObject(document, object, projects, assignments));
            const objectProjects = projects.filter((project) => project.objectId === object.id);
            const objectMeasures = buildMeasureRows(objectDocuments).length || objectDocuments.reduce((sum, document) => sum + document.clusters.length, 0);
            return (
              <button
                key={object.id}
                className={selectedObject?.id === object.id ? "projectListItem selectedRow" : "projectListItem"}
                type="button"
                onClick={() => onOpenObject(object.id)}
              >
                <strong>{objectLabel(object) || "k.A."}</strong>
                <span>{object.address || "Adressbereich k.A."}</span>
                <em>{formatNullableCurrency(sumValues(objectDocuments.map((document) => document.totalCost.value)))}</em>
                <span className="objectListChips">
                  <small>{formatNumber(objectMeasures)} Gewerke</small>
                  <small>{formatNumber(objectDocuments.length)} Dokumente</small>
                  <small>{formatNumber(objectProjects.length)} Projekte</small>
                </span>
              </button>
            );
          })}
        </aside>
        <div className="objectProfile">
          {selectedObject ? (
            <>
              <ObjectDetailHeader
                object={selectedObject}
                entrances={selectedEntrances}
                projects={selectedProjects}
                documents={selectedCostDocuments}
                totalDocuments={selectedDocuments.length}
                costBasis={costBasis}
                images={objectImages[selectedObject.id] ?? []}
              />
              <CostBasisControl
                value={costBasis}
                onChange={setCostBasis}
                consideredCount={selectedCostDocuments.length}
              />
              <ObjectPageFilterBar
                filters={objectPageFilters}
                onChange={setObjectPageFilters}
                documents={selectedDocuments}
              />
              <div className="tabs">
                {objectTabs.map((tab) => (
                  <button
                    key={tab.key}
                    className={activeTab === tab.key ? "tabButton tabButtonActive" : "tabButton"}
                    type="button"
                    onClick={() => onSetTab(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              {activeTab === "overview" ? (
                <ObjectOverviewTab
                  object={selectedObject}
                  documents={selectedCostDocuments}
                  projects={selectedProjects}
                  images={objectImages[selectedObject.id] ?? []}
                  onUpdateObject={(field, value) => onUpdateObject(selectedObject.id, field, value)}
                  onAddImages={(files) => onAddObjectImages(selectedObject.id, files)}
                />
              ) : null}
              {activeTab === "entrances" ? (
                <EntrancesTab
                  entrances={selectedEntrances}
                  onCreate={() => onCreateEntrance(selectedObject.id)}
                  onDelete={onDeleteEntrance}
                  onUpdate={onUpdateEntrance}
                />
              ) : null}
              {activeTab === "measures" ? (
                <ObjectMeasuresTab
                  documents={selectedDocuments}
                  costDocuments={selectedCostDocuments}
                  projects={projects}
                  assignments={assignments}
                  onUpdateDocument={onUpdateDocument}
                />
              ) : null}
              {activeTab === "trades" ? <ObjectTradesTab documents={selectedCostDocuments} /> : null}
              {activeTab === "documents" ? (
                <ObjectDocumentsTab
                  documents={selectedDocuments}
                  costDocuments={objectFilteredDocuments}
                  costBasis={costBasis}
                  manualCostDocumentIds={manualCostDocumentIds}
                  onToggleCostDocument={toggleManualCostDocument}
                  onSelect={onSelectDocument}
                  onDelete={onDeleteDocument}
                />
              ) : null}
              {activeTab === "images" ? (
                <ObjectImageUpload
                  images={objectImages[selectedObject.id] ?? []}
                  onAdd={(files) => onAddObjectImages(selectedObject.id, files)}
                />
              ) : null}
              {activeTab === "apartments" ? <ObjectApartmentsTab documents={selectedCostDocuments} /> : null}
              {activeTab === "ai" ? <ProjectAiTab documents={selectedCostDocuments} /> : null}
              <div className="headerActions projectActions">
                <button type="button" onClick={() => onDelete(selectedObject.id)}>Objekt loeschen</button>
              </div>
            </>
          ) : (
            <div className="emptyState"><p>Kein Objekt ausgewählt.</p></div>
          )}
        </div>
      </div>

      <section className="detectedObjectSection">
      <h3>Aus Dokumenten erkannte Objektbereiche</h3>
      <div className="objectGrid">
        {detectedGroups.map((group) => (
          <article className="objectCard" key={group.key}>
            <span>{group.documents.length} Dokument(e)</span>
            <strong>{group.objectNumber || "k.A."}</strong>
            <p>{group.address || "k.A."}</p>
            <div className="costLine costLineStrong">
              <span>Brutto</span>
              <strong>{formatNullableCurrency(sumValues(group.documents.map((document) => document.totalCost.value)))}</strong>
            </div>
            <DetectedObjectImages
              images={objectImages[group.key] ?? []}
              onAdd={(files) => onAddObjectImages(group.key, files)}
            />
            <div className="headerActions">
              <button type="button" onClick={() => onSelectDocument(group.documents[0].id)}>Dokument oeffnen</button>
              <button type="button" onClick={() => onCreateFromDocument(group.documents[0])}>Objekt daraus erstellen</button>
            </div>
          </article>
        ))}
      </div>
      </section>
    </section>
  );
}

function ObjectDetailHeader({
  object,
  entrances,
  projects,
  documents,
  totalDocuments,
  costBasis,
  images
}: {
  object: ObjectRecord;
  entrances: EntranceRecord[];
  projects: ProjectRecord[];
  documents: ObjectAnalysis[];
  totalDocuments: number;
  costBasis: CostBasisMode;
  images: string[];
}) {
  const grossCost = sumValues(documents.map((document) => document.totalCost.value));
  const measureCount = standardTradeCatalog.length;
  const status = countReviewCases(documents) > 0 ? "Prüfung" : documents.length > 0 ? "Aktiv" : "k.A.";
  const dataQuality = countReviewCases(documents) > 0 ? "Prüfung" : documents.length > 0 ? "Sicher erkannt" : "k.A.";
  return (
    <div className={images[0] ? "objectDetailHeader objectDetailHeaderWithImage" : "objectDetailHeader objectDetailHeaderNoImage"}>
      {images[0] ? (
        <div className="objectHeroImage">
          <img src={images[0]} alt={objectLabel(object) || "Objektbild"} />
        </div>
      ) : null}
      <div className="objectHeroContent">
        <div className="objectHeroTitle">
          <div>
            <span className="eyebrow">Wirtschaftseinheit</span>
            <h3>{object.objectNumber || object.objectName || "k.A."}</h3>
            <p>{object.address || "Adressbereich k.A."}</p>
          </div>
          <span className={status === "Prüfung" ? "trafficBadge trafficYellow" : status === "Aktiv" ? "trafficBadge trafficGreen" : "trafficBadge"}>
            {status}
          </span>
        </div>
        <div className="objectMasterGrid">
          <InfoLine label="Objektname" value={object.objectName || "k.A."} />
          <InfoLine label="Fonds" value={object.fund || "k.A."} />
          <InfoLine label="Baujahr" value={object.constructionYear || "k.A."} />
          <InfoLine label="Wohneinheiten" value={object.unitCount || "k.A."} />
          <InfoLine label="Gewerbeeinheiten" value="k.A." />
          <InfoLine label="Gesamtfläche" value={object.totalLivingAreaSqm ? `${object.totalLivingAreaSqm} m2` : "k.A."} />
          <InfoLine label="Wohnfläche sanierte Wohnung" value={object.wohnflaecheSanierteWohnung ? `${object.wohnflaecheSanierteWohnung} m2` : "k.A."} />
        </div>
        <div className="objectHeaderMetrics">
          <CostMetric label="Gesamtkosten" value={formatNullableCurrency(grossCost)} />
          <CostMetric label="Ø Kosten pro WE" value={formatNullableCurrency(costPerRenovatedUnit(documents, grossCost))} />
          <CostMetric label="Kosten pro m²" value={formatEuroPerSqm(costPerSqmForObject(object, grossCost))} />
          <CostMetric label="Dokumente" value={`${formatNumber(documents.length)} / ${formatNumber(totalDocuments)}`} />
          <CostMetric label="Gewerke" value={formatNumber(measureCount)} />
          <CostMetric label="Datenqualität" value={dataQuality} />
        </div>
      </div>
    </div>
  );
}

function ObjectOverviewTab({
  object,
  documents,
  projects,
  images,
  onUpdateObject,
  onAddImages
}: {
  object: ObjectRecord;
  documents: ObjectAnalysis[];
  projects: ProjectRecord[];
  images: string[];
  onUpdateObject: (field: keyof ObjectRecord, value: string) => void;
  onAddImages: (files: FileList) => void;
}) {
  const rows = buildMeasureRows(documents);
  const totalGross = sumValues(rows.map((row) => row.grossCost));
  const chartRows: TradeCostChartRow[] = rows.map((row) => ({
    id: row.id,
    cluster: row.cluster,
    beschreibung: row.description,
    kosten_brutto: row.grossCost,
    anteil_prozent: row.grossCost !== null && totalGross ? (row.grossCost / totalGross) * 100 : null,
    quelle: row.source,
    status: row.status
  }));

  return (
    <div className="objectOverviewBoard">
      <ObjectImageUpload images={images} onAdd={onAddImages} />
      <section className="panel objectFormPanel">
        <div className="panelHeader compactHeader">
          <div>
            <h3>Stammdaten</h3>
            <p>Koordinaten für die Karte werden hier gepflegt.</p>
          </div>
        </div>
        <ObjectForm object={object} onChange={onUpdateObject} />
      </section>
      <section className="panel insightCard">
        <h3>Zusammenfassung der Maßnahmen</h3>
        {rows.length === 0 ? <p className="muted">k.A.</p> : (
          <div className="measurePillGrid">
            {rows.slice(0, 8).map((row) => (
              <span key={row.id}>{tradeIcon(row.cluster)} {row.cluster} <strong>{formatNullableCurrency(row.grossCost)}</strong></span>
            ))}
          </div>
        )}
      </section>
      <ObjectYearCostChart documents={documents} />
      <TradeCostBarChart rows={chartRows} />
      <ObjectTimeline documents={documents} projects={projects} />
    </div>
  );
}

function EntrancesTab({
  entrances,
  onCreate,
  onUpdate,
  onDelete
}: {
  entrances: EntranceRecord[];
  onCreate: () => void;
  onUpdate: (id: string, field: keyof EntranceRecord, value: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="stackSection">
      <div className="panelHeader compactHeader">
        <div>
          <h3>Hauseingänge</h3>
          <p>Ein Objekt kann eine ganze Wirtschaftseinheit wie Pamirweg 1-14 umfassen.</p>
        </div>
        <button className="buttonPrimary" type="button" onClick={onCreate}>Hauseingang anlegen</button>
      </div>
      {entrances.length === 0 ? <div className="emptyState"><p>Noch keine Hauseingänge angelegt.</p></div> : null}
      <div className="entranceGrid">
        {entrances.map((entrance) => (
          <article className="entranceCard" key={entrance.id}>
            <EntranceForm entrance={entrance} onChange={(field, value) => onUpdate(entrance.id, field, value)} />
            <div className="headerActions">
              <button type="button" onClick={() => onDelete(entrance.id)}>Hauseingang loeschen</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function ObjectProjectsTab({ projects }: { projects: ProjectRecord[] }) {
  return (
    <div className="tableWrap compactTable">
      <table>
        <thead>
          <tr><th>Projekt</th><th>Projektart</th><th>Hauseingang</th><th>Status</th><th>Budget brutto</th></tr>
        </thead>
        <tbody>
          {projects.length === 0 ? <tr><td colSpan={5}>k.A.</td></tr> : projects.map((project) => (
            <tr key={project.id}>
              <td>{project.projectName || "k.A."}</td>
              <td>{project.projectType || "k.A."}</td>
              <td>{project.entrance || "k.A."}</td>
              <td>{project.status || "k.A."}</td>
              <td>{project.budgetGross || "k.A."}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ObjectDocumentsTab({
  documents,
  costDocuments,
  costBasis,
  manualCostDocumentIds,
  onToggleCostDocument,
  onSelect,
  onDelete
}: {
  documents: ObjectAnalysis[];
  costDocuments: ObjectAnalysis[];
  costBasis: CostBasisMode;
  manualCostDocumentIds: Set<string>;
  onToggleCostDocument: (documentId: string, checked: boolean) => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [filters, setFilters] = useState({ year: "", trade: "", type: "", object: "" });
  const basisDocuments = costBasis === "manual" ? costDocuments : applyCostBasis(costDocuments, costBasis, manualCostDocumentIds);
  const filteredDocuments = basisDocuments.filter((document) => (
    (!filters.year || fieldOrUnknown(document.year).includes(filters.year)) &&
    (!filters.trade || formatClusters(document).toLowerCase().includes(filters.trade.toLowerCase())) &&
    (!filters.type || fieldOrUnknown(document.documentType).toLowerCase().includes(filters.type.toLowerCase())) &&
    (!filters.object || fieldOrUnknown(document.objectAddress).toLowerCase().includes(filters.object.toLowerCase()))
  ));
  return (
    <div className="documentBoard">
      <div className="measureFilters">
        <label className="filterInput"><span>Jahr</span><input value={filters.year} onChange={(event) => setFilters({ ...filters, year: event.target.value })} placeholder="Alle" /></label>
        <label className="filterInput"><span>Gewerk</span><input value={filters.trade} onChange={(event) => setFilters({ ...filters, trade: event.target.value })} placeholder="Alle" /></label>
        <label className="filterInput"><span>Rechnungsart</span><input value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })} placeholder="Alle" /></label>
        <label className="filterInput"><span>Objekt</span><input value={filters.object} onChange={(event) => setFilters({ ...filters, object: event.target.value })} placeholder="Alle" /></label>
      </div>
      <div className="documentCardGrid">
        {filteredDocuments.length === 0 ? <div className="emptyState"><p>k.A.</p></div> : filteredDocuments.map((document) => (
          <article className="documentPreviewCard" key={document.id} onClick={() => onSelect(document.id)}>
            {costBasis === "manual" ? (
              <label className="costIncludeCheck" onClick={(event) => event.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={manualCostDocumentIds.has(document.id)}
                  onChange={(event) => onToggleCostDocument(document.id, event.target.checked)}
                />
                In Kostenberechnung einbeziehen
              </label>
            ) : null}
            <span className={`documentTypeBadge ${documentTypeBadgeClass(document)}`}>{documentTypeValue(document)}</span>
            <h3>{fieldOrUnknown(document.provider)}</h3>
            <p className="documentMetaLine">Objekt {fieldOrUnknown(document.objectNumber)}</p>
            <p className="documentMetaLine">{weLabel(document)}</p>
            <div className="documentWarnings">
              {documentWarningItems(document).map((item) => <span key={item}>{item}</span>)}
            </div>
            {isProgressInvoiceDocument(document) ? <p>{fieldOrUnknown(document.installmentNumber ?? emptyField<string>())}</p> : null}
            <strong>{formatCurrency(document.totalCost)}</strong>
            <em>{formatKiStatus(document)}</em>
            <div className="documentCardActions">
              <button type="button">PDF ansehen</button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(document.id);
                }}
              >
                Bearbeiten
              </button>
              <button
                className="buttonDanger"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(document.id);
                }}
              >
                Löschen
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function documentWarningItems(document: ObjectAnalysis): string[] {
  const warnings: string[] = [];
  if (fieldOrUnknown(document.apartmentNumber) === "k.A.") warnings.push("⚠ WE nicht hinterlegt");
  if (fieldOrUnknown(document.documentDate) === "k.A.") warnings.push("⚠ Datum nicht erkannt");
  if (!document.clusters.length && !(document.measureDetails?.length)) warnings.push("⚠ Gewerk nicht erkannt");
  if (fieldOrUnknown(document.documentNumber) === "k.A.") warnings.push("⚠ Dokumentnummer nicht erkannt");
  return warnings;
}

function weLabel(document: ObjectAnalysis): string {
  const value = fieldOrUnknown(document.apartmentNumber);
  return value === "k.A." ? "WE nicht hinterlegt" : `WE ${value}`;
}

function ObjectApartmentsTab({ documents }: { documents: ObjectAnalysis[] }) {
  const rows = buildApartmentRows(documents);
  return (
    <div className="panel panelFlush apartmentBoard">
      <div className="panelHeader">
        <div>
          <h3>Wohnungen</h3>
          <p>Automatisch aus Dokumenten und Maßnahmen abgeleitete WE-Übersicht.</p>
        </div>
      </div>
      <div className="tableWrap compactTable">
        <table>
          <thead><tr><th>WE</th><th>Maßnahmen</th><th>Kosten</th><th>Dokumente</th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={4}>Keine WE-Nummern hinterlegt.</td></tr> : rows.map((row) => (
              <tr key={row.apartment}>
                <td><strong>{row.apartment}</strong></td>
                <td>{row.measures}</td>
                <td>{formatNullableCurrency(row.cost)}</td>
                <td>{formatNumber(row.documentCount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ObjectMeasuresTab({
  documents,
  costDocuments,
  projects,
  assignments,
  onUpdateDocument
}: {
  documents: ObjectAnalysis[];
  costDocuments: ObjectAnalysis[];
  projects: ProjectRecord[];
  assignments: Record<string, string | null>;
  onUpdateDocument: (id: string, updater: (document: ObjectAnalysis) => ObjectAnalysis) => void;
}) {
  const [selectedMeasureId, setSelectedMeasureId] = useState<string | null>(null);
  const [filters, setFilters] = useState({ project: "", year: "", documentType: "" });
  const filteredDocuments = costDocuments.filter((document) => {
    const project = projects.find((entry) => entry.id === assignments[document.id]);
    return (
      (!filters.project || (project?.projectName ?? "").toLowerCase().includes(filters.project.toLowerCase())) &&
      (!filters.year || String(document.year.value ?? "").includes(filters.year)) &&
      (!filters.documentType || fieldOrUnknown(document.documentType).toLowerCase().includes(filters.documentType.toLowerCase()))
    );
  });
  const rows = buildMeasureRows(filteredDocuments);
  const totalGross = sumValues(rows.map((row) => row.grossCost));
  const selectedRow = rows.find((row) => row.id === selectedMeasureId) ?? rows[0] ?? null;

  function updateMeasure(row: MeasureRow, field: "cluster" | "description" | "grossCost" | "status", value: string) {
    onUpdateDocument(row.documentId, (document) => ({
      ...document,
      measureDetails: document.measureDetails?.map((detail) => {
        if (detail.cluster !== row.cluster && detail.abschnitt !== row.section) return detail;
        if (field === "cluster") return { ...detail, cluster: value as MeasureCluster };
        if (field === "description") return { ...detail, beschreibung: value };
        if (field === "grossCost") return { ...detail, summe: parseGermanNumber(value) };
        return detail;
      }),
      clusters: document.clusters.map((cluster) => {
        if (cluster.id !== row.measureId) return cluster;
        if (field === "cluster") return { ...cluster, cluster: manualField(value as MeasureCluster) };
        if (field === "description") return { ...cluster, description: manualField(value) };
        if (field === "grossCost") return { ...cluster, totalCost: manualNumberField(value) };
        return cluster;
      }),
      dataQuality: field === "status" ? manualField(value) : document.dataQuality
    }));
  }

  return (
    <div className="measuresWorkspace">
      <div className="measureFilters">
        <label className="filterInput"><span>Projekt</span><input value={filters.project} onChange={(event) => setFilters({ ...filters, project: event.target.value })} placeholder="Alle" /></label>
        <label className="filterInput"><span>Jahr</span><input value={filters.year} onChange={(event) => setFilters({ ...filters, year: event.target.value })} placeholder="Alle" /></label>
        <label className="filterInput"><span>Dokumenttyp</span><input value={filters.documentType} onChange={(event) => setFilters({ ...filters, documentType: event.target.value })} placeholder="Alle" /></label>
      </div>
      <div className="tableWrap compactTable measureListTable">
        <table>
          <thead>
            <tr><th>Gewerk</th><th>Beschreibung</th><th>Jahr</th><th>Wohnungen</th><th>Dokumente</th><th>Kosten brutto</th><th>Anteil</th><th>Status</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={8}>k.A.</td></tr> : rows.map((row) => (
              <tr key={row.id} onClick={() => setSelectedMeasureId(row.id)}>
                <td>{tradeIcon(row.cluster)} {row.cluster}</td>
                <td>{row.description}</td>
                <td>{extractYearFromMeasure(row, documents)}</td>
                <td>{collectApartments(documentsForMeasure(row, documents))}</td>
                <td>{formatNumber(documentsForMeasure(row, documents).length)}</td>
                <td>{formatNullableCurrency(row.grossCost)}</td>
                <td>{formatPercent(row.grossCost, totalGross)}</td>
                <td>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selectedMeasureId ? (
        <MeasureDetailPanel
          row={selectedRow}
          totalGross={totalGross}
          documents={documents}
          onClose={() => setSelectedMeasureId(null)}
          onUpdate={updateMeasure}
        />
      ) : null}
    </div>
  );
}

function MeasureDetailPanel({
  row,
  totalGross,
  documents,
  onClose,
  onUpdate
}: {
  row: MeasureRow | null;
  totalGross?: number | null;
  documents?: ObjectAnalysis[];
  onClose: () => void;
  onUpdate?: (row: MeasureRow, field: "cluster" | "description" | "grossCost" | "status", value: string) => void;
}) {
  if (!row) return null;
  const scopedDocuments = documents ? documentsForMeasure(row, documents) : [];
  return (
    <aside className="measureSlideOver" aria-label="Maßnahmen-Details">
      <div className="slideOverHeader">
        <div>
          <span className="eyebrow">Detail</span>
          <h3>{row.cluster}</h3>
        </div>
        <button type="button" onClick={onClose}>Schliessen</button>
      </div>
      {onUpdate ? (
        <div className="measureCardDetails">
          <EditInput label="Gewerk" value={row.cluster === "k.A." ? "" : row.cluster} onChange={(value) => onUpdate(row, "cluster", value)} />
          <EditInput label="Beschreibung" value={row.description === "k.A." ? "" : row.description} onChange={(value) => onUpdate(row, "description", value)} />
          <EditInput label="Kosten brutto" value={row.grossCost === null ? "" : String(row.grossCost).replace(".", ",")} onChange={(value) => onUpdate(row, "grossCost", value)} />
        </div>
      ) : null}
      <InfoLine label="Beschreibung" value={row.description} />
      <InfoLine label="Abschnitt" value={row.section} />
      <InfoLine label="Kosten" value={formatNullableCurrency(row.grossCost)} />
      <InfoLine label="Anteil" value={formatPercent(row.grossCost, totalGross ?? null)} />
      <InfoLine label="Betroffene Wohnungen" value={documents ? collectApartments(scopedDocuments) : "k.A."} />
      <InfoLine label="Dokumente" value={documents ? formatNumber(scopedDocuments.length) : "k.A."} />
      <InfoLine label="Quelle" value={row.source} />
      <InfoLine label="KI-Sicherheit" value={row.confidence} />
      <button type="button" className="buttonPrimary">Bearbeiten</button>
      <h4>Erkannte Positionen</h4>
      {row.lineItems.length === 0 ? <p className="muted">k.A.</p> : (
        <ul>
          {row.lineItems.map((item) => (
            <li key={`${item.position}-${item.description}`}>{item.position} {item.description || "k.A."} {item.totalPrice ? formatNullableCurrency(item.totalPrice) : ""}</li>
          ))}
        </ul>
      )}
    </aside>
  );
}

function measureRowFromTradeGroup(group: TradeGroupRow): MeasureRow {
  return {
    id: group.cluster,
    documentId: "",
    measureId: "",
    cluster: group.cluster,
    description: group.count > 0 ? `${formatNumber(group.count)} Dokument(e) zugeordnet` : "Kein Dokument zugeordnet",
    netCost: null,
    vatCost: null,
    grossCost: group.total,
    source: group.count > 0 ? "Dokumente / KI-Zuordnung" : "Standard-Gewerkekatalog",
    status: group.status,
    section: group.cluster,
    confidence: group.count > 0 ? "Dokumentenbasiert" : "k.A.",
    lineItems: []
  };
}

function ObjectCostsTab({
  object,
  entrances,
  projects,
  documents,
  allProjects,
  assignments
}: {
  object: ObjectRecord;
  entrances: EntranceRecord[];
  projects: ProjectRecord[];
  documents: ObjectAnalysis[];
  allProjects: ProjectRecord[];
  assignments: Record<string, string | null>;
}) {
  const [costView, setCostView] = useState<CostViewMode>("comparison");
  const objectTotal = sumValues(documents.map((document) => document.totalCost.value));
  const offerTotal = sumValues(documents.filter(isOfferDocument).map((document) => document.totalCost.value));
  const progressTotal = sumValues(documents.filter(isProgressInvoiceDocument).map((document) => document.totalCost.value));
  const finalTotal = finalGrossCost(documents);
  const displayedTotal = costView === "offers"
    ? offerTotal
    : costView === "invoices"
      ? finalTotal
      : objectTotal;
  const byCluster = groupByCluster(documents);
  const byDocumentType = groupByDocumentType(documents);
  return (
    <div className="costHierarchy">
      <CostViewSwitch value={costView} onChange={setCostView} />
      <CostMetric label={costView === "offers" ? "Auswertung nach Angeboten" : costView === "invoices" ? "Auswertung nach Rechnungen" : `Gesamtkosten Objekt ${object.objectNumber || "k.A."}`} value={formatNullableCurrency(displayedTotal)} />
      <CostProgressBars documents={documents} mode={costView} />
      <div className="costSummaryGrid">
        <CostMetric label="Angebote" value={formatNullableCurrency(offerTotal)} />
        <CostMetric label="Abschläge" value={formatNullableCurrency(progressTotal)} />
        <CostMetric label="Finale Kosten" value={formatNullableCurrency(finalTotal)} />
        <CostMetric label="Kosten netto" value={formatNullableCurrency(sumValues(documents.map((document) => document.netCost.value)))} />
        <CostMetric label="MwSt" value={formatNullableCurrency(sumValues(documents.map((document) => document.vatCost.value)))} />
        <CostMetric label="Kosten brutto" value={formatNullableCurrency(objectTotal)} />
        <CostMetric label="Kosten je sanierte WE" value={formatNullableCurrency(costPerRenovatedUnit(documents, objectTotal))} />
        <CostMetric label="Kosten je m²" value={formatEuroPerSqm(costPerSqmForObject(object, objectTotal))} />
      </div>
      {documents.some(isProgressInvoiceDocument) && documents.some(isFinalInvoiceDocument) ? (
        <>
          <div className="uploadStatus">
            Schlussrechnung enthält vermutlich bereits vorherige Abschlagszahlungen. Bitte keine doppelte Kostenaddition vornehmen.
          </div>
          <p className="costBasisHint">Kostenbasis: aktuelle Auswahl · {formatNumber(documents.length)} Dokumente berücksichtigt</p>
        </>
      ) : null}
      <div className="tableWrap compactTable">
        <table>
          <thead>
            <tr><th>Ebene</th><th>Bezeichnung</th><th>Projekte</th><th>Dokumente</th><th>Kosten brutto</th></tr>
          </thead>
          <tbody>
            {entrances.length === 0 ? <tr><td colSpan={5}>Keine Hauseingänge angelegt.</td></tr> : entrances.map((entrance) => {
              const entranceProjects = projects.filter((project) => project.entranceId === entrance.id);
              const entranceDocuments = documents.filter((document) => documentBelongsToEntrance(document, entrance, allProjects, assignments));
              return (
                <tr key={entrance.id}>
                  <td>Hauseingang</td>
                  <td>{entranceLabel(entrance) || "k.A."}</td>
                  <td>{formatNumber(entranceProjects.length)}</td>
                  <td>{formatNumber(entranceDocuments.length)}</td>
                  <td>{formatNullableCurrency(sumValues(entranceDocuments.map((document) => document.totalCost.value)))}</td>
                </tr>
              );
            })}
            {projects.map((project) => {
              const projectDocuments = documents.filter((document) => assignments[document.id] === project.id);
              return (
                <tr key={project.id}>
                  <td>Projekt</td>
                  <td>{project.projectName || "k.A."}</td>
                  <td>1</td>
                  <td>{formatNumber(projectDocuments.length)}</td>
                  <td>{formatNullableCurrency(sumValues(projectDocuments.map((document) => document.totalCost.value)))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="costSplitGrid">
        <div className="tableWrap compactTable">
          <table>
            <thead><tr><th>Gewerk</th><th>Dokumente</th><th>Kosten brutto</th></tr></thead>
            <tbody>
              {byCluster.length === 0 ? <tr><td colSpan={3}>k.A.</td></tr> : byCluster.map((entry) => (
                <tr key={entry.cluster}><td>{entry.cluster}</td><td>{entry.count}</td><td>{formatNullableCurrency(entry.total)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="tableWrap compactTable">
          <table>
            <thead><tr><th>Dokumenttyp</th><th>Dokumente</th><th>Kosten brutto</th></tr></thead>
            <tbody>
              {byDocumentType.length === 0 ? <tr><td colSpan={3}>k.A.</td></tr> : byDocumentType.map((entry) => (
                <tr key={entry.type}><td>{entry.type}</td><td>{entry.count}</td><td>{formatNullableCurrency(entry.total)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ObjectTradesTab({ documents }: { documents: ObjectAnalysis[] }) {
  const [selectedMeasureId, setSelectedMeasureId] = useState<string | null>(null);
  const groups = groupByCluster(documents);
  const totalGross = groups.reduce((sum, row) => sum + row.total, 0);
  const chartRows: TradeCostChartRow[] = groups.map((row) => ({
    id: row.cluster,
    cluster: row.cluster,
    beschreibung: row.count > 0 ? `${formatNumber(row.count)} Dokument(e) zugeordnet` : "Kein Dokument zugeordnet",
    kosten_brutto: row.total,
    anteil_prozent: row.share,
    quelle: row.count > 0 ? "Dokumente / KI-Zuordnung" : "Standard-Gewerkekatalog",
    status: row.status
  }));
  const donutRows = groups.filter((entry) => entry.total > 0);
  const selectedGroup = groups.find((row) => row.cluster === selectedMeasureId) ?? null;
  const selectedRow = selectedGroup ? measureRowFromTradeGroup(selectedGroup) : null;

  return (
    <div className="tradesBoard">
      <TradeCostBarChart rows={chartRows} onSelect={setSelectedMeasureId} />
      <section className="panel tradeDonutCard">
        <div className="panelHeader compactHeader">
          <div>
            <h3>Gewerke Verteilung</h3>
            <p>Anteil der Bruttokosten je Gewerk.</p>
          </div>
        </div>
        <div className="tradeDonutLayout">
          <div className="tradeDonutChart">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={donutRows} dataKey="total" nameKey="cluster" innerRadius={70} outerRadius={108} paddingAngle={2}>
                  {donutRows.map((entry, index) => <Cell key={entry.cluster} fill={tradeChartColor(index)} />)}
                </Pie>
                <Tooltip formatter={(value) => formatNullableCurrency(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="tradeLegend" aria-label="Gewerke-Legende">
            {donutRows.length === 0 ? (
              <p className="muted">Keine Gewerke mit Kosten vorhanden.</p>
            ) : donutRows.map((entry, index) => (
              <button
                type="button"
                className="tradeLegendRow"
                key={entry.cluster}
                onClick={() => setSelectedMeasureId(entry.cluster)}
              >
                <span className="tradeLegendDot" style={{ backgroundColor: tradeChartColor(index) }} />
                <span className="tradeLegendName">{entry.cluster}</span>
                <strong>{entry.share === null ? "k.A." : `${formatNullableNumber(roundMoney(entry.share))} %`}</strong>
              </button>
            ))}
          </div>
        </div>
      </section>
      <section className="panel panelFlush">
        <div className="panelHeader">
          <div>
            <h3>Gewerke Details</h3>
            <p>Automatische Gruppierung aller erkannten Kosten.</p>
          </div>
        </div>
        <div className="tableWrap compactTable">
          <table>
            <thead><tr><th>Gewerk</th><th>Dokumente</th><th>Gesamtkosten</th><th>Anteil</th><th>Angebotssumme</th><th>Rechnungssumme</th></tr></thead>
            <tbody>
              {groups.map((entry) => (
                <tr key={entry.cluster} onClick={() => setSelectedMeasureId(entry.cluster)}>
                  <td>{tradeIcon(entry.cluster)} {entry.cluster}</td>
                  <td>{formatNumber(entry.count)}</td>
                  <td>{formatNullableCurrency(entry.total)}</td>
                  <td>{entry.share === null ? "k.A." : `${formatNullableNumber(roundMoney(entry.share))} %`}</td>
                  <td>{formatNullableCurrency(entry.offer)}</td>
                  <td>{formatNullableCurrency(entry.invoice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {selectedRow ? (
        <MeasureDetailPanel
          row={selectedRow}
          totalGross={totalGross}
          documents={documents}
          onClose={() => setSelectedMeasureId(null)}
        />
      ) : null}
    </div>
  );
}

function DetectedObjectImages({ images, onAdd }: { images: string[]; onAdd: (files: FileList) => void }) {
  return (
    <div className="detectedImages">
      <label className="smallUploadButton">
        Bilder
        <input
          type="file"
          accept=".png,.jpg,.jpeg,.webp"
          multiple
          onChange={(event) => {
            if (event.target.files && event.target.files.length > 0) {
              onAdd(event.target.files);
              event.currentTarget.value = "";
            }
          }}
        />
      </label>
      {images.length > 0 ? (
        <div className="miniImageStrip">
          {images.slice(0, 4).map((image, index) => (
            <img key={`${image}-${index}`} src={image} alt={`Objektbild ${index + 1}`} />
          ))}
        </div>
      ) : (
        <span className="muted">Keine Bilder</span>
      )}
    </div>
  );
}

function ObjectImageUpload({ images, onAdd }: { images: string[]; onAdd: (files: FileList) => void }) {
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  return (
    <section className="objectImagesPanel">
      <div className="panelHeader compactHeader">
        <div>
          <h3>Objektbilder</h3>
          <p>Bilder lokal auswählen und als Vorschau am Objekt anzeigen.</p>
        </div>
        <label className="imageUploadButton">
          Bilder hochladen
          <input
            type="file"
            accept=".png,.jpg,.jpeg,.webp"
            multiple
            onChange={(event) => {
              if (event.target.files && event.target.files.length > 0) {
                onAdd(event.target.files);
                event.currentTarget.value = "";
              }
            }}
          />
        </label>
      </div>
      {images.length === 0 ? (
        <div className="imageEmpty">Noch keine Bilder für dieses Objekt ausgewählt.</div>
      ) : (
        <div className="imageGallerySections">
          {(["Vor Sanierung", "Waehrend Sanierung", "Nach Sanierung"] as const).map((section, sectionIndex) => {
            const sectionImages = images.filter((_, index) => index % 3 === sectionIndex);
            return (
              <section key={section} className="imageGallerySection">
                <h4>{section}</h4>
                {sectionImages.length === 0 ? <p className="muted">k.A.</p> : (
                  <div className="objectImageGrid">
                    {sectionImages.map((image, index) => (
                      <button className="imageLightboxButton" type="button" key={`${image}-${index}`} onClick={() => setLightboxImage(image)}>
                        <img src={image} alt={`${section} ${index + 1}`} />
                      </button>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
      {lightboxImage ? (
        <div className="imageLightbox" onClick={() => setLightboxImage(null)}>
          <button type="button" onClick={() => setLightboxImage(null)}>Schliessen</button>
          <img src={lightboxImage} alt="Objektbild gross" />
        </div>
      ) : null}
    </section>
  );
}

function ProjectsView({
  projects,
  objects,
  entrances,
  selectedProject,
  activeTab,
  documents,
  assignments,
  onCreate,
  onDelete,
  onSelectProject,
  onSetTab,
  onUpdateProject,
  onSelectDocument,
  onAssign,
  onRemoveDocument,
  onDeleteDocument
}: {
  projects: ProjectRecord[];
  objects: ObjectRecord[];
  entrances: EntranceRecord[];
  selectedProject: ProjectRecord | null;
  activeTab: ProjectTab;
  documents: ObjectAnalysis[];
  assignments: Record<string, string | null>;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onSelectProject: (id: string) => void;
  onSetTab: (tab: ProjectTab) => void;
  onUpdateProject: (id: string, field: keyof ProjectRecord, value: string) => void;
  onSelectDocument: (id: string) => void;
  onAssign: (documentId: string, projectId: string | null) => void;
  onRemoveDocument: (id: string) => void;
  onDeleteDocument: (id: string) => void;
}) {
  return (
    <section className="panel">
      <div className="panelHeader">
        <div>
          <h2>Projekte</h2>
          <p>Projekt erstellen, bearbeiten, loeschen und Dokumente projektbezogen pruefen.</p>
        </div>
        <button className="buttonPrimary" type="button" onClick={onCreate}>Projekt erstellen</button>
      </div>
      <div className="projectLayout">
        <div className="projectList">
          {projects.length === 0 ? <p className="muted">Noch keine Projekte vorhanden.</p> : null}
          {projects.map((project) => (
            <button
              key={project.id}
              className={selectedProject?.id === project.id ? "projectListItem selectedRow" : "projectListItem"}
              type="button"
              onClick={() => onSelectProject(project.id)}
            >
              <strong>{project.projectName || "k.A."}</strong>
              <span>{project.object || "k.A."}</span>
            </button>
          ))}
        </div>
        <div>
          {selectedProject ? (
            <>
              <div className="tabs">
                {projectTabs.map((tab) => (
                  <button
                    key={tab.key}
                    className={activeTab === tab.key ? "tabButton tabButtonActive" : "tabButton"}
                    type="button"
                    onClick={() => onSetTab(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              {activeTab === "overview" ? (
                <>
                  <ProjectForm
                    project={selectedProject}
                    objects={objects}
                    entrances={entrances}
                    onChange={(field, value) => onUpdateProject(selectedProject.id, field, value)}
                  />
                  <div className="headerActions projectActions">
                    <button type="button" onClick={() => onDelete(selectedProject.id)}>Projekt loeschen</button>
                  </div>
                </>
              ) : null}
              {activeTab === "documents" ? (
                <ProjectDocumentsTab
                  documents={documents}
                  projects={projects}
                  assignments={assignments}
                  onSelect={onSelectDocument}
                  onAssign={onAssign}
                  onRemove={onRemoveDocument}
                  onDelete={onDeleteDocument}
                />
              ) : null}
              {activeTab === "costs" ? (
                <ProjectCostsTab project={selectedProject} documents={documents} />
              ) : null}
              {activeTab === "measures" ? (
                <ProjectMeasuresTab documents={documents} />
              ) : null}
              {activeTab === "ai" ? (
                <ProjectAiTab documents={documents} />
              ) : null}
            </>
          ) : (
            <div className="emptyState"><p>Kein Projekt ausgewählt.</p></div>
          )}
        </div>
      </div>
    </section>
  );
}

function ProjectDocumentsTab({
  documents,
  projects,
  assignments,
  onSelect,
  onAssign,
  onRemove,
  onDelete
}: {
  documents: ObjectAnalysis[];
  projects: ProjectRecord[];
  assignments: Record<string, string | null>;
  onSelect: (id: string) => void;
  onAssign: (documentId: string, projectId: string | null) => void;
  onRemove: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="tableWrap">
      <table className="dataTable">
        <thead>
          <tr>
            <th>Dateiname</th>
            <th>Dokumenttyp</th>
            <th>Anbieter</th>
            <th>Dokumentnummer</th>
            <th>Datum</th>
            <th>WE-Nummer</th>
            <th>Lage</th>
            <th>Netto</th>
            <th>MwSt</th>
            <th>Brutto</th>
            <th>KI-Status</th>
            <th>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {documents.length === 0 ? (
            <tr><td colSpan={12}>k.A.</td></tr>
          ) : documents.map((document) => (
            <tr key={document.id}>
              <td>{sourceLabel(document.totalCost).split(" - ")[0]}</td>
              <td><span className={`documentTypeBadge ${documentTypeBadgeClass(document)}`}>{documentTypeValue(document)}</span></td>
              <td>{fieldOrUnknown(document.provider)}</td>
              <td>{fieldOrUnknown(document.documentNumber)}</td>
              <td>{fieldOrUnknown(document.documentDate)}</td>
              <td>{fieldOrUnknown(document.apartmentNumber)}</td>
              <td>{fieldOrUnknown(document.location)}</td>
              <td>{formatCurrency(document.netCost)}</td>
              <td>{formatCurrency(document.vatCost)}</td>
              <td>{formatCurrency(document.totalCost)}</td>
              <td>{formatKiStatus(document)}</td>
              <td>
                <div className="rowActions">
                  <button type="button" onClick={() => onSelect(document.id)}>Ansehen</button>
                  <button type="button" onClick={() => onSelect(document.id)}>Bearbeiten</button>
                  <button type="button">KI erneut</button>
                  <select value={assignments[document.id] ?? ""} onChange={(event) => onAssign(document.id, event.target.value || null)}>
                    <option value="">Verschieben</option>
                    {projects.map((project) => <option key={project.id} value={project.id}>{project.projectName || "k.A."}</option>)}
                  </select>
                  <button type="button" onClick={() => onRemove(document.id)}>Entfernen</button>
                  <button type="button" onClick={() => onDelete(document.id)}>Loeschen</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProjectCostsTab({ project, documents }: { project: ProjectRecord; documents: ObjectAnalysis[] }) {
  const [costView, setCostView] = useState<CostViewMode>("comparison");
  const summary = calculateProjectCosts(project, documents);
  return (
    <div className="projectCostBoard">
      <CostViewSwitch value={costView} onChange={setCostView} />
      <CostProgressBars documents={documents} mode={costView} />
      <div className="costSummaryGrid">
        <CostMetric label="Summe Angebote netto" value={formatNullableCurrency(summary.offersNet)} />
        <CostMetric label="Summe Angebote brutto" value={formatNullableCurrency(summary.offersGross)} />
        <CostMetric label="Summe Abschläge netto" value={formatNullableCurrency(summary.progressNet)} />
        <CostMetric label="Summe Abschläge brutto" value={formatNullableCurrency(summary.progressGross)} />
        <CostMetric label="Summe Rechnungen netto" value={formatNullableCurrency(summary.invoicesNet)} />
        <CostMetric label="Summe Rechnungen brutto" value={formatNullableCurrency(summary.invoicesGross)} />
        <CostMetric label="Summe Nachträge netto" value={formatNullableCurrency(summary.supplementsNet)} />
        <CostMetric label="Summe Nachträge brutto" value={formatNullableCurrency(summary.supplementsGross)} />
        <CostMetric label="Summe Schlussrechnungen netto" value={formatNullableCurrency(summary.finalInvoicesNet)} />
        <CostMetric label="Summe Schlussrechnungen brutto" value={formatNullableCurrency(summary.finalInvoicesGross)} />
        <CostMetric label="Abweichung Angebot zu Rechnung" value={formatNullableCurrency(summary.offerToInvoiceDelta)} />
        <CostMetric label="Abweichung Budget zu Ist" value={formatNullableCurrency(summary.budgetToActualDelta)} />
        <CostMetric label="Kosten pro sanierte Wohnung" value={formatNullableCurrency(summary.costPerApartment)} />
        <CostMetric label="Kosten pro m²" value={formatEuroPerSqm(summary.costPerSqm)} />
      </div>
    </div>
  );
}

function CostViewSwitch({ value, onChange }: { value: CostViewMode; onChange: (value: CostViewMode) => void }) {
  return (
    <div className="costViewSwitch" role="group" aria-label="Kostenbasis auswählen">
      {[
        { key: "comparison" as const, label: "Vergleich" },
        { key: "offers" as const, label: "Angebote" },
        { key: "invoices" as const, label: "Rechnungen" }
      ].map((option) => (
        <button
          key={option.key}
          className={value === option.key ? "active" : ""}
          type="button"
          onClick={() => onChange(option.key)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function CostBasisControl({
  value,
  onChange,
  consideredCount
}: {
  value: CostBasisMode;
  onChange: (value: CostBasisMode) => void;
  consideredCount: number;
}) {
  return (
    <section className="costBasisControl">
      <label className="filterInput">
        <span>Kostenbasis</span>
        <select value={value} onChange={(event) => onChange(event.target.value as CostBasisMode)}>
          {costBasisOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <p>Kostenbasis: {costBasisLabel(value)} · {formatNumber(consideredCount)} Dokumente berücksichtigt</p>
    </section>
  );
}

function ObjectPageFilterBar({
  filters,
  onChange,
  documents
}: {
  filters: ObjectPageFilters;
  onChange: (filters: ObjectPageFilters) => void;
  documents: ObjectAnalysis[];
}) {
  const options = buildObjectPageFilterOptions(documents);
  const hasActiveFilter = Object.values(filters).some(Boolean);
  return (
    <section className="objectPageFilterBar" aria-label="Objektfilter">
      <FilterSelect label="Jahr" value={filters.year} options={options.years} onChange={(year) => onChange({ ...filters, year })} />
      <FilterSelect label="Gewerk" value={filters.trade} options={options.trades} onChange={(trade) => onChange({ ...filters, trade })} />
      <FilterSelect label="Rechnungsart" value={filters.documentType} options={options.documentTypes} onChange={(documentType) => onChange({ ...filters, documentType })} />
      <FilterSelect label="Objekt" value={filters.object} options={options.objects} onChange={(object) => onChange({ ...filters, object })} />
      <button className="buttonSecondary" type="button" onClick={() => onChange(emptyObjectPageFilters)} disabled={!hasActiveFilter}>
        Filter zurücksetzen
      </button>
    </section>
  );
}

function CostProgressBars({ documents, mode }: { documents: ObjectAnalysis[]; mode: CostViewMode }) {
  const offerTotal = sumValues(documents.filter(isOfferDocument).map((document) => document.totalCost.value));
  const progressDocuments = documents.filter(isProgressInvoiceDocument);
  const progressTotal = sumValues(progressDocuments.map((document) => document.totalCost.value));
  const finalTotal = finalGrossCost(documents);
  const maxValue = Math.max(offerTotal ?? 0, progressTotal ?? 0, finalTotal ?? 0);
  const rows = buildCostProgressRows(documents, mode);

  if (rows.length === 0 || maxValue <= 0) {
    return (
      <section className="costProgressPanel">
        <div className="panelHeader compactHeader">
          <div>
            <h3>Kostenvergleich</h3>
            <p>Keine passenden Angebots- oder Rechnungswerte vorhanden.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="costProgressPanel">
      <div className="panelHeader compactHeader">
        <div>
          <h3>Kostenvergleich</h3>
          <p>Angebot als Referenz, Abschläge kumuliert und Schlussrechnung/finale Rechnung daneben.</p>
        </div>
      </div>
      <div className="costProgressTrack">
        {offerTotal !== null ? (
          <div className="offerReference" style={{ left: `${Math.min(100, (offerTotal / maxValue) * 100)}%` }}>
            <span>Angebot</span>
            <strong>{formatNullableCurrency(offerTotal)}</strong>
          </div>
        ) : null}
        {rows.map((row) => (
          <div className="costProgressRow" key={row.key}>
            <div>
              <strong>{row.label}</strong>
              <span>{row.meta}</span>
            </div>
            <div className="costProgressBarShell">
              <span
                className={`costProgressBar ${row.kind}`}
                style={{ width: `${Math.max(2, Math.min(100, (row.value / maxValue) * 100))}%` }}
              />
            </div>
            <b>{formatNullableCurrency(row.value)}</b>
          </div>
        ))}
      </div>
      {progressDocuments.length > 0 && finalTotal !== null ? (
        <p className="costProgressHint">
          Schlussrechnung vorhanden: Abschläge werden als Zahlungsstand gezeigt, aber nicht zusätzlich auf die finalen Kosten addiert.
        </p>
      ) : null}
    </section>
  );
}

function ProjectMeasuresTab({ documents }: { documents: ObjectAnalysis[] }) {
  const byCluster = groupByMeasureCostRole(documents);
  return (
    <div className="tableWrap compactTable">
      <table>
        <thead>
          <tr><th>Maßnahmencluster</th><th>Dokumente</th><th>Angebot</th><th>Abschläge</th><th>Finale Kosten</th><th>Status</th></tr>
        </thead>
        <tbody>
          {byCluster.length === 0 ? (
            <tr><td colSpan={6}>k.A.</td></tr>
          ) : byCluster.map((entry) => (
            <tr key={entry.cluster}>
              <td>{entry.cluster}</td>
              <td>{entry.count}</td>
              <td>{formatNullableCurrency(entry.offer)}</td>
              <td>{formatNullableCurrency(entry.progress)}</td>
              <td>{formatNullableCurrency(entry.final)}</td>
              <td>{entry.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function ProjectAiTab({ documents }: { documents: ObjectAnalysis[] }) {
  const rows = buildMeasureRows(documents);
  const trades = Array.from(new Set(rows.map((row) => row.cluster).filter((value) => value !== "k.A.")));
  const apartments = collectApartments(documents);
  const gross = sumValues(documents.map((document) => document.totalCost.value));
  return (
    <div className="aiReportBoard">
      <section className="panel aiSummaryCard">
        <h3>PARIBUS Baukosten KI - strukturierter Bericht</h3>
        <div className="aiReportGrid">
          <InfoLine label="Was wurde gemacht?" value={collectDescriptions(documents)} />
          <InfoLine label="Beteiligte Gewerke" value={trades.length ? trades.join(", ") : "k.A."} />
          <InfoLine label="Betroffene Wohnungen" value={apartments} />
          <InfoLine label="Kosten brutto" value={formatNullableCurrency(gross)} />
          <InfoLine label="Ausgewertete Dokumente" value={formatNumber(documents.length)} />
        </div>
      </section>
      {documents.length === 0 ? <p className="muted">k.A.</p> : null}
      {documents.map((document) => (
        <article className="previewItem" key={document.id}>
          <div className="previewHeader">
            <strong>{fieldOrUnknown(document.documentType)} - {fieldOrUnknown(document.documentNumber)}</strong>
            <span className="status statusNeutral">{formatKiStatus(document)}</span>
          </div>
          <div className="debugGrid">
            <div className="debugBlock">
              <h4>Agent</h4>
              <p>{fieldOrUnknown(document.aiAgentName)}</p>
              <p>{fieldOrUnknown(document.assignmentSuggestion)}</p>
            </div>
            <div className="debugBlock">
              <h4>Projektvorschlag</h4>
              <p>{fieldOrUnknown(document.projectSuggestion)}</p>
            </div>
            <div className="debugBlock">
              <h4>Fehlende Angaben</h4>
              <p>{document.missingInformation.value?.join(", ") || "k.A."}</p>
            </div>
            <div className="debugBlock">
              <h4>Summenblock</h4>
              <pre>{document.costDebug?.summaryBlock || "k.A."}</pre>
            </div>
            <MeasureDebugBlock document={document} />
          </div>
        </article>
      ))}
    </div>
  );
}

function UnassignedView({
  documents,
  projects,
  onSelect,
  onAssign,
  onCreateProject,
  onDelete
}: {
  documents: ObjectAnalysis[];
  projects: ProjectRecord[];
  onSelect: (id: string) => void;
  onAssign: (documentId: string, projectId: string | null) => void;
  onCreateProject: (document: ObjectAnalysis) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="panel panelFlush">
      <div className="panelHeader tableHeader">
        <div>
          <h2>Unzugeordnete Dokumente</h2>
          <p>Wenn kein Projekt sicher erkannt wird, landet das Dokument hier.</p>
        </div>
      </div>
      <div className="unassignedList">
        {documents.length === 0 ? <div className="emptyState"><p>Keine unzugeordneten Dokumente.</p></div> : null}
        {documents.map((document) => (
          <article className="unassignedCard" key={document.id}>
            <div>
              <strong>{fieldOrUnknown(document.documentType)} - {fieldOrUnknown(document.documentNumber)}</strong>
              <p>{fieldOrUnknown(document.objectAddress)} - {formatCurrency(document.totalCost)}</p>
              <small>KI-Vorschlag: {fieldOrUnknown(document.objectNumber)} / {fieldOrUnknown(document.projectType)}</small>
            </div>
            <div className="headerActions">
              <button type="button" onClick={() => onSelect(document.id)}>Ansehen</button>
              <button type="button" onClick={() => onSelect(document.id)}>Erkannte Daten bearbeiten</button>
              <select onChange={(event) => onAssign(document.id, event.target.value || null)} defaultValue="">
                <option value="">Projekt auswählen</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.projectName || "k.A."}</option>)}
              </select>
              <button type="button" onClick={() => onCreateProject(document)}>Neues Projekt aus Dokument</button>
              <button type="button">KI erneut</button>
              <button type="button" onClick={() => onDelete(document.id)}>Loeschen</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ReportsView({
  documents,
  projects,
  assignments
}: {
  documents: ObjectAnalysis[];
  projects: ProjectRecord[];
  assignments: Record<string, string | null>;
}) {
  const byCluster = groupByCluster(documents);
  return (
    <section className="panel">
      <div className="panelHeader">
        <div>
          <h2>Auswertungen</h2>
          <p>Kosten nach Objekt, Projekt und Maßnahmencluster.</p>
        </div>
      </div>
      <div className="objectGrid">
        <ReportCard label="Projekte" value={formatNumber(projects.length)} />
        <ReportCard label="Dokumente" value={formatNumber(documents.length)} />
        <ReportCard label="Zugeordnet" value={formatNumber(Object.values(assignments).filter(Boolean).length)} />
        <ReportCard label="Brutto" value={formatNullableCurrency(sumValues(documents.map((document) => document.totalCost.value)))} />
      </div>
      <div className="tableWrap compactTable">
        <table>
          <thead>
            <tr><th>Cluster</th><th>Dokumente</th><th>Kosten brutto</th></tr>
          </thead>
          <tbody>
            {byCluster.map((entry) => (
              <tr key={entry.cluster}>
                <td>{entry.cluster}</td>
                <td>{entry.count}</td>
                <td>{formatNullableCurrency(entry.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SettingsView() {
  return (
    <section className="panel">
      <div className="panelHeader">
        <div>
          <h2>Einstellungen</h2>
          <p>OpenAI API-Key und Analyse-Regeln werden über Server-Umgebung und Backend gesteuert.</p>
        </div>
      </div>
      <div className="settingsGrid">
        <div className="metric"><span>KI-Agent</span><strong>PARIBUS Baukosten KI</strong><small>Dokument verstehen, Stammdatenabgleich vorbereiten, Confidence bewerten, Nutzerentscheidung offen lassen.</small></div>
        <div className="metric"><span>KI-Modus</span><strong>Dokumentbasierte Extraktion</strong><small>Keine Fantasiewerte, k.A. bei fehlenden Angaben.</small></div>
        <div className="metric"><span>Zuordnung</span><strong>Vorschlag statt Entscheidung</strong><small>Der Nutzer entscheidet. Manuelle Eingaben haben Vorrang.</small></div>
        <div className="metric"><span>Summen</span><strong>Regex, Tabellenanalyse, KI-Prüfung</strong><small>Mehrere Summen werden im Debug erklärt.</small></div>
      </div>
    </section>
  );
}

function DocumentEditor({
  document,
  projects,
  assignedProjectId,
  onAssign,
  onCreateProject,
  onDelete,
  onUpdate
}: {
  document: ObjectAnalysis | null;
  projects: ProjectRecord[];
  assignedProjectId: string | null;
  onAssign: (projectId: string | null) => void;
  onCreateProject: () => void;
  onDelete: () => void;
  onUpdate: (id: string, updater: (document: ObjectAnalysis) => ObjectAnalysis) => void;
}) {
  if (!document) {
    return (
      <aside className="editorPanel">
        <h2>KI-Daten bearbeiten</h2>
        <div className="emptyState"><p>Kein Dokument ausgewählt.</p></div>
      </aside>
    );
  }

  const setText = (field: TextFieldKey, value: string) => {
    onUpdate(document.id, (current) => ({ ...current, [field]: manualField(value) }));
  };
  const setNumber = (field: NumberFieldKey, value: string) => {
    onUpdate(document.id, (current) => ({ ...current, [field]: manualNumberField(value) }));
  };

  return (
    <aside className="editorPanel">
      <div className="panelHeader">
        <div>
          <h2>KI-Daten bearbeiten</h2>
          <p>Alle Felder lassen sich direkt korrigieren.</p>
        </div>
      </div>
      <label className="filterInput">
        <span>Projekt</span>
        <select value={assignedProjectId ?? ""} onChange={(event) => onAssign(event.target.value || null)}>
          <option value="">Unzugeordnet</option>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.projectName || "k.A."}</option>)}
        </select>
      </label>

      <div className="editorActions">
        <button type="button" onClick={onCreateProject}>Neues Projekt aus Dokument</button>
        <button type="button">KI erneut starten</button>
        <button type="button" onClick={onDelete}>Dokument loeschen</button>
      </div>

      <div className="editForm">
        <EditInput label="KI-Agent" value={fieldOrUnknown(document.aiAgentName)} onChange={() => undefined} readOnly />
        <EditInput label="Confidence Score" value={fieldOrUnknown(document.confidenceScore)} onChange={(value) => setNumber("confidenceScore", value)} />
        <EditInput label="Projektvorschlag" value={fieldOrUnknown(document.projectSuggestion)} onChange={(value) => setText("projectSuggestion", value)} />
        <EditInput label="Zuordnungsvorschlag" value={fieldOrUnknown(document.assignmentSuggestion)} onChange={(value) => setText("assignmentSuggestion", value)} />
        <EditInput label="Fonds" value={fieldOrUnknown(document.fund)} onChange={(value) => setText("fund", value)} />
        <EditInput label="Objektnummer" value={fieldOrUnknown(document.objectNumber)} onChange={(value) => setText("objectNumber", value)} />
        <EditInput label="Objektadresse" value={fieldOrUnknown(document.objectAddress)} onChange={(value) => setText("objectAddress", value)} />
        <EditInput label="Projektart" value={fieldOrUnknown(document.projectType)} onChange={(value) => setText("projectType", value)} />
        <EditInput label="Dokumenttyp" value={fieldOrUnknown(document.documentType)} onChange={(value) => setText("documentType", value)} />
        <EditInput label="Abschlagsnummer" value={fieldOrUnknown(document.installmentNumber ?? emptyField<string>())} onChange={(value) => onUpdate(document.id, (current) => ({ ...current, installmentNumber: manualField(value) }))} />
        <EditInput label="Anbieter" value={fieldOrUnknown(document.provider)} onChange={(value) => setText("provider", value)} />
        <EditInput label="Dokumentnummer" value={fieldOrUnknown(document.documentNumber)} onChange={(value) => setText("documentNumber", value)} />
        <EditInput label="Datum" value={fieldOrUnknown(document.documentDate)} onChange={(value) => setText("documentDate", value)} />
        <EditInput label="Jahr" value={fieldOrUnknown(document.year)} onChange={(value) => setNumber("year", value)} />
        <EditInput label="WE-Nummer" value={fieldOrUnknown(document.apartmentNumber)} onChange={(value) => setText("apartmentNumber", value)} />
        <EditInput label="Lage" value={fieldOrUnknown(document.location)} onChange={(value) => setText("location", value)} />
        <EditInput label="Anzahl sanierte Wohnungen" value={fieldOrUnknown(document.renovatedApartmentCount)} onChange={(value) => setNumber("renovatedApartmentCount", value)} />
        <EditInput label="Wohnfläche m2" value={fieldOrUnknown(document.livingAreaSqm)} onChange={(value) => setNumber("livingAreaSqm", value)} />
        <EditInput label="Maßnahmencluster" value={formatClusters(document)} onChange={(value) => setCluster(document.id, value, onUpdate)} />
        <EditInput label="Beschreibung" value={fieldOrUnknown(document.measureDescription)} onChange={(value) => setText("measureDescription", value)} />
        <EditInput label="Netto" value={fieldOrUnknown(document.netCost)} onChange={(value) => setNumber("netCost", value)} />
        <EditInput label="MwSt" value={fieldOrUnknown(document.vatCost)} onChange={(value) => setNumber("vatCost", value)} />
        <EditInput label="Brutto" value={fieldOrUnknown(document.totalCost)} onChange={(value) => setNumber("totalCost", value)} />
        <EditInput label="Datenqualität" value={fieldOrUnknown(document.dataQuality)} onChange={(value) => setText("dataQuality", value)} />
      </div>

      <div className="debugBlock">
        <h4>Quellen / Debug</h4>
        <p className="muted">{sourceLabel(document.totalCost)}</p>
        <pre>{document.costDebug?.summaryBlock || "k.A."}</pre>
      </div>
      <MeasureDebugBlock document={document} />
    </aside>
  );
}

function UploadObjectPanel({
  document,
  documents,
  sourceDocument,
  sourceDocuments,
  draft,
  existingObject,
  isAnalyzing,
  message,
  phase,
  uploadedFileName,
  onChange,
  onSaveNew,
  onAssignExisting
}: {
  document: ObjectAnalysis | null;
  documents: ObjectAnalysis[];
  sourceDocument: SourceDocument | null;
  sourceDocuments: SourceDocument[];
  draft: UploadObjectDraft;
  existingObject: ObjectRecord | null;
  isAnalyzing: boolean;
  message: string | null;
  phase: UploadPhase;
  uploadedFileName: string;
  onChange: (field: keyof UploadObjectDraft, value: string) => void;
  onSaveNew: () => void;
  onAssignExisting: (objectId: string) => void;
}) {
  const showForm = phase === "analyzed";
  const visibleDocuments = documents.length ? documents : document ? [document] : [];
  const visibleSourceDocuments = sourceDocuments.length ? sourceDocuments : sourceDocument ? [sourceDocument] : [];
  const groupedUploadRows = buildUploadGroupRows(visibleDocuments);

  return (
    <aside className="editorPanel uploadObjectPanel">
      <div className="panelHeader">
        <div>
          <h2>Neues Objekt aus Upload</h2>
          <p>{phase === "analyzed" ? "Dokumente analysiert - bitte Daten prüfen." : phase === "selected" ? "Datei ausgewählt - bitte Analyse starten." : "Nach der Analyse erscheinen hier die KI-erkannten Objektwerte."}</p>
        </div>
      </div>

      {isAnalyzing ? (
        <div className="analysisLoader">
          <span />
          <strong>KI analysiert Dokumente...</strong>
          <p>Der rechte Info-Bereich wurde zurückgesetzt und wird danach neu befüllt.</p>
        </div>
      ) : null}

      {message ? <div className="uploadStatus">{message}</div> : null}

      {phase === "selected" && !isAnalyzing ? (
        <div className="uploadStatus">Datei ausgewählt - bitte Analyse starten.</div>
      ) : null}

      {uploadedFileName ? (
        <div className="uploadExtractSummary">
          <InfoLine label="Quelle / Dokumentname" value={uploadedFileName} />
        </div>
      ) : null}

      {visibleSourceDocuments.length > 0 ? (
        <div className="uploadDocumentList">
          <h4>Dokumentanalyse je Datei</h4>
          {visibleSourceDocuments.map((source, index) => {
            const analyzedDocument = visibleDocuments.find((entry) => entry.sourceDocumentIds.includes(source.id)) ?? visibleDocuments[index] ?? null;
            return (
              <details key={source.id} className="uploadDocumentItem" open={index === 0}>
                <summary>
                  <strong>Dokument {index + 1}: {uploadDocumentStatusLabel(source, analyzedDocument)}</strong>
                  <span>{source.fileName}</span>
                </summary>
                <div className="uploadExtractSummary">
                  <InfoLine label="Dateiname" value={source.fileName} />
                  <InfoLine label="Dateityp" value={source.fileType} />
                  <InfoLine label="Dokumenttyp" value={analyzedDocument ? fieldOrUnknown(analyzedDocument.documentType) : "Nicht erkannt"} />
                  <InfoLine label="Objektnummer" value={analyzedDocument ? fieldOrUnknown(analyzedDocument.objectNumber) : "Nicht erkannt"} />
                  <InfoLine label="Adresse" value={analyzedDocument ? fieldOrUnknown(analyzedDocument.objectAddress) : "Nicht erkannt"} />
                  <InfoLine label="Lieferant" value={analyzedDocument ? fieldOrUnknown(analyzedDocument.provider) : "Nicht erkannt"} />
                  <InfoLine label="Dokumentnummer" value={analyzedDocument ? fieldOrUnknown(analyzedDocument.documentNumber) : "Nicht erkannt"} />
                  <InfoLine label="Datum" value={analyzedDocument ? fieldOrUnknown(analyzedDocument.documentDate) : "Nicht erkannt"} />
                  <InfoLine label="Gewerk / Maßnahme" value={analyzedDocument ? formatClusters(analyzedDocument) : "Nicht erkannt"} />
                  <InfoLine label="Netto" value={analyzedDocument ? formatCurrency(analyzedDocument.netCost) : "Nicht erkannt"} />
                  <InfoLine label="Brutto" value={analyzedDocument ? formatCurrency(analyzedDocument.totalCost) : "Nicht erkannt"} />
                  <InfoLine label="Wohnungen betroffen" value={analyzedDocument ? collectApartments([analyzedDocument]) : "Nicht erkannt"} />
                  <InfoLine label="KI-Sicherheit" value={analyzedDocument ? formatKiStatus(analyzedDocument) : "Nicht erkannt"} />
                  <InfoLine label="Fehlerstatus" value={source.issues.join(" ") || (analyzedDocument ? "Keine Fehler" : "Nicht erkannt")} />
                </div>
                {source.parseDebug ? (
                  <div className="uploadExtractSummary">
                    <InfoLine label="Erfolgreich gelesen" value={source.parseDebug.status === "read" ? "Ja" : "Nein"} />
                    <InfoLine label="Textzeichen" value={formatNumber(source.parseDebug.textLength)} />
                    <InfoLine label="OCR verwendet" value={source.parseDebug.ocrUsed ? "Ja" : "Nein"} />
                    <InfoLine label="Erkannte Beträge" value={source.parseDebug.amountMatches.join(", ") || "k.A."} />
                    <InfoLine label="Erkannte Objektnummer" value={source.parseDebug.objectNumberMatches.join(", ") || "k.A."} />
                    <InfoLine label="KI-Sicherheit" value={analyzedDocument ? formatKiStatus(analyzedDocument) : "k.A."} />
                  </div>
                ) : null}
              </details>
            );
          })}
        </div>
      ) : null}

      {groupedUploadRows.length > 0 ? (
        <div className="uploadDocumentList">
          <h4>Zusammenfassung nach Objekt / Gewerk / Jahr / Dokumenttyp</h4>
          <div className="tableWrap compactTable">
            <table>
              <thead><tr><th>Objekt</th><th>Gewerk</th><th>Maßnahme</th><th>Jahr</th><th>Typ</th><th>Dokumente</th><th>Brutto</th></tr></thead>
              <tbody>
                {groupedUploadRows.map((row) => (
                  <tr key={row.key}><td>{row.object}</td><td>{row.trade}</td><td>{row.measure}</td><td>{row.year}</td><td>{row.type}</td><td>{formatNumber(row.count)}</td><td>{formatNullableCurrency(row.gross)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {phase === "idle" && !isAnalyzing ? (
        <div className="emptyState">
          <p>Bitte links Dokumente hochladen und analysieren.</p>
        </div>
      ) : null}

      {showForm ? (
        <>
          {existingObject && document ? (
            <div className="possibleMatchBox">
              <strong>Möglicherweise vorhandenes Objekt gefunden</strong>
              <p>{objectLabel(existingObject) || existingObject.address || "k.A."}</p>
              <div className="editorActions">
                <button type="button" onClick={() => onAssignExisting(existingObject.id)}>Bestehendem Objekt zuordnen</button>
                <button type="button" onClick={onSaveNew}>Trotzdem neues Objekt erstellen</button>
              </div>
            </div>
          ) : null}

          <div className="uploadExtractSummary">
            <InfoLine label="Dokumente analysiert" value={formatNumber(visibleDocuments.length)} />
            <InfoLine label="Dokument" value={document ? fieldOrUnknown(document.documentType) : "Nicht erkannt"} />
            <InfoLine label="Anbieter" value={document ? fieldOrUnknown(document.provider) : "Nicht erkannt"} />
            <InfoLine label="Kosten brutto" value={document ? formatCurrency(document.totalCost) : "Nicht erkannt"} />
            <InfoLine label="Datenqualität" value={document ? fieldOrUnknown(document.dataQuality) : "Nicht erkannt"} />
          </div>

          <div className="editForm">
            <EditInput label="Fonds" value={draft.fund} placeholder="Nicht erkannt" onChange={(value) => onChange("fund", value)} />
            <EditInput label="Objektnummer" value={draft.objectNumber} placeholder="Nicht erkannt" onChange={(value) => onChange("objectNumber", value)} />
            <EditInput label="Objektname" value={draft.objectName} placeholder="Nicht erkannt" onChange={(value) => onChange("objectName", value)} />
            <EditInput label="Adresse / Adressbereich" value={draft.address} placeholder="Nicht erkannt" onChange={(value) => onChange("address", value)} />
            <EditInput label="Jahr" value={draft.year} placeholder="Nicht erkannt" onChange={(value) => onChange("year", value)} />
            <EditInput label="Gewerk / Maßnahme" value={draft.trade} placeholder="Nicht erkannt" onChange={(value) => onChange("trade", value)} />
            <EditInput label="Gesamtkosten" value={draft.totalCost} placeholder="Nicht erkannt" onChange={(value) => onChange("totalCost", value)} />
            <EditInput label="Anzahl Wohnungen" value={draft.apartmentCount} placeholder="Nicht erkannt" onChange={(value) => onChange("apartmentCount", value)} />
            <EditInput label="Kosten pro Wohnung" value={draft.costPerApartment} placeholder="Nicht erkannt" onChange={(value) => onChange("costPerApartment", value)} />
            <EditInput label="Kosten pro m²" value={draft.costPerSqm} placeholder="Nicht erkannt" onChange={(value) => onChange("costPerSqm", value)} />
            <EditInput label="Quelle / Dokumentname" value={draft.sourceFile} placeholder="Nicht erkannt" onChange={(value) => onChange("sourceFile", value)} />
            <EditInput label="PLZ" value={draft.postalCode} placeholder="Nicht erkannt" onChange={(value) => onChange("postalCode", value)} />
            <EditInput label="Ort" value={draft.city} placeholder="Nicht erkannt" onChange={(value) => onChange("city", value)} />
            <EditInput label="Bundesland" value={draft.federalState} placeholder="Nicht erkannt" onChange={(value) => onChange("federalState", value)} />
            <EditInput label="Baujahr" value={draft.constructionYear} placeholder="Nicht erkannt" onChange={(value) => onChange("constructionYear", value)} />
            <EditInput label="Anzahl Wohneinheiten" value={draft.unitCount} placeholder="Nicht erkannt" onChange={(value) => onChange("unitCount", value)} />
            <EditInput label="Gesamtwohnfläche m2" value={draft.totalLivingAreaSqm} placeholder="Nicht erkannt" onChange={(value) => onChange("totalLivingAreaSqm", value)} />
            <EditInput label="Latitude" value={draft.latitude ?? ""} placeholder="Nicht erkannt" onChange={(value) => onChange("latitude", value)} />
            <EditInput label="Longitude" value={draft.longitude ?? ""} placeholder="Nicht erkannt" onChange={(value) => onChange("longitude", value)} />
            <EditInput label="Wohnfläche sanierte Wohnung m²" value={draft.wohnflaecheSanierteWohnung ?? ""} type="number" placeholder="Nicht erkannt" onChange={(value) => onChange("wohnflaecheSanierteWohnung", value)} />
          </div>

          <div className="editorActions">
            <button className="buttonPrimary" type="button" onClick={onSaveNew}>Als neues Objekt speichern</button>
          </div>
        </>
      ) : null}
    </aside>
  );
}
function MeasureDebugBlock({ document }: { document: ObjectAnalysis }) {
  const debug = document.measureDebug;
  const details = document.measureDetails ?? [];
  if (!debug && details.length === 0) return null;

  return (
    <div className="debugBlock">
      <h4>Maßnahmen-Erkennung</h4>
      <div className="measureDebugGrid">
        <div>
          <strong>Positionsgruppen</strong>
          <ul>
            <li>{debug?.positionsDetected ? "Ja" : "Nein"}</li>
            <li>Anzahl Gruppen: {formatNumber(debug?.detectedGroupCount ?? 0)}</li>
          </ul>
        </div>
        <div>
          <strong>Abschnittsüberschriften</strong>
          <ul>
            {debug?.headings.length ? debug.headings.map((entry) => (
              <li key={`heading-${entry.section}-${entry.actualSection ?? entry.section}`}>{entry.actualSection ?? entry.section}. {entry.heading}</li>
            )) : <li>k.A.</li>}
          </ul>
        </div>
        <div>
          <strong>Summenzeilen</strong>
          <ul>
            {debug?.sumLines.length ? debug.sumLines.map((entry) => (
              <li key={`sum-${entry.section}`}>{entry.raw}</li>
            )) : <li>k.A.</li>}
          </ul>
        </div>
        <div>
          <strong>Cluster-Mapping</strong>
          <ul>
            {debug?.mappings.length ? debug.mappings.map((entry) => (
              <li key={`mapping-${entry.section}-${entry.actualSection ?? entry.section}`}>{entry.heading} - {entry.cluster} - {formatNullableCurrency(entry.value)}</li>
            )) : <li>k.A.</li>}
          </ul>
        </div>
        <div>
          <strong>Nicht zugeordnete Beträge</strong>
          <ul>
            {debug?.unmatchedAmounts?.length ? debug.unmatchedAmounts.map((entry) => (
              <li key={entry}>{entry}</li>
            )) : <li>Keine</li>}
          </ul>
        </div>
        <div>
          <strong>Beschreibung</strong>
          <ul>
            {details.length ? details.map((entry) => (
              <li key={`${entry.abschnitt}-${entry.cluster}`}>{entry.abschnitt}: {entry.beschreibung}</li>
            )) : <li>k.A.</li>}
          </ul>
        </div>
      </div>
      {debug?.notes.length ? <p className="muted">{debug.notes.join(" ")}</p> : null}
    </div>
  );
}

function ObjectForm({ object, onChange }: { object: ObjectRecord; onChange: (field: keyof ObjectRecord, value: string) => void }) {
  return (
    <div className="projectForm">
      {([
        ["fund", "Fonds"],
        ["objectNumber", "Objektnummer"],
        ["objectName", "Objektname"],
        ["address", "Adressbereich"],
        ["postalCode", "PLZ"],
        ["city", "Ort"],
        ["federalState", "Bundesland"],
        ["constructionYear", "Baujahr"],
        ["unitCount", "Anzahl Wohneinheiten"],
        ["totalLivingAreaSqm", "Gesamtwohnflaeche m2"],
        ["assetManager", "Asset Manager"],
        ["portfolioManager", "Portfolio Manager"],
        ["latitude", "Latitude"],
        ["longitude", "Longitude"],
        ["wohnflaecheSanierteWohnung", "Wohnfläche sanierte Wohnung m²"]
      ] as Array<[keyof ObjectRecord, string]>).map(([field, label]) => (
        <EditInput
          key={field}
          label={label}
          value={String(object[field] ?? "")}
          type={field === "wohnflaecheSanierteWohnung" ? "number" : "text"}
          onChange={(value) => onChange(field, value)}
        />
      ))}
      <p className="formHint">Geocoding ist vorbereitet. Bis zur automatischen Adressaufloesung bitte Koordinaten manuell eintragen.</p>
    </div>
  );
}

function EntranceForm({ entrance, onChange }: { entrance: EntranceRecord; onChange: (field: keyof EntranceRecord, value: string) => void }) {
  return (
    <div className="projectForm entranceForm">
      {([
        ["street", "Strasse"],
        ["houseNumber", "Hausnummer"],
        ["suffix", "Zusatz"],
        ["postalCode", "PLZ"],
        ["city", "Ort"],
        ["livingAreaSqm", "Wohnfläche"],
        ["unitCount", "Anzahl WE"]
      ] as Array<[keyof EntranceRecord, string]>).map(([field, label]) => (
        <EditInput key={field} label={label} value={String(entrance[field] ?? "")} onChange={(value) => onChange(field, value)} />
      ))}
    </div>
  );
}

function ProjectForm({
  project,
  objects,
  entrances,
  onChange
}: {
  project: ProjectRecord;
  objects: ObjectRecord[];
  entrances: EntranceRecord[];
  onChange: (field: keyof ProjectRecord, value: string) => void;
}) {
  const objectEntrances = entrances.filter((entrance) => entrance.objectId === project.objectId);
  return (
    <div className="projectForm">
      <EditInput label="Projektname" value={project.projectName} onChange={(value) => onChange("projectName", value)} />
      <EditInput label="Projektart" value={project.projectType} onChange={(value) => onChange("projectType", value)} />
      <EditInput label="Fonds" value={project.fund} onChange={(value) => onChange("fund", value)} />
      <label className="filterInput">
        <span>Objekt</span>
        <select value={project.objectId} onChange={(event) => onChange("objectId", event.target.value)}>
          <option value="">k.A.</option>
          {objects.map((object) => <option key={object.id} value={object.id}>{objectLabel(object) || "k.A."}</option>)}
        </select>
      </label>
      <EditInput label="Objekt Freitext" value={project.object} onChange={(value) => onChange("object", value)} />
      <label className="filterInput">
        <span>Hauseingang</span>
        <select value={project.entranceId ?? ""} onChange={(event) => onChange("entranceId", event.target.value)}>
          <option value="">k.A.</option>
          {objectEntrances.map((entrance) => <option key={entrance.id} value={entrance.id}>{entranceLabel(entrance) || "k.A."}</option>)}
        </select>
      </label>
      <EditInput label="Hauseingang Freitext" value={project.entrance ?? ""} onChange={(value) => onChange("entrance", value)} />
      <EditInput label="Status" value={project.status} onChange={(value) => onChange("status", value)} />
      <EditInput label="Budget netto" value={project.budgetNet} onChange={(value) => onChange("budgetNet", value)} />
      <EditInput label="Budget brutto" value={project.budgetGross} onChange={(value) => onChange("budgetGross", value)} />
      <EditInput label="Startdatum" value={project.startDate} onChange={(value) => onChange("startDate", value)} />
      <EditInput label="Enddatum" value={project.endDate} onChange={(value) => onChange("endDate", value)} />
      <EditInput label="Beschreibung" value={project.description} onChange={(value) => onChange("description", value)} />
      <EditInput label="Wohnungsnummer" value={project.apartmentNumber} onChange={(value) => onChange("apartmentNumber", value)} />
      <EditInput label="Lage" value={project.location} onChange={(value) => onChange("location", value)} />
      <EditInput label="Anzahl sanierte Wohnungen" value={project.renovatedApartmentCount} onChange={(value) => onChange("renovatedApartmentCount", value)} />
      <EditInput label="Wohnfläche m2" value={project.livingAreaSqm} onChange={(value) => onChange("livingAreaSqm", value)} />
    </div>
  );
}

function EditInput({
  label,
  value,
  onChange,
  readOnly,
  placeholder = "k.A.",
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  type?: "text" | "number";
}) {
  return (
    <label className="filterInput">
      <span>{label}</span>
      <input
        type={type}
        inputMode={type === "number" ? "decimal" : undefined}
        step={type === "number" ? "0.01" : undefined}
        value={value === "k.A." ? "" : value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
      />
    </label>
  );
}

function CostMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="costLine">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ReportCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="objectCard">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function Kpi({ label, value, accent, warning }: { label: string; value: string; accent?: boolean; warning?: boolean }) {
  return (
    <article className={`kpi${accent ? " kpiAccent" : ""}${warning ? " kpiWarning" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function objectFromDocument(document?: ObjectAnalysis): ObjectRecord {
  return {
    id: `object-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    fund: document ? emptyIfUnknown(fieldOrUnknown(document.fund)) : "",
    objectNumber: document ? emptyIfUnknown(fieldOrUnknown(document.objectNumber)) : "",
    objectName: "",
    address: document ? emptyIfUnknown(fieldOrUnknown(document.objectAddress)) : "",
    postalCode: "",
    city: "",
    federalState: "",
    constructionYear: "",
    unitCount: "",
    totalLivingAreaSqm: document ? emptyIfUnknown(fieldOrUnknown(document.livingAreaSqm)) : "",
    wohnflaecheSanierteWohnung: document ? emptyIfUnknown(fieldOrUnknown(document.livingAreaSqm)) : "",
    assetManager: "",
    portfolioManager: "",
    latitude: "",
    longitude: ""
  };
}

function uploadDraftFromDocument(document?: ObjectAnalysis, sourceFile = ""): UploadObjectDraft {
  const object = objectFromDocument(document);
  const totalCost = document?.totalCost.value ?? null;
  const apartmentCount = document?.renovatedApartmentCount.value ?? null;
  const renovatedArea = parseGermanNumber(object.wohnflaecheSanierteWohnung ?? "");
  return {
    ...object,
    year: document ? emptyIfUnknown(fieldOrUnknown(document.year)) : "",
    trade: document ? emptyIfUnknown(formatClusters(document)) : "",
    totalCost: totalCost !== null ? String(totalCost).replace(".", ",") : "",
    apartmentCount: apartmentCount !== null ? String(apartmentCount).replace(".", ",") : "",
    costPerApartment: totalCost !== null && apartmentCount ? String(roundMoney(totalCost / apartmentCount)).replace(".", ",") : "",
    costPerSqm: totalCost !== null && renovatedArea ? String(roundMoney(totalCost / renovatedArea)).replace(".", ",") : "",
    sourceFile
  };
}

function uploadSourceName(files: File[]): string {
  if (files.length === 0) return "";
  if (files.length === 1) return files[0].name;
  return files.map((file) => file.name).join(", ");
}

function buildUploadGroupRows(documents: ObjectAnalysis[]) {
  const groups = new Map<string, {
    key: string;
    object: string;
    trade: string;
    measure: string;
    year: string;
    type: string;
    count: number;
    gross: number | null;
  }>();

  documents.forEach((document) => {
    const object = firstKnown(fieldOrUnknown(document.objectNumber), fieldOrUnknown(document.objectAddress)) || "k.A.";
    const trade = formatClusters(document);
    const measure = fieldOrUnknown(document.measureDescription);
    const year = fieldOrUnknown(document.year);
    const type = fieldOrUnknown(document.documentType);
    const key = [object, trade, measure, year, type].join("||");
    const current = groups.get(key) ?? { key, object, trade, measure, year, type, count: 0, gross: null };
    groups.set(key, {
      ...current,
      count: current.count + 1,
      gross: sumValues([current.gross, document.totalCost.value])
    });
  });

  return Array.from(groups.values());
}

function uploadDocumentStatusLabel(source: SourceDocument, document: ObjectAnalysis | null): string {
  if (source.parseDebug?.status === "error") return "Fehler / OCR nötig";
  if (source.parseDebug?.status === "ocr_unavailable" || source.parseDebug?.status === "scan_detected") {
    return document ? "teilweise erkannt / OCR prüfen" : "OCR nötig";
  }
  if (!document) return "nicht erkannt";
  const status = formatKiStatus(document).toLowerCase();
  if (/prüfung|pruefung|manuell|k\.a\.|unsicher/.test(status)) return "teilweise erkannt";
  return "erfolgreich analysiert";
}

function hasRecognizedUploadValues(draft: UploadObjectDraft): boolean {
  return Boolean(
    draft.objectNumber.trim() ||
    draft.address.trim() ||
    draft.fund.trim() ||
    draft.year.trim() ||
    draft.trade.trim() ||
    draft.totalCost.trim() ||
    draft.apartmentCount.trim() ||
    draft.costPerApartment.trim() ||
    draft.costPerSqm.trim()
  );
}

function uploadDraftToObjectRecord(draft: UploadObjectDraft, id: string): ObjectRecord {
  return {
    id,
    fund: draft.fund,
    objectNumber: draft.objectNumber,
    objectName: draft.objectName,
    address: draft.address,
    postalCode: draft.postalCode,
    city: draft.city,
    federalState: draft.federalState,
    constructionYear: draft.constructionYear,
    unitCount: draft.unitCount,
    totalLivingAreaSqm: draft.totalLivingAreaSqm,
    wohnflaecheSanierteWohnung: draft.wohnflaecheSanierteWohnung,
    assetManager: draft.assetManager,
    portfolioManager: draft.portfolioManager,
    latitude: draft.latitude,
    longitude: draft.longitude
  };
}

function findExistingObjectForDraft(draft: ObjectRecord, objects: ObjectRecord[]): ObjectRecord | null {
  const draftNumber = draft.objectNumber.trim().toLowerCase();
  const draftAddress = draft.address.trim().toLowerCase();
  if (!draftNumber && !draftAddress) return null;
  return objects.find((object) => {
    const objectNumber = object.objectNumber.trim().toLowerCase();
    const objectAddress = object.address.trim().toLowerCase();
    return (
      (draftNumber && objectNumber && draftNumber === objectNumber) ||
      (draftAddress && objectAddress && (draftAddress.includes(objectAddress) || objectAddress.includes(draftAddress)))
    );
  }) ?? null;
}

function emptyEntrance(objectId: string): EntranceRecord {
  return {
    id: `entrance-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    objectId,
    street: "",
    houseNumber: "",
    suffix: "",
    postalCode: "",
    city: "",
    livingAreaSqm: "",
    unitCount: ""
  };
}

function projectFromDocument(document?: ObjectAnalysis, objects: ObjectRecord[] = []): ProjectRecord {
  const objectNumber = document ? emptyIfUnknown(fieldOrUnknown(document.objectNumber)) : "";
  const address = document ? emptyIfUnknown(fieldOrUnknown(document.objectAddress)) : "";
  const matchedObject = objects.find((object) =>
    (objectNumber && object.objectNumber === objectNumber) ||
    (address && object.address.toLowerCase() === address.toLowerCase())
  );
  const objectText = matchedObject ? objectLabel(matchedObject) : firstKnown(objectNumber, address);
  const projectType = document ? emptyIfUnknown(fieldOrUnknown(document.projectType)) : "";
  const suggestion = document ? emptyIfUnknown(fieldOrUnknown(document.projectSuggestion)) : "";
  return {
    id: `project-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    projectName: suggestion || (document ? `${projectType} ${objectText}`.trim() : ""),
    projectType,
    fund: document ? emptyIfUnknown(fieldOrUnknown(document.fund)) : "",
    objectId: matchedObject?.id ?? "",
    object: objectText,
    entranceId: "",
    entrance: "",
    status: "Prüfung",
    budgetNet: "",
    budgetGross: "",
    startDate: "",
    endDate: "",
    description: document ? emptyIfUnknown(fieldOrUnknown(document.measureDescription)) : "",
    apartmentNumber: document ? emptyIfUnknown(fieldOrUnknown(document.apartmentNumber)) : "",
    location: document ? emptyIfUnknown(fieldOrUnknown(document.location)) : "",
    renovatedApartmentCount: document ? emptyIfUnknown(fieldOrUnknown(document.renovatedApartmentCount)) : "",
    livingAreaSqm: document ? emptyIfUnknown(fieldOrUnknown(document.livingAreaSqm)) : ""
  };
}

function autoAssignDocuments(
  documents: ObjectAnalysis[],
  projects: ProjectRecord[],
  current: Record<string, string | null>
): Record<string, string | null> {
  const next = { ...current };
  documents.forEach((document) => {
    if (next[document.id]) return;
    const matches = projects.filter((project) => projectMatchesDocument(project, document));
    next[document.id] = matches.length === 1 ? matches[0].id : null;
  });
  return next;
}

function buildAnalysisFromDocuments(
  documents: ObjectAnalysis[],
  base: PortfolioAnalysisState = emptyAnalysisState
): PortfolioAnalysisState {
  const costDocuments = documents;
  return {
    ...base,
    objects: documents,
    clusterSummary: documents.flatMap((document) => document.clusters),
    totalCost: aggregateNumberField(costDocuments.map((document) => document.totalCost)),
    averageCostPerApartment: aggregateAverageField(
      costDocuments.map((document) => document.totalCost),
      documents.map((document) => document.renovatedApartmentCount)
    ),
    averageCostPerSqm: aggregateAverageField(
      costDocuments.map((document) => document.totalCost),
      documents.map((document) => document.livingAreaSqm)
    ),
    reviewRequiredCount: countReviewCases(documents),
    issues: base.issues ?? []
  };
}

function mergeDocumentsPreferManual(existing: ObjectAnalysis[], incoming: ObjectAnalysis[]): ObjectAnalysis[] {
  const byId = new Map(existing.map((document) => [document.id, document]));
  const merged = [...existing];

  incoming.forEach((document) => {
    const match = byId.get(document.id);
    if (!match) {
      merged.push(document);
      return;
    }
    const index = merged.findIndex((entry) => entry.id === match.id);
    merged[index] = mergeDocumentPreferManual(match, document);
  });

  return merged;
}

function mergeDocumentPreferManual(existing: ObjectAnalysis, incoming: ObjectAnalysis): ObjectAnalysis {
  return {
    ...incoming,
    id: existing.id,
    aiAgentName: mergeFieldPreferManual(existing.aiAgentName, incoming.aiAgentName),
    confidenceScore: mergeFieldPreferManual(existing.confidenceScore, incoming.confidenceScore),
    projectSuggestion: mergeFieldPreferManual(existing.projectSuggestion, incoming.projectSuggestion),
    assignmentSuggestion: mergeFieldPreferManual(existing.assignmentSuggestion, incoming.assignmentSuggestion),
    documentType: mergeFieldPreferManual(existing.documentType, incoming.documentType),
    installmentNumber: mergeFieldPreferManual(existing.installmentNumber ?? emptyField<string>(), incoming.installmentNumber ?? emptyField<string>()),
    projectType: mergeFieldPreferManual(existing.projectType, incoming.projectType),
    provider: mergeFieldPreferManual(existing.provider, incoming.provider),
    year: mergeFieldPreferManual(existing.year, incoming.year),
    fund: mergeFieldPreferManual(existing.fund, incoming.fund),
    objectNumber: mergeFieldPreferManual(existing.objectNumber, incoming.objectNumber),
    apartmentNumber: mergeFieldPreferManual(existing.apartmentNumber, incoming.apartmentNumber),
    objectAddress: mergeFieldPreferManual(existing.objectAddress, incoming.objectAddress),
    location: mergeFieldPreferManual(existing.location, incoming.location),
    documentDate: mergeFieldPreferManual(existing.documentDate, incoming.documentDate),
    documentNumber: mergeFieldPreferManual(existing.documentNumber, incoming.documentNumber),
    renovatedApartmentCount: mergeFieldPreferManual(existing.renovatedApartmentCount, incoming.renovatedApartmentCount),
    renovatedApartments: mergeFieldPreferManual(existing.renovatedApartments, incoming.renovatedApartments),
    livingAreaSqm: mergeFieldPreferManual(existing.livingAreaSqm, incoming.livingAreaSqm),
    totalAreaSqm: mergeFieldPreferManual(existing.totalAreaSqm, incoming.totalAreaSqm),
    renovatedAreaSqm: mergeFieldPreferManual(existing.renovatedAreaSqm, incoming.renovatedAreaSqm),
    netCost: mergeFieldPreferManual(existing.netCost, incoming.netCost),
    vatCost: mergeFieldPreferManual(existing.vatCost, incoming.vatCost),
    totalCost: mergeFieldPreferManual(existing.totalCost, incoming.totalCost),
    costPerApartment: mergeFieldPreferManual(existing.costPerApartment, incoming.costPerApartment),
    costPerSqm: mergeFieldPreferManual(existing.costPerSqm, incoming.costPerSqm),
    measureDescription: mergeFieldPreferManual(existing.measureDescription, incoming.measureDescription),
    dataQuality: mergeFieldPreferManual(existing.dataQuality, incoming.dataQuality),
    missingInformation: mergeFieldPreferManual(existing.missingInformation, incoming.missingInformation),
    clusters: existing.clusters.some((cluster) => hasManualSource(cluster.cluster) || hasManualSource(cluster.totalCost))
      ? existing.clusters
      : incoming.clusters,
    measureDetails: incoming.measureDetails ?? existing.measureDetails,
    measureDebug: incoming.measureDebug ?? existing.measureDebug ?? null,
    costDebug: incoming.costDebug ?? existing.costDebug,
    sourceDocumentIds: Array.from(new Set([...(existing.sourceDocumentIds ?? []), ...(incoming.sourceDocumentIds ?? [])]))
  };
}

function mergeFieldPreferManual<T>(existing: ExtractedField<T>, incoming: ExtractedField<T>): ExtractedField<T> {
  return hasManualSource(existing) ? existing : incoming;
}

function hasManualSource<T>(field: ExtractedField<T>): boolean {
  return field.sources.some((source) => source.method === "Manuell");
}

function aggregateNumberField(fields: Array<ExtractedField<number>>): ExtractedField<number> {
  const value = sumValues(fields.map((field) => field.value));
  return value === null ? emptyField<number>() : {
    value,
    sources: [{ documentId: "storage", fileName: "Lokaler Speicher", method: "Berechnung", confidence: 1 }],
    confidence: 1
  };
}

function aggregateAverageField(
  numeratorFields: Array<ExtractedField<number>>,
  denominatorFields: Array<ExtractedField<number>>
): ExtractedField<number> {
  const numerator = sumValues(numeratorFields.map((field) => field.value));
  const denominator = sumValues(denominatorFields.map((field) => field.value));
  if (numerator === null || !denominator) return emptyField<number>();
  return {
    value: Math.round((numerator / denominator) * 100) / 100,
    sources: [{ documentId: "storage", fileName: "Lokaler Speicher", method: "Berechnung", confidence: 1 }],
    confidence: 1
  };
}

function projectMatchesDocument(project: ProjectRecord, document: ObjectAnalysis): boolean {
  const objectNumber = fieldOrUnknown(document.objectNumber);
  const address = fieldOrUnknown(document.objectAddress);
  const projectType = fieldOrUnknown(document.projectType);
  return (
    (objectNumber !== "k.A." && project.object.toLowerCase().includes(objectNumber.toLowerCase())) ||
    (address !== "k.A." && project.object.toLowerCase().includes(address.toLowerCase())) ||
    (projectType !== "k.A." && project.projectType.toLowerCase() === projectType.toLowerCase())
  );
}

function matchesFilters(
  document: ObjectAnalysis,
  filters: Filters,
  projects: ProjectRecord[],
  assignments: Record<string, string | null>
): boolean {
  const project = projects.find((entry) => entry.id === assignments[document.id]);
  const haystacks = {
    year: String(unwrap(document.year) ?? ""),
    fund: String(unwrap(document.fund) ?? ""),
    object: [
      String(unwrap(document.objectNumber) ?? ""),
      String(unwrap(document.objectAddress) ?? ""),
      String(unwrap(document.fund) ?? ""),
      String(unwrap(document.provider) ?? ""),
      String(unwrap(document.documentNumber) ?? ""),
      String(unwrap(document.documentType) ?? ""),
      String(unwrap(document.projectType) ?? ""),
      project?.projectName ?? "",
      project?.status ?? "",
      document.clusters.map((cluster) => unwrap(cluster.cluster) ?? "").join(" ")
    ].join(" "),
    objectNumber: String(unwrap(document.objectNumber) ?? ""),
    address: String(unwrap(document.objectAddress) ?? ""),
    project: project?.projectName ?? "",
    projectType: `${String(unwrap(document.projectType) ?? "")} ${project?.projectType ?? ""}`,
    documentType: String(unwrap(document.documentType) ?? ""),
    provider: String(unwrap(document.provider) ?? ""),
    apartmentNumber: String(unwrap(document.apartmentNumber) ?? ""),
    location: String(unwrap(document.location) ?? ""),
    cluster: document.clusters.map((cluster) => unwrap(cluster.cluster) ?? "").join(" "),
    dataQuality: String(unwrap(document.dataQuality) ?? ""),
    status: project?.status ?? ""
  };

  return Object.entries(filters).every(([key, value]) => {
    if (!value.trim()) return true;
    if (key === "cluster") return documentMatchesTrade(document, value);
    return haystacks[key as keyof Filters].toLowerCase().includes(value.trim().toLowerCase());
  });
}

function hasFilters(filters: Filters): boolean {
  return Object.values(filters).some((value) => value.trim());
}

function buildFilterOptions(
  documents: ObjectAnalysis[],
  projects: ProjectRecord[],
  assignments: Record<string, string | null>
) {
  const projectFor = (document: ObjectAnalysis) => projects.find((entry) => entry.id === assignments[document.id]);
  return {
    years: uniqueOptions(documents.map((document) => String(unwrap(document.year) ?? ""))),
    funds: uniqueOptions(documents.map((document) => String(unwrap(document.fund) ?? ""))),
    objectNumbers: uniqueOptions(documents.map((document) => String(unwrap(document.objectNumber) ?? ""))),
    addresses: uniqueOptions(documents.map((document) => String(unwrap(document.objectAddress) ?? ""))),
    projects: uniqueOptions(documents.map((document) => projectFor(document)?.projectName ?? "")),
    projectTypes: uniqueOptions(documents.flatMap((document) => [String(unwrap(document.projectType) ?? ""), projectFor(document)?.projectType ?? ""])),
    documentTypes: uniqueOptions(documents.map((document) => String(unwrap(document.documentType) ?? ""))),
    providers: uniqueOptions(documents.map((document) => String(unwrap(document.provider) ?? ""))),
    apartments: uniqueOptions(documents.map((document) => String(unwrap(document.apartmentNumber) ?? ""))),
    locations: uniqueOptions(documents.map((document) => String(unwrap(document.location) ?? ""))),
    clusters: uniqueOptions([
      ...standardTradeCatalog,
      ...documents.flatMap((document) => document.clusters.map((cluster) => String(unwrap(cluster.cluster) ?? "")))
    ]),
    qualities: uniqueOptions(documents.map((document) => String(unwrap(document.dataQuality) ?? ""))),
    statuses: uniqueOptions(documents.map((document) => projectFor(document)?.status ?? ""))
  };
}

function uniqueOptions(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter((value) => value && value !== "k.A."))).sort((a, b) => a.localeCompare(b, "de"));
}

function calculateProjectCosts(project: ProjectRecord, documents: ObjectAnalysis[]): ProjectCostSummary {
  const offers = documents.filter(isOfferDocument);
  const progressInvoices = documents.filter(isProgressInvoiceDocument);
  const invoices = documents.filter(isInvoiceDocument);
  const supplements = documents.filter((document) => /nachtrag/i.test(documentTypeValue(document)));
  const finalInvoices = documents.filter(isFinalInvoiceDocument);
  const offersNet = sumValues(offers.map((document) => document.netCost.value));
  const offersGross = sumValues(offers.map((document) => document.totalCost.value));
  const progressNet = sumValues(progressInvoices.map((document) => document.netCost.value));
  const progressGross = sumValues(progressInvoices.map((document) => document.totalCost.value));
  const invoicesNet = sumValues(invoices.map((document) => document.netCost.value));
  const invoicesGross = sumValues(invoices.map((document) => document.totalCost.value));
  const supplementsNet = sumValues(supplements.map((document) => document.netCost.value));
  const supplementsGross = sumValues(supplements.map((document) => document.totalCost.value));
  const finalInvoicesNet = sumValues(finalInvoices.map((document) => document.netCost.value));
  const finalInvoicesGross = sumValues(finalInvoices.map((document) => document.totalCost.value));
  const actualGross = firstNumber(finalInvoicesGross, invoicesGross);
  const actualNet = firstNumber(finalInvoicesNet, invoicesNet);
  const renovatedApartments = parseGermanNumber(project.renovatedApartmentCount) ?? sumValues(documents.map((document) => document.renovatedApartmentCount.value));
  const budgetGross = parseGermanNumber(project.budgetGross);
  const budgetNet = parseGermanNumber(project.budgetNet);
  const budgetDelta = budgetGross !== null && actualGross !== null
    ? actualGross - budgetGross
    : budgetNet !== null && actualNet !== null
      ? actualNet - budgetNet
      : null;

  return {
    offersNet,
    offersGross,
    progressNet,
    progressGross,
    invoicesNet,
    invoicesGross,
    supplementsNet,
    supplementsGross,
    finalInvoicesNet,
    finalInvoicesGross,
    offerToInvoiceDelta: offersGross !== null && actualGross !== null ? actualGross - offersGross : null,
    budgetToActualDelta: budgetDelta,
    costPerApartment: actualGross !== null && renovatedApartments ? actualGross / renovatedApartments : null,
    costPerSqm: null
  };
}

function buildOverviewRows(
  group: OverviewGroup,
  objects: ObjectRecord[],
  entrances: EntranceRecord[],
  projects: ProjectRecord[],
  documents: ObjectAnalysis[],
  assignments: Record<string, string | null>
): OverviewRow[] {
  if (group === "document") {
    return documents.map((document) => overviewRowFromDocuments({
      id: `document-${document.id}`,
      level: "Dokument",
      documents: [document],
      projects,
      assignments,
      documentId: document.id
    }));
  }

  if (group === "project") {
    const projectRows = projects.map((project) => {
      const projectDocuments = documents.filter((document) => assignments[document.id] === project.id);
      const object = objects.find((entry) => entry.id === project.objectId);
      return overviewRowFromDocuments({
        id: `project-${project.id}`,
        level: "Projekt",
        documents: projectDocuments,
        object,
        project,
        projects,
        assignments,
        manualRenovatedCount: parseGermanNumber(project.renovatedApartmentCount),
        manualLivingArea: parseGermanNumber(object?.wohnflaecheSanierteWohnung ?? "")
      });
    });
    const unassignedRows = documents
      .filter((document) => !assignments[document.id])
      .map((document) => overviewRowFromDocuments({
        id: `project-unassigned-${document.id}`,
        level: "Projekt",
        documents: [document],
        projects,
        assignments,
        documentId: document.id
      }));
    return [...projectRows, ...unassignedRows];
  }

  if (group === "entrance") {
    const entranceRows = entrances.map((entrance) => {
      const entranceProjects = projects.filter((project) => project.entranceId === entrance.id);
      const entranceDocuments = documents.filter((document) => documentBelongsToEntrance(document, entrance, projects, assignments));
      const object = objects.find((entry) => entry.id === entrance.objectId);
      return overviewRowFromDocuments({
        id: `entrance-${entrance.id}`,
        level: "Hauseingang",
        documents: entranceDocuments,
        object,
        entrance,
        projects: entranceProjects,
        assignments,
        manualLivingArea: parseGermanNumber(object?.wohnflaecheSanierteWohnung ?? "")
      });
    });

    if (entranceRows.length > 0) return entranceRows;
    return groupByObject(documents).map((entry) => overviewRowFromDocuments({
      id: `entrance-detected-${entry.key}`,
      level: "Hauseingang",
      documents: entry.documents,
      projects,
      assignments
    }));
  }

  const objectRows = objects.map((object) => {
    const objectProjects = projects.filter((project) => project.objectId === object.id);
    const objectDocuments = documents.filter((document) => documentBelongsToObject(document, object, projects, assignments));
    return overviewRowFromDocuments({
      id: `object-${object.id}`,
      level: "Gesamtobjekt",
      documents: objectDocuments,
      object,
      projects: objectProjects,
      assignments,
      manualLivingArea: parseGermanNumber(object.wohnflaecheSanierteWohnung ?? "")
    });
  });

  if (objectRows.length > 0) return objectRows;
  return groupByObject(documents).map((entry) => overviewRowFromDocuments({
    id: `object-detected-${entry.key}`,
    level: "Gesamtobjekt",
    documents: entry.documents,
    projects,
    assignments
  }));
}

function overviewRowFromDocuments({
  id,
  level,
  documents,
  object,
  entrance,
  project,
  projects,
  assignments,
  manualRenovatedCount = null,
  manualLivingArea = null,
  documentId
}: {
  id: string;
  level: string;
  documents: ObjectAnalysis[];
  object?: ObjectRecord;
  entrance?: EntranceRecord;
  project?: ProjectRecord;
  projects: ProjectRecord[];
  assignments: Record<string, string | null>;
  manualRenovatedCount?: number | null;
  manualLivingArea?: number | null;
  documentId?: string;
}): OverviewRow {
  const firstDocument = documents[0] ?? null;
  const assignedProject = firstDocument ? projects.find((entry) => entry.id === assignments[firstDocument.id]) : null;
  const rowProject = project ?? assignedProject;
  const netCost = sumValues(documents.map((document) => document.netCost.value));
  const grossCost = sumValues(documents.map((document) => document.totalCost.value));
  const renovatedCount = firstNumber(manualRenovatedCount, sumValues(documents.map((document) => document.renovatedApartmentCount.value)));
  const livingArea = manualLivingArea;
  const apartments = collectApartments(documents, rowProject ?? undefined);

  return {
    id,
    level,
    objectNumber: firstKnown(object?.objectNumber ?? "", firstDocument ? fieldOrUnknown(firstDocument.objectNumber) : ""),
    addressRange: firstKnown(object?.address ?? "", firstDocument ? fieldOrUnknown(firstDocument.objectAddress) : ""),
    economicUnit: firstKnown(object ? objectLabel(object) : "", rowProject?.object ?? "", firstDocument ? fieldOrUnknown(firstDocument.objectNumber) : ""),
    entrance: firstKnown(entrance ? entranceLabel(entrance) : "", rowProject?.entrance ?? ""),
    apartments,
    renovatedCount,
    clusters: collectClusters(documents),
    description: collectDescriptions(documents, rowProject ?? undefined),
    netCost,
    grossCost,
    costPerRenovatedUnit: grossCost !== null && renovatedCount ? roundMoney(grossCost / renovatedCount) : null,
    costPerSqm: grossCost !== null && livingArea ? roundMoney(grossCost / livingArea) : null,
    documentCount: documents.length,
    dataQuality: collectQuality(documents),
    documentId
  };
}

function collectApartments(documents: ObjectAnalysis[], project?: ProjectRecord): string {
  const values = new Set<string>();
  if (project?.apartmentNumber) values.add(project.apartmentNumber);
  documents.forEach((document) => {
    document.renovatedApartments.value?.forEach((entry) => entry && values.add(entry));
    const apartment = fieldOrUnknown(document.apartmentNumber);
    if (apartment !== "k.A.") values.add(apartment);
  });
  return values.size > 0 ? Array.from(values).join(", ") : "k.A.";
}

function documentsForMeasure(row: MeasureRow, documents: ObjectAnalysis[]): ObjectAnalysis[] {
  if (row.documentId) {
    const exact = documents.filter((document) => document.id === row.documentId);
    if (exact.length) return exact;
  }
  return documents.filter((document) =>
    document.clusters.some((cluster) => normalizeTradeCluster(fieldOrUnknown(cluster.cluster), fieldOrUnknown(cluster.description)) === row.cluster)
    || (document.measureDetails ?? []).some((detail) => normalizeTradeCluster(detail.cluster, detail.beschreibung) === row.cluster)
  );
}

function buildApartmentRows(documents: ObjectAnalysis[]): Array<{
  apartment: string;
  measures: string;
  cost: number | null;
  documentCount: number;
}> {
  const groups = new Map<string, { measures: Set<string>; cost: number | null; ids: Set<string> }>();
  documents.forEach((document) => {
    const apartmentValue = fieldOrUnknown(document.apartmentNumber);
    const renovated = document.renovatedApartments.value?.filter(Boolean) ?? [];
    const apartments = apartmentValue !== "k.A." ? [apartmentValue] : renovated;
    apartments.forEach((apartment) => {
      const current = groups.get(apartment) ?? { measures: new Set<string>(), cost: null, ids: new Set<string>() };
      formatClusters(document).split(",").map((entry) => entry.trim()).filter(Boolean).forEach((entry) => {
        if (entry !== "k.A.") current.measures.add(entry);
      });
      current.cost = sumValues([current.cost, document.totalCost.value]);
      current.ids.add(document.id);
      groups.set(apartment, current);
    });
  });
  return Array.from(groups.entries())
    .map(([apartment, value]) => ({
      apartment,
      measures: value.measures.size ? Array.from(value.measures).join(", ") : "k.A.",
      cost: value.cost,
      documentCount: value.ids.size
    }))
    .sort((left, right) => left.apartment.localeCompare(right.apartment, "de", { numeric: true }));
}

function collectClusters(documents: ObjectAnalysis[]): string {
  const values = new Set<string>();
  documents.forEach((document) => {
    document.clusters.forEach((cluster) => {
      if (cluster.cluster.value) values.add(germanizeUiText(cluster.cluster.value));
    });
  });
  return values.size > 0 ? Array.from(values).join(", ") : "k.A.";
}

function collectDescriptions(documents: ObjectAnalysis[], project?: ProjectRecord): string {
  const values = new Set<string>();
  if (project?.description) values.add(project.description);
  documents.forEach((document) => {
    const description = fieldOrUnknown(document.measureDescription);
    if (description !== "k.A.") values.add(description);
  });
  return values.size > 0 ? Array.from(values).slice(0, 3).join(" | ") : "k.A.";
}

function collectQuality(documents: ObjectAnalysis[]): string {
  if (documents.length === 0) return "k.A.";
  const values = new Set(documents.map(formatKiStatus).filter((value) => value && value !== "k.A."));
  if (values.size === 0) return "k.A.";
  if (Array.from(values).some((value) => /prüfung|pruefung|manuell|unsicher|k\.a\./i.test(value))) return "Prüffall";
  return Array.from(values).join(", ");
}

function groupByObject(documents: ObjectAnalysis[]) {
  const groups = new Map<string, ObjectAnalysis[]>();
  documents.forEach((document) => {
    const key = fieldOrUnknown(document.objectNumber) !== "k.A."
      ? fieldOrUnknown(document.objectNumber)
      : fieldOrUnknown(document.objectAddress);
    groups.set(key, [...(groups.get(key) ?? []), document]);
  });
  return Array.from(groups.entries()).map(([key, groupDocuments]) => ({
    key,
    documents: groupDocuments,
    objectNumber: fieldOrUnknown(groupDocuments[0].objectNumber),
    address: fieldOrUnknown(groupDocuments[0].objectAddress)
  }));
}

function buildMapEntries(
  objects: ObjectRecord[],
  projects: ProjectRecord[],
  documents: ObjectAnalysis[],
  assignments: Record<string, string | null>
): MapEntry[] {
  const objectEntries = objects.map((object) => {
    const objectDocuments = documents.filter((document) => documentBelongsToObject(document, object, projects, assignments));
    const objectProjects = projects.filter((project) => project.objectId === object.id);
    return {
      key: object.id,
      objectId: object.id,
      title: objectLabel(object) || "k.A.",
      objectNumber: object.objectNumber || "k.A.",
      address: object.address || "k.A.",
      fund: object.fund || "k.A.",
      projectCount: objectProjects.length,
      documents: objectDocuments,
      totalCost: sumValues(objectDocuments.map((document) => document.totalCost.value)),
      latitude: parseCoordinate(object.latitude ?? ""),
      longitude: parseCoordinate(object.longitude ?? "")
    };
  });

  if (objectEntries.length > 0) return objectEntries;

  return groupByObject(documents).map((group) => ({
    key: group.key,
    objectId: "",
    title: group.address || group.objectNumber || "k.A.",
    objectNumber: group.objectNumber || "k.A.",
    address: group.address || "k.A.",
    fund: fieldOrUnknown(group.documents[0].fund),
    projectCount: 0,
    documents: group.documents,
    totalCost: sumValues(group.documents.map((document) => document.totalCost.value)),
    latitude: null,
    longitude: null
  }));
}

function parseCoordinate(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function mapCenter(entries: MapEntry[]): [number, number] {
  const coordinates = entries.filter((entry) => entry.latitude !== null && entry.longitude !== null);
  if (coordinates.length === 0) return [51.1657, 10.4515];
  const latitude = coordinates.reduce((sum, entry) => sum + (entry.latitude ?? 0), 0) / coordinates.length;
  const longitude = coordinates.reduce((sum, entry) => sum + (entry.longitude ?? 0), 0) / coordinates.length;
  return [latitude, longitude];
}

function documentBelongsToObject(
  document: ObjectAnalysis,
  object: ObjectRecord,
  projects: ProjectRecord[],
  assignments: Record<string, string | null>
): boolean {
  const assignedProject = projects.find((project) => project.id === assignments[document.id]);
  if (assignedProject?.objectId) return assignedProject.objectId === object.id;
  const documentObjectNumber = fieldOrUnknown(document.objectNumber);
  const documentAddress = fieldOrUnknown(document.objectAddress).toLowerCase();
  return Boolean(
    (object.objectNumber && documentObjectNumber !== "k.A." && object.objectNumber === documentObjectNumber) ||
    (object.address && documentAddress !== "k.a." && documentAddress.includes(object.address.toLowerCase())) ||
    (object.objectName && documentAddress !== "k.a." && documentAddress.includes(object.objectName.toLowerCase()))
  );
}

function documentBelongsToEntrance(
  document: ObjectAnalysis,
  entrance: EntranceRecord,
  projects: ProjectRecord[],
  assignments: Record<string, string | null>
): boolean {
  const assignedProject = projects.find((project) => project.id === assignments[document.id]);
  if (assignedProject?.entranceId) return assignedProject.entranceId === entrance.id;
  const address = fieldOrUnknown(document.objectAddress).toLowerCase();
  const label = entranceLabel(entrance).toLowerCase();
  return label !== "k.a." && address.includes(label);
}

function applyObjectPageFilters(documents: ObjectAnalysis[], filters: ObjectPageFilters): ObjectAnalysis[] {
  const filtered = documents.filter((document) => (
    (!filters.year || fieldOrUnknown(document.year).includes(filters.year)) &&
    (!filters.trade || documentMatchesTrade(document, filters.trade)) &&
    (!filters.documentType || fieldOrUnknown(document.documentType).toLowerCase().includes(filters.documentType.toLowerCase())) &&
    (!filters.object || `${fieldOrUnknown(document.objectNumber)} ${fieldOrUnknown(document.objectAddress)}`.toLowerCase().includes(filters.object.toLowerCase()))
  ));
  return filters.trade ? filtered.map((document) => scopeDocumentToTrade(document, filters.trade)) : filtered;
}

function buildObjectPageFilterOptions(documents: ObjectAnalysis[]) {
  return {
    years: uniqueOptions(documents.map((document) => String(document.year.value ?? ""))),
    trades: standardTradeCatalog,
    documentTypes: uniqueOptions(documents.map((document) => fieldOrUnknown(document.documentType))),
    objects: uniqueOptions(documents.flatMap((document) => [fieldOrUnknown(document.objectNumber), fieldOrUnknown(document.objectAddress)]))
  };
}

function normalizeTradeCluster(value: string, description = ""): MeasureCluster {
  const text = `${value} ${description}`.toLowerCase();
  if (standardTradeCatalog.includes(value as MeasureCluster)) return value as MeasureCluster;
  if (/dachentw[aä]sser|regenrinne|fallrohr/.test(text)) return "Dachentwässerung";
  if (/dach|ziegel|abdichtung|attika/.test(text)) return "Dach";
  if (/fassade|putz|wdvs/.test(text)) return "Fassade";
  if (/w[aä]rmed[aä]mm|dämm|daemm/.test(text)) return "Wärmedämmung";
  if (/fenster/.test(text)) return "Fenster";
  if (/t[uü]r|tuer|tischler/.test(text)) return "Türen";
  if (/balkon|loggia/.test(text)) return "Balkone";
  if (/heizung|therme|kessel|radiator|fernw[aä]rme/.test(text)) return "Heizung";
  if (/trinkwasser/.test(text)) return "Trinkwasser";
  if (/abwasser|kanal/.test(text)) return "Abwasser";
  if (/sanit[aä]r|bad|fliesen|estrich/.test(text)) return "Sanitär";
  if (/elektro|z[aä]hler|installation|leitung/.test(text)) return "Elektro";
  if (/trockenbau|gipskarton|rigips/.test(text)) return "Trockenbau";
  if (/brand|rauchmelder|rwa|feuer/.test(text)) return "Brandschutz";
  if (/aufzug|lift/.test(text)) return "Aufzüge";
  if (/treppenhaus|treppe|gel[aä]nder/.test(text)) return "Treppenhäuser";
  if (/keller/.test(text)) return "Keller";
  if (/außen|aussen|garten|hof|pflaster|gr[uü]n/.test(text)) return "Außenanlagen";
  if (/tiefgarage|garage|stellplatz/.test(text)) return "Tiefgarage";
  if (/maler|anstrich|tapezier/.test(text)) return "Malerarbeiten";
  if (/boden|belag|parkett|vinyl|sockel/.test(text)) return "Bodenbeläge";
  if (/schornstein|kamin/.test(text)) return "Schornstein";
  if (/l[uü]ftung|ventilat/.test(text)) return "Lüftung";
  if (/photovoltaik|solar|pv\b/.test(text)) return "Photovoltaik";
  return "Sonstiges";
}

function documentMatchesTrade(document: ObjectAnalysis, trade: string): boolean {
  const normalizedTrade = normalizeTradeCluster(trade, "");
  return getDocumentTradeNames(document).some((name) => normalizeTradeCluster(name, name) === normalizedTrade);
}

function scopeDocumentToTrade(document: ObjectAnalysis, trade: string): ObjectAnalysis {
  const normalizedTrade = normalizeTradeCluster(trade, "");
  const matchingClusters = document.clusters.filter((cluster) =>
    normalizeTradeCluster(fieldOrUnknown(cluster.cluster as ExtractedField<string>), fieldOrUnknown(cluster.description)) === normalizedTrade
  );
  const matchingDetails = (document.measureDetails ?? []).filter((detail) =>
    normalizeTradeCluster(detail.cluster, detail.beschreibung) === normalizedTrade
  );
  const detailTotal = sumValues(matchingDetails.map((detail) => detail.summe));
  const clusterTotal = sumValues(matchingClusters.map((cluster) => cluster.totalCost.value));
  const scopedTotal = firstNumber(detailTotal, clusterTotal, document.totalCost.value);
  const ratio = document.totalCost.value && scopedTotal !== null ? scopedTotal / document.totalCost.value : null;

  return {
    ...document,
    clusters: matchingClusters.length ? matchingClusters : document.clusters,
    measureDetails: matchingDetails.length ? matchingDetails : document.measureDetails,
    totalCost: scopedTotal === null ? document.totalCost : { ...document.totalCost, value: roundMoney(scopedTotal) },
    netCost: ratio === null ? document.netCost : scaleNumberField(document.netCost, ratio),
    vatCost: ratio === null ? document.vatCost : scaleNumberField(document.vatCost, ratio)
  };
}

function scaleNumberField(field: ExtractedField<number>, ratio: number): ExtractedField<number> {
  return field.value === null ? field : {
    ...field,
    value: roundMoney(field.value * ratio)
  };
}

function getDocumentTradeNames(document: ObjectAnalysis): string[] {
  const names = [
    ...document.clusters.map((cluster) => fieldOrUnknown(cluster.cluster as ExtractedField<string>)),
    ...(document.measureDetails ?? []).map((detail) => detail.cluster),
    fieldOrUnknown(document.measureDescription)
  ].filter((value) => value && value !== "k.A.");
  return names.length ? names : ["Sonstiges"];
}

function getTradeAllocations(document: ObjectAnalysis): TradeAllocation[] {
  if (document.measureDetails?.length) {
    return document.measureDetails.map((detail) => {
      const matchingCluster = document.clusters.find((entry) =>
        normalizeTradeCluster(fieldOrUnknown(entry.cluster), fieldOrUnknown(entry.description)) === normalizeTradeCluster(detail.cluster, detail.beschreibung)
        || fieldOrUnknown(entry.description) === detail.abschnitt
      );
      return {
        cluster: normalizeTradeCluster(detail.cluster, detail.beschreibung),
        value: detail.summe ?? reliableClusterCost(document, matchingCluster ?? null),
        document
      };
    });
  }

  if (document.clusters.length === 0) {
    return [{
      cluster: normalizeTradeCluster("Sonstiges", fieldOrUnknown(document.measureDescription)),
      value: document.totalCost.value,
      document
    }];
  }

  return document.clusters.map((cluster) => ({
    cluster: normalizeTradeCluster(fieldOrUnknown(cluster.cluster), fieldOrUnknown(cluster.description)),
    value: reliableClusterCost(document, cluster),
    document
  }));
}

function reliableClusterCost(
  document: ObjectAnalysis,
  cluster: ObjectAnalysis["clusters"][number] | null
): number | null {
  if (!cluster) return null;
  const clusterValue = cluster.totalCost.value;
  if (clusterValue === null) return document.clusters.length <= 1 ? document.totalCost.value : null;
  if (document.totalCost.value === null || document.clusters.length <= 1) return clusterValue;

  const repeatedDocumentTotalCount = document.clusters.filter((entry) =>
    entry.totalCost.value !== null && Math.abs(entry.totalCost.value - document.totalCost.value!) < 0.01
  ).length;
  if (repeatedDocumentTotalCount > 1 && Math.abs(clusterValue - document.totalCost.value) < 0.01) return null;

  const clusterSum = sumValues(document.clusters.map((entry) => entry.totalCost.value));
  if (clusterSum !== null && clusterSum > document.totalCost.value * 1.03) {
    return Math.abs(clusterValue - document.totalCost.value) < 0.01 ? null : clusterValue;
  }

  return clusterValue;
}

function groupByCluster(documents: ObjectAnalysis[]): TradeGroupRow[] {
  const groups = new Map<MeasureCluster, TradeGroupRow>();
  standardTradeCatalog.forEach((cluster) => {
    groups.set(cluster, {
      cluster,
      count: 0,
      total: 0,
      offer: 0,
      invoice: 0,
      share: null,
      status: "Keine Dokumente"
    });
  });

  documents.forEach((document) => {
    getTradeAllocations(document).forEach((allocation) => {
      const name = allocation.cluster;
      const current = groups.get(name) ?? {
        cluster: name,
        count: 0,
        total: 0,
        offer: 0,
        invoice: 0,
        share: null,
        status: "Keine Dokumente"
      };
      const value = allocation.value ?? 0;
      const nextTotal = current.total + value;
      groups.set(name, {
        ...current,
        count: current.count + 1,
        total: nextTotal,
        offer: isOfferDocument(allocation.document) ? current.offer + value : current.offer,
        invoice: isInvoiceLikeDocument(allocation.document) ? current.invoice + value : current.invoice,
        status: germanizeUiText(fieldOrUnknown(allocation.document.dataQuality))
      });
    });
  });

  const total = Array.from(groups.values()).reduce((sum, entry) => sum + entry.total, 0);
  return Array.from(groups.values())
    .map((entry) => ({
      ...entry,
      share: total > 0 ? (entry.total / total) * 100 : null
    }))
    .sort((a, b) => b.total - a.total || standardTradeCatalog.indexOf(a.cluster) - standardTradeCatalog.indexOf(b.cluster));
}

function groupByMeasureCostRole(documents: ObjectAnalysis[]) {
  const groups = new Map<MeasureCluster, {
    count: number;
    offer: number | null;
    progress: number | null;
    final: number | null;
    hasFinal: boolean;
    hasProgress: boolean;
    hasOffer: boolean;
  }>();

  standardTradeCatalog.forEach((cluster) => {
    groups.set(cluster, {
      count: 0,
      offer: null,
      progress: null,
      final: null,
      hasFinal: false,
      hasProgress: false,
      hasOffer: false
    });
  });

  documents.forEach((document) => {
    getTradeAllocations(document).forEach((allocation) => {
      const name = allocation.cluster;
      const current = groups.get(name) ?? {
        count: 0,
        offer: null,
        progress: null,
        final: null,
        hasFinal: false,
        hasProgress: false,
        hasOffer: false
      };
      const value = allocation.value;
      groups.set(name, {
        ...current,
        count: current.count + 1,
        offer: isOfferDocument(allocation.document) ? sumValues([current.offer, value]) : current.offer,
        progress: isProgressInvoiceDocument(allocation.document) ? sumValues([current.progress, value]) : current.progress,
        final: isInvoiceLikeDocument(allocation.document) ? sumValues([current.final, value]) : current.final,
        hasFinal: current.hasFinal || isInvoiceLikeDocument(allocation.document),
        hasProgress: current.hasProgress || isProgressInvoiceDocument(allocation.document),
        hasOffer: current.hasOffer || isOfferDocument(allocation.document)
      });
    });
  });

  return Array.from(groups.entries()).map(([cluster, values]) => ({
    cluster,
    count: values.count,
    offer: values.offer,
    progress: values.progress,
    final: values.final,
    status: values.hasFinal ? "Abgerechnet" : values.hasProgress ? "In Ausführung" : values.hasOffer ? "Angebot" : "Prüfung"
  }));
}

function buildCostProgressRows(documents: ObjectAnalysis[], mode: CostViewMode) {
  const rows: Array<{ key: string; label: string; meta: string; value: number; kind: string }> = [];
  const offerTotal = sumValues(documents.filter(isOfferDocument).map((document) => document.totalCost.value));
  const progressDocuments = documents.filter(isProgressInvoiceDocument);
  const finalDocuments = finalCostDocuments(documents);

  if ((mode === "comparison" || mode === "offers") && offerTotal !== null) {
    rows.push({
      key: "offer-total",
      label: "Angebotssumme",
      meta: `${formatNumber(documents.filter(isOfferDocument).length)} Angebot(e)`,
      value: offerTotal,
      kind: "offer"
    });
  }

  if (mode === "comparison" || mode === "invoices") {
    let runningProgress = 0;
    progressDocuments.forEach((document, index) => {
      const value = document.totalCost.value;
      if (value === null) return;
      runningProgress += value;
      rows.push({
        key: `progress-${document.id}`,
        label: fieldOrUnknown(document.installmentNumber ?? emptyField<string>()) !== "k.A."
          ? fieldOrUnknown(document.installmentNumber ?? emptyField<string>())
          : `${index + 1}. Abschlag`,
        meta: `kumuliert ${formatNullableCurrency(runningProgress)}`,
        value: runningProgress,
        kind: "progress"
      });
    });

    finalDocuments.forEach((document) => {
      const value = document.totalCost.value;
      if (value === null) return;
      rows.push({
        key: `final-${document.id}`,
        label: isFinalInvoiceDocument(document) ? "Schlussrechnung" : "Finale Rechnung",
        meta: fieldOrUnknown(document.documentNumber),
        value,
        kind: "final"
      });
    });
  }

  return rows;
}

function groupByDocumentType(documents: ObjectAnalysis[]) {
  const groups = new Map<string, { count: number; total: number | null }>();
  documents.forEach((document) => {
    const type = fieldOrUnknown(document.documentType);
    const current = groups.get(type) ?? { count: 0, total: null };
    groups.set(type, {
      count: current.count + 1,
      total: sumValues([current.total, document.totalCost.value])
    });
  });
  return Array.from(groups.entries()).map(([type, values]) => ({ type, ...values }));
}

function groupByYear(documents: ObjectAnalysis[]) {
  const groups = new Map<string, number | null>();
  documents.forEach((document) => {
    const year = fieldOrUnknown(document.year);
    if (year === "k.A." || document.totalCost.value === null) return;
    groups.set(year, sumValues([groups.get(year) ?? null, document.totalCost.value]));
  });
  return Array.from(groups.entries())
    .map(([year, cost]) => ({ year, cost: cost ?? 0 }))
    .sort((a, b) => a.year.localeCompare(b.year));
}

function extractYearFromMeasure(row: MeasureRow, documents: ObjectAnalysis[]): string {
  const document = documents.find((entry) => entry.id === row.documentId);
  return document ? fieldOrUnknown(document.year) : "k.A.";
}

function tradeIcon(cluster: string): string {
  const normalized = cluster.toLowerCase();
  if (normalized.includes("dach")) return "D";
  if (normalized.includes("fassade")) return "F";
  if (normalized.includes("fenster") || normalized.includes("tuer") || normalized.includes("tür")) return "T";
  if (normalized.includes("heizung")) return "H";
  if (normalized.includes("elektro")) return "E";
  if (normalized.includes("sanitaer") || normalized.includes("sanit")) return "S";
  if (normalized.includes("maler")) return "M";
  if (normalized.includes("boden")) return "B";
  return "G";
}

function objectSlug(object: ObjectRecord): string {
  const base = object.objectNumber || object.objectName || object.address || object.id;
  return base
    .toLowerCase()
    .replace(/\u00e4/g, "ae")
    .replace(/\u00f6/g, "oe")
    .replace(/\u00fc/g, "ue")
    .replace(/\u00df/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || object.id;
}

function formatShortEuro(value: number): string {
  if (value >= 1000000) return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(value / 1000000)} Mio.`;
  if (value >= 1000) return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(value / 1000)} Tsd.`;
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(value);
}

function costPerRenovatedUnit(documents: ObjectAnalysis[], grossCost: number | null): number | null {
  const renovated = sumValues(documents.map((document) => document.renovatedApartmentCount.value));
  return grossCost !== null && renovated ? roundMoney(grossCost / renovated) : null;
}

function costPerSqmForObject(object: ObjectRecord, grossCost: number | null): number | null {
  const area = parseGermanNumber(object.wohnflaecheSanierteWohnung ?? "");
  return grossCost !== null && area && area > 0 ? roundMoney(grossCost / area) : null;
}

function formatEuroPerSqm(value: number | null): string {
  return value === null ? "k.A." : `${formatNullableCurrency(value)} / m²`;
}

function buildMeasureRows(documents: ObjectAnalysis[]): MeasureRow[] {
  return documents.flatMap((document) => {
    if (document.measureDetails?.length) {
      return document.measureDetails.map((detail, index) => {
        const measure = document.clusters.find((entry) => entry.cluster.value === detail.cluster || entry.description.value === detail.abschnitt);
        const source = detail.quelle || measure?.totalCost.sources[0]?.textSnippet || "k.A.";
        return {
          id: `${document.id}-detail-${index}`,
          documentId: document.id,
          measureId: measure?.id ?? "",
          cluster: normalizeTradeCluster(detail.cluster, detail.beschreibung),
          description: germanizeUiText(detail.beschreibung || "k.A."),
          netCost: null,
          vatCost: null,
          grossCost: detail.summe,
          source,
          status: germanizeUiText(fieldOrUnknown(document.dataQuality)),
          section: detail.abschnitt || "k.A.",
          confidence: measure?.cluster.confidence === null || measure?.cluster.confidence === undefined ? "k.A." : `${Math.round(measure.cluster.confidence * 100)} %`,
          lineItems: (measure?.lineItems ?? []).map((item) => ({
            position: item.position,
            description: item.description,
            totalPrice: item.totalPrice
          }))
        };
      });
    }

    return document.clusters.map((measure, index) => {
      const cluster = normalizeTradeCluster(fieldOrUnknown(measure.cluster), fieldOrUnknown(measure.description));
      const detail = document.measureDetails?.find((entry) => entry.cluster === measure.cluster.value || entry.abschnitt === measure.description.value);
      const source = measure.totalCost.sources[0]?.textSnippet
        ?? detail?.quelle
        ?? sourceLabel(measure.totalCost);
      return {
        id: `${document.id}-${measure.id || index}`,
        documentId: document.id,
        measureId: measure.id,
        cluster,
        description: germanizeUiText(fieldOrUnknown(measure.description)),
        netCost: null,
        vatCost: null,
        grossCost: measure.totalCost.value,
        source,
        status: germanizeUiText(fieldOrUnknown(document.dataQuality)),
        section: germanizeUiText(detail?.abschnitt ?? fieldOrUnknown(measure.description)),
        confidence: measure.cluster.confidence === null ? "k.A." : `${Math.round(measure.cluster.confidence * 100)} %`,
        lineItems: (measure.lineItems ?? []).map((item) => ({
          position: item.position,
          description: item.description,
          totalPrice: item.totalPrice
        }))
      };
    });
  });
}

function formatPercent(value: number | null, total: number | null): string {
  if (value === null || !total) return "k.A.";
  return `${new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format((value / total) * 100)} %`;
}

function setCluster(
  documentId: string,
  value: string,
  onUpdate: (id: string, updater: (document: ObjectAnalysis) => ObjectAnalysis) => void
) {
  onUpdate(documentId, (document) => {
    const first = document.clusters[0] ?? {
      id: `${document.id}-manual-cluster`,
      cluster: emptyField<MeasureCluster>(),
      description: emptyField<string>(),
      totalCost: emptyField<number>(),
      allocation: emptyField<CostAllocation>(),
      sourceDocumentId: document.id
    };
    return {
      ...document,
      clusters: [
        {
          ...first,
          cluster: manualField(value) as ExtractedField<MeasureCluster>
        },
        ...document.clusters.slice(1)
      ]
    };
  });
}

function manualField<T extends string>(value: T): ExtractedField<T> {
  if (!value.trim()) return emptyField<T>();
  return {
    value,
    sources: [{ documentId: "manual", fileName: "Manuelle Korrektur", method: "Manuell", confidence: 1 }],
    confidence: 1
  };
}

function manualNumberField(value: string): ExtractedField<number> {
  const parsed = parseGermanNumber(value);
  if (parsed === null) return emptyField<number>();
  return {
    value: parsed,
    sources: [{ documentId: "manual", fileName: "Manuelle Korrektur", method: "Manuell", confidence: 1 }],
    confidence: 1
  };
}

function parseGermanNumber(value: string): number | null {
  const cleaned = value.trim().replace(/[^\d,.-]/g, "");
  if (!cleaned) return null;
  const normalized = normalizeDecimalNumber(cleaned);
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function normalizeDecimalNumber(value: string): string {
  if (value.includes(",")) {
    return value.replace(/\./g, "").replace(",", ".");
  }

  const dotCount = (value.match(/\./g) ?? []).length;
  if (dotCount === 1) {
    const [integerPart, decimalPart] = value.split(".");
    return decimalPart.length === 3 && integerPart.length <= 3
      ? `${integerPart}${decimalPart}`
      : value;
  }

  if (dotCount > 1) {
    const lastDot = value.lastIndexOf(".");
    const integerPart = value.slice(0, lastDot).replace(/\./g, "");
    const decimalPart = value.slice(lastDot + 1);
    return decimalPart.length === 3 ? `${integerPart}${decimalPart}` : `${integerPart}.${decimalPart}`;
  }

  return value;
}

function firstNumber(...values: Array<number | null>): number | null {
  return values.find((value): value is number => typeof value === "number") ?? null;
}

function documentTypeValue(document: ObjectAnalysis): string {
  return germanizeUiText(fieldOrUnknown(document.documentType));
}

function isOfferDocument(document: ObjectAnalysis): boolean {
  return /angebot/i.test(documentTypeValue(document));
}

function isOrderDocument(document: ObjectAnalysis): boolean {
  return /auftrag/i.test(documentTypeValue(document));
}

function isProgressInvoiceDocument(document: ObjectAnalysis): boolean {
  return /abschlag|teilrechnung|teilzahlung|akonto|vorauszahlung/i.test(documentTypeValue(document));
}

function isFinalInvoiceDocument(document: ObjectAnalysis): boolean {
  return /schlussrechnung|schluss|final/i.test(documentTypeValue(document));
}

function isCreditDocument(document: ObjectAnalysis): boolean {
  return /gutschrift/i.test(documentTypeValue(document));
}

function isInvoiceDocument(document: ObjectAnalysis): boolean {
  const type = documentTypeValue(document);
  return /rechnung|eingangsrechnung/i.test(type) && !isProgressInvoiceDocument(document) && !isFinalInvoiceDocument(document);
}

function isInvoiceLikeDocument(document: ObjectAnalysis): boolean {
  return isInvoiceDocument(document) || isIncomingInvoiceDocument(document) || isFinalInvoiceDocument(document) || isProgressInvoiceDocument(document);
}

function isIncomingInvoiceDocument(document: ObjectAnalysis): boolean {
  return isInvoiceDocument(document) || /eingangsrechnung/i.test(documentTypeValue(document));
}

function documentTypeBadgeClass(document: ObjectAnalysis): string {
  if (isFinalInvoiceDocument(document)) return "documentTypeFinal";
  if (isProgressInvoiceDocument(document)) return "documentTypeProgress";
  if (isOfferDocument(document)) return "documentTypeOffer";
  if (isCreditDocument(document)) return "documentTypeCredit";
  if (isInvoiceDocument(document)) return "documentTypeInvoice";
  return "documentTypeOther";
}

function costBasisLabel(value: CostBasisMode): string {
  return costBasisOptions.find((option) => option.value === value)?.label ?? "Alle Dokumente";
}

function applyCostBasis(
  documents: ObjectAnalysis[],
  basis: CostBasisMode,
  manualIds: Set<string>
): ObjectAnalysis[] {
  if (basis === "all") return documents;
  if (basis === "offers") return documents.filter(isOfferDocument);
  if (basis === "orders") return documents.filter(isOrderDocument);
  if (basis === "incomingInvoices") return documents.filter(isIncomingInvoiceDocument);
  if (basis === "progressInvoices") return documents.filter(isProgressInvoiceDocument);
  if (basis === "finalInvoices") return documents.filter(isFinalInvoiceDocument);
  if (basis === "finalOnly") return documents.filter((document) => isFinalInvoiceDocument(document) || isInvoiceDocument(document) || isCreditDocument(document));
  if (basis === "withoutProgress") return documents.filter((document) => !isProgressInvoiceDocument(document));
  if (basis === "manual") return documents.filter((document) => manualIds.has(document.id));
  return documents;
}

function finalCostDocuments(documents: ObjectAnalysis[]): ObjectAnalysis[] {
  const finalInvoices = documents.filter(isFinalInvoiceDocument);
  if (finalInvoices.length > 0) return finalInvoices;
  const invoices = documents.filter((document) => isInvoiceDocument(document) || isCreditDocument(document));
  if (invoices.length > 0) return invoices;
  return [];
}

function finalGrossCost(documents: ObjectAnalysis[]): number | null {
  return sumValues(finalCostDocuments(documents).map((document) => document.totalCost.value));
}

function emptyIfUnknown(value: string): string {
  return value === "k.A." ? "" : value;
}

function firstKnown(...values: string[]): string {
  return values.find((value) => value && value !== "k.A.") ?? "";
}

function compareObjectsByNumber(left: ObjectRecord, right: ObjectRecord): number {
  const leftNumber = parseObjectNumber(left.objectNumber);
  const rightNumber = parseObjectNumber(right.objectNumber);
  if (leftNumber !== null && rightNumber !== null && leftNumber !== rightNumber) return leftNumber - rightNumber;
  if (leftNumber !== null && rightNumber === null) return -1;
  if (leftNumber === null && rightNumber !== null) return 1;
  return objectLabel(left).localeCompare(objectLabel(right), "de", { numeric: true, sensitivity: "base" });
}

function parseObjectNumber(value: string): number | null {
  const match = value.match(/\d+/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function objectLabel(object: ObjectRecord): string {
  return firstKnown(object.objectNumber, object.objectName, object.address);
}

function entranceLabel(entrance: EntranceRecord): string {
  const streetLine = `${entrance.street} ${entrance.houseNumber}${entrance.suffix}`.trim();
  const cityLine = firstKnown(entrance.city, entrance.postalCode);
  return firstKnown(streetLine, cityLine);
}

function formatApartment(document: ObjectAnalysis): string {
  const apartment = fieldOrUnknown(document.apartmentNumber);
  const location = fieldOrUnknown(document.location);
  if (apartment === "k.A." && location === "k.A.") return "k.A.";
  if (location === "k.A.") return apartment;
  if (apartment === "k.A.") return location;
  return `${apartment} / ${location}`;
}

function formatClusters(document: ObjectAnalysis): string {
  const clusters = Array.from(new Set(document.clusters.map((cluster) => cluster.cluster.value ? germanizeUiText(cluster.cluster.value) : null).filter(Boolean)));
  return clusters.length === 0 ? "k.A." : clusters.join(", ");
}

function formatKiStatus(document: ObjectAnalysis): string {
  const quality = germanizeUiText(fieldOrUnknown(document.dataQuality));
  const score = document.confidenceScore.value;
  if (score === null) return quality;
  return `${quality} (${Math.round(score)} %)`;
}

function germanizeUiText(value: string): string {
  return value
    .replace(/Sanitaer/g, "Sanitär")
    .replace(/sanitaer/g, "sanitär")
    .replace(/Tueren/g, "Türen")
    .replace(/Tuer/g, "Tür")
    .replace(/tueren/g, "türen")
    .replace(/tuer/g, "tür")
    .replace(/Kueche/g, "Küche")
    .replace(/Pruefung/g, "Prüfung")
    .replace(/Prueffall/g, "Prüffall")
    .replace(/Prueffaelle/g, "Prüffälle")
    .replace(/Datenqualitaet/g, "Datenqualität")
    .replace(/Massnahmen/g, "Maßnahmen")
    .replace(/Massnahme/g, "Maßnahme")
    .replace(/Flaeche/g, "Fläche")
    .replace(/Haeuser/g, "Häuser")
    .replace(/Hauseingaenge/g, "Hauseingänge");
}

function sumValues(values: Array<number | null>): number | null {
  const numericValues = values.filter((value): value is number => typeof value === "number");
  if (numericValues.length === 0) return null;
  return numericValues.reduce((sum, value) => sum + value, 0);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function countReviewCases(documents: ObjectAnalysis[]): number {
  return documents.filter((document) =>
    /prüfung|pruefung|unsicher|k\.a\.|manuelle/i.test(String(document.dataQuality.value ?? "")) ||
    document.missingInformation.value?.length
  ).length;
}

function countUnknownFields(documents: ObjectAnalysis[]): number {
  return documents.reduce((count, document) => {
    const fields = [
      document.year,
      document.fund,
      document.objectNumber,
      document.objectAddress,
      document.projectType,
      document.apartmentNumber,
      document.location,
      document.livingAreaSqm,
      document.documentType,
      document.provider,
      document.documentDate,
      document.documentNumber,
      document.netCost,
      document.vatCost,
      document.totalCost,
      document.dataQuality
    ];
    return count + fields.filter((field) => field.value === null).length;
  }, 0);
}

function formatNullableCurrency(value: number | null): string {
  return value === null ? "k.A." : formatCurrency(value);
}

function formatNullableNumber(value: number | null): string {
  return value === null ? "k.A." : formatNumber(value);
}
