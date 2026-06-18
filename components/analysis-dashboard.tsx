"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
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
import type { CostAllocation, ExtractedField, MeasureCluster, ObjectAnalysis, PortfolioAnalysisState } from "../types/analysis";

const ObjectMap = dynamic<{ entries: ObjectMapEntry[]; onOpenObject: (id: string) => void }>(
  () => import("./map/ObjectMap").then((module) => module.ObjectMap),
  {
  ssr: false,
  loading: () => <div className="mapEmpty">Karte wird geladen...</div>
  }
);

type ViewKey = "dashboard" | "upload" | "objects" | "projects" | "unassigned" | "reports" | "settings";
type ProjectTab = "overview" | "documents" | "costs" | "measures" | "ai";
type ObjectTab = "overview" | "measures" | "costs" | "projects" | "documents" | "ai" | "entrances";
type OverviewGroup = "object" | "entrance" | "project" | "document";
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

const navItems: Array<{ key: ViewKey; label: string }> = [
  { key: "dashboard", label: "Dashboard" },
  { key: "upload", label: "Dokument Upload / KI" },
  { key: "objects", label: "Objekte" },
  { key: "projects", label: "Projekte" },
  { key: "unassigned", label: "Unzugeordnete Dokumente" },
  { key: "reports", label: "Auswertungen" },
  { key: "settings", label: "Einstellungen" }
];

const projectTabs: Array<{ key: ProjectTab; label: string }> = [
  { key: "overview", label: "Uebersicht" },
  { key: "documents", label: "Dokumente" },
  { key: "costs", label: "Kosten" },
  { key: "measures", label: "Massnahmen" },
  { key: "ai", label: "KI-Pruefung" }
];

const objectTabs: Array<{ key: ObjectTab; label: string }> = [
  { key: "overview", label: "Uebersicht" },
  { key: "measures", label: "Massnahmen" },
  { key: "costs", label: "Kosten" },
  { key: "projects", label: "Projekte" },
  { key: "documents", label: "Dokumente" },
  { key: "ai", label: "KI-Pruefung" },
  { key: "entrances", label: "Hauseingaenge" }
];

export function AnalysisDashboard() {
  const [analysis, setAnalysis] = useState<PortfolioAnalysisState>(emptyAnalysisState);
  const [view, setView] = useState<ViewKey>("dashboard");
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

  const filteredDocuments = useMemo(() => {
    return analysis.objects.filter((document) => matchesFilters(document, filters, projects, assignments));
  }, [analysis.objects, assignments, filters, projects]);

  const selectedDocument = useMemo(() => {
    return analysis.objects.find((document) => document.id === selectedDocumentId) ?? filteredDocuments[0] ?? null;
  }, [analysis.objects, filteredDocuments, selectedDocumentId]);

  const selectedProject = useMemo(() => {
    return projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? null;
  }, [projects, selectedProjectId]);

  const selectedObject = useMemo(() => {
    return objects.find((object) => object.id === selectedObjectId) ?? objects[0] ?? null;
  }, [objects, selectedObjectId]);

  const unassignedDocuments = filteredDocuments.filter((document) => !assignments[document.id]);
  const selectedProjectDocuments = selectedProject
    ? filteredDocuments.filter((document) => assignments[document.id] === selectedProject.id)
    : [];

  const kpis = useMemo<KpiShape>(() => {
    const gross = sumValues(filteredDocuments.map((document) => document.totalCost.value));
    const net = sumValues(filteredDocuments.map((document) => document.netCost.value));
    const apartments = sumValues(filteredDocuments.map((document) => document.renovatedApartmentCount.value));
    const area = sumValues(filteredDocuments.map((document) => document.livingAreaSqm.value));
    const objectCount = new Set([
      ...objects.map((object) => object.objectNumber || object.address || object.id),
      ...filteredDocuments.map((document) => document.objectNumber.value || document.objectAddress.value || document.id)
    ]).size;

    return {
      gross,
      net,
      objects: objectCount,
      projects: projects.length,
      documents: filteredDocuments.length,
      apartments,
      costPerApartment: gross !== null && apartments ? gross / apartments : null,
      costPerSqm: gross !== null && area ? gross / area : null,
      reviewCases: countReviewCases(filteredDocuments),
      unknownFields: countUnknownFields(filteredDocuments)
    };
  }, [filteredDocuments, objects, projects.length]);

  async function handleAnalyze(files: File[]) {
    setIsAnalyzing(true);
    setMessage(null);

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
      setAnalysis(buildAnalysisFromDocuments(mergedDocuments, data.analysis));
      setSelectedDocumentId(data.analysis.objects[0]?.id ?? mergedDocuments[0]?.id ?? null);
      setAssignments((current) => {
        const next = autoAssignDocuments(mergedDocuments, projects, current);
        saveAssignments(next);
        return next;
      });
      setMessage("Analyse abgeschlossen. Fehlende Werte bleiben k.A. und koennen rechts korrigiert werden.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Analyse fehlgeschlagen.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handlePreview(files: File[]) {
    setMessage(null);
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

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">P</div>
          <div>
            <strong>PARIBUS</strong>
            <span>Baukosten Analyse</span>
          </div>
        </div>
        <nav className="nav">
          {navItems.map((item) => (
            <button
              key={item.key}
              className={view === item.key ? "navButton navButtonActive" : "navButton"}
              type="button"
              onClick={() => setView(item.key)}
              >
              {item.label}
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
            <p className="eyebrow">KI als Hauptarbeit</p>
            <h1>PARIBUS | Baukosten Analyse</h1>
            <p className="muted">Objekte, Projekte, Dokumente und Baukosten strukturiert auswerten.</p>
          </div>
          <div className="headerActions">
            <button className="buttonPrimary" type="button" onClick={() => setView("upload")}>Upload</button>
            <button type="button" onClick={() => exportFile("excel")}>Export Excel</button>
            <button type="button" onClick={() => exportFile("pdf")}>Export PDF</button>
          </div>
        </header>

        {view === "dashboard" ? (
          <DashboardView
            kpis={kpis}
            objects={objects}
            entrances={entrances}
            projects={projects}
            documents={filteredDocuments}
            assignments={assignments}
            overviewGroup={overviewGroup}
            selectedDocument={selectedDocument}
            filters={filters}
            setFilters={setFilters}
            onSetOverviewGroup={setOverviewGroup}
            onSelectDocument={setSelectedDocumentId}
            onOpenObject={(objectId) => {
              setSelectedObjectId(objectId);
              setObjectTab("overview");
              setView("objects");
            }}
            onOpenProjects={() => setView("projects")}
            onOpenObjects={() => setView("objects")}
          />
        ) : (
          <section className="workspaceGrid">
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
                onSelectObject={setSelectedObjectId}
                onSetTab={setObjectTab}
                onUpdateObject={updateObject}
                onUpdateEntrance={updateEntrance}
                onUpdateDocument={updateDocument}
                onAddObjectImages={(objectId, files) => {
                  const urls = Array.from(files).map((file) => URL.createObjectURL(file));
                  setObjectImages((current) => ({ ...current, [objectId]: [...(current[objectId] ?? []), ...urls] }));
                }}
                onSelectDocument={setSelectedDocumentId}
              />
              ) : null}

              {view === "upload" ? (
              <DocumentUploadView
                previews={previews}
                isAnalyzing={isAnalyzing}
                message={message}
                onAnalyze={handleAnalyze}
                onPreview={handlePreview}
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

            <DocumentEditor
              document={selectedDocument}
              projects={projects}
              assignedProjectId={selectedDocument ? assignments[selectedDocument.id] ?? null : null}
              onAssign={(projectId) => selectedDocument && assignDocument(selectedDocument.id, projectId)}
              onCreateProject={() => selectedDocument && createProject(selectedDocument)}
              onDelete={() => selectedDocument && deleteDocument(selectedDocument.id)}
              onUpdate={updateDocument}
            />
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

      <section className="mapObjectGrid">
        <PortfolioMap
          objects={objects}
          projects={projects}
          documents={documents}
          assignments={assignments}
          selectedDocument={selectedDocument}
          onSelectDocument={onSelectDocument}
          onOpenObject={onOpenObject}
        />
        <ObjectSideList
          objects={objects}
          projects={projects}
          documents={documents}
          assignments={assignments}
          selectedDocument={selectedDocument}
          onSelectDocument={onSelectDocument}
          onOpenObject={onOpenObject}
        />
      </section>

      <SelectedPortfolioDetail document={selectedDocument} />

      <PortfolioOverviewTable
        group={overviewGroup}
        objects={objects}
        entrances={entrances}
        projects={projects}
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
  onPreview
}: {
  previews: ParsedPreview[];
  isAnalyzing: boolean;
  message: string | null;
  onAnalyze: (files: File[]) => Promise<void>;
  onPreview: (files: File[]) => Promise<void>;
}) {
  return (
    <section className="uploadWorkspace">
      <div className="panelHeader uploadTitle">
        <div>
          <h2>Dokument Upload / KI</h2>
          <p>Hier landen Upload, Textpruefung und die Analyse mit der PARIBUS Baukosten KI. Das Dashboard bleibt nur fuer Objekte und Portfolio-Kennzahlen.</p>
        </div>
        <span className="status statusNeutral">KI Arbeitsbereich</span>
      </div>
      <UploadPanel isAnalyzing={isAnalyzing} message={message} onAnalyze={onAnalyze} onPreview={onPreview} />
      <PreviewPanel previews={previews} />
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
  const filteredEntries = entries.filter((entry) =>
    `${entry.title} ${entry.fund} ${entry.address}`.toLowerCase().includes(query.toLowerCase())
  );
  const mappedEntries = filteredEntries.filter((entry) => entry.latitude !== null && entry.longitude !== null);
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
    latitude: entry.latitude as number,
    longitude: entry.longitude as number
  }));
  const missingCount = filteredEntries.length - mappedEntries.length;
  return (
    <section className="portfolioMap panel">
      <div className="mapSearchBar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Objekt oder Adresse suchen..." />
        <span>{missingCount > 0 ? `${missingCount} Objekt(e): Koordinaten fehlen` : "Koordinaten gepflegt"}</span>
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
              <span>{entry.title}</span>
              <strong>{entry.projectCount} P / {entry.documents.length} D</strong>
              <em>{entry.latitude === null || entry.longitude === null ? "Koordinaten fehlen" : formatNullableCurrency(entry.totalCost)}</em>
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
          <InfoLine label="Wohnflaeche" value={formatSqm(document.livingAreaSqm)} />
        </div>
        <div className="infoCard">
          <h3>Kostenuebersicht</h3>
          <InfoLine label="Netto" value={formatCurrency(document.netCost)} />
          <InfoLine label="MwSt" value={formatCurrency(document.vatCost)} />
          <InfoLine label="Brutto" value={formatCurrency(document.totalCost)} />
          <div className="donutMini">
            <span>{formatCurrency(document.totalCost)}</span>
          </div>
        </div>
        <div className="infoCard">
          <h3>KI-Pruefung</h3>
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
              <th>Massnahme</th>
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
      <Kpi label="Kosten pro m2" value={formatNullableCurrency(kpis.costPerSqm)} />
      <Kpi label="Offene Prueffaelle" value={formatNumber(kpis.reviewCases)} warning />
      <Kpi label="k.A.-Felder" value={formatNumber(kpis.unknownFields)} warning />
    </section>
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
          <h2>Objektuebersicht</h2>
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
              <th>Massnahmencluster</th>
              <th>Kurzbeschreibung</th>
              <th>Kosten netto</th>
              <th>Kosten brutto</th>
              <th>Durchschnitt pro WE</th>
              <th>Kosten pro m2</th>
              <th>Anzahl Dokumente</th>
              <th>Datenqualitaet / Prueffall</th>
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
                <td>{formatNullableCurrency(row.costPerSqm)}</td>
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
        ["apartmentNumber", "Wohnungsnummer"],
        ["location", "Lage"],
        ["cluster", "Massnahmencluster"],
        ["dataQuality", "Datenqualitaet"],
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
          <p>Rohtext-Pruefung vor der KI-Auswertung.</p>
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
              <th>Wohnung / Lage</th>
              <th>Wohnflaeche</th>
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
                <td>{fieldOrUnknown(document.documentType)}</td>
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
  onSelectObject,
  onSetTab,
  onUpdateObject,
  onUpdateEntrance,
  onUpdateDocument,
  onAddObjectImages,
  onSelectDocument
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
  onSelectObject: (id: string) => void;
  onSetTab: (tab: ObjectTab) => void;
  onUpdateObject: (id: string, field: keyof ObjectRecord, value: string) => void;
  onUpdateEntrance: (id: string, field: keyof EntranceRecord, value: string) => void;
  onUpdateDocument: (id: string, updater: (document: ObjectAnalysis) => ObjectAnalysis) => void;
  onAddObjectImages: (id: string, files: FileList) => void;
  onSelectDocument: (id: string) => void;
}) {
  const [objectSearch, setObjectSearch] = useState("");
  const detectedGroups = groupByObject(documents);
  const filteredObjects = objects.filter((object) =>
    `${object.objectNumber} ${object.objectName} ${object.address} ${object.fund}`.toLowerCase().includes(objectSearch.toLowerCase())
  );
  const selectedEntrances = selectedObject ? entrances.filter((entrance) => entrance.objectId === selectedObject.id) : [];
  const selectedProjects = selectedObject ? projects.filter((project) => project.objectId === selectedObject.id) : [];
  const selectedDocuments = selectedObject ? documents.filter((document) => documentBelongsToObject(document, selectedObject, projects, assignments)) : [];
  return (
    <section className="panel">
      <div className="panelHeader">
        <div>
          <h2>Objekte</h2>
          <p>Objekte koennen manuell angelegt und bearbeitet werden. Keine einzelne Wohnungsverwaltung.</p>
        </div>
        <button className="buttonPrimary" type="button" onClick={onCreate}>Objekt erstellen</button>
      </div>

      <div className="objectKpiStrip">
        <CostMetric label="Objekte" value={formatNumber(objects.length)} />
        <CostMetric label="Projekte" value={formatNumber(projects.length)} />
        <CostMetric label="Dokumente" value={formatNumber(documents.length)} />
        <CostMetric label="Prueffaelle" value={formatNumber(countReviewCases(documents))} />
      </div>

      <div className="projectLayout">
        <div className="projectList">
          <input className="sideSearch" value={objectSearch} onChange={(event) => setObjectSearch(event.target.value)} placeholder="Objekt suchen..." />
          {filteredObjects.length === 0 ? <p className="muted">Noch keine passenden Objekte.</p> : null}
          {filteredObjects.map((object) => {
            const objectDocuments = documents.filter((document) => documentBelongsToObject(document, object, projects, assignments));
            const objectProjects = projects.filter((project) => project.objectId === object.id);
            return (
              <button
                key={object.id}
                className={selectedObject?.id === object.id ? "projectListItem selectedRow" : "projectListItem"}
                type="button"
                onClick={() => onSelectObject(object.id)}
              >
                <strong>{objectLabel(object) || "k.A."}</strong>
                <span>{object.address || "Adressbereich k.A."}</span>
                <span>{object.fund || "Fonds k.A."} - {objectProjects.length} P - {objectDocuments.length} D</span>
                <em>{formatNullableCurrency(sumValues(objectDocuments.map((document) => document.totalCost.value)))}</em>
              </button>
            );
          })}
        </div>
        <div>
          {selectedObject ? (
            <>
              <ObjectDetailHeader object={selectedObject} entrances={selectedEntrances} projects={selectedProjects} documents={selectedDocuments} />
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
                <>
                  <ObjectForm object={selectedObject} onChange={(field, value) => onUpdateObject(selectedObject.id, field, value)} />
                  <ObjectImageUpload
                    images={objectImages[selectedObject.id] ?? []}
                    onAdd={(files) => onAddObjectImages(selectedObject.id, files)}
                  />
                </>
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
                  projects={projects}
                  assignments={assignments}
                  onUpdateDocument={onUpdateDocument}
                />
              ) : null}
              {activeTab === "projects" ? <ObjectProjectsTab projects={selectedProjects} /> : null}
              {activeTab === "documents" ? (
                <ObjectDocumentsTab documents={selectedDocuments} onSelect={onSelectDocument} />
              ) : null}
              {activeTab === "ai" ? <ProjectAiTab documents={selectedDocuments} /> : null}
              {activeTab === "costs" ? (
                <ObjectCostsTab
                  object={selectedObject}
                  entrances={selectedEntrances}
                  projects={selectedProjects}
                  documents={selectedDocuments}
                  allProjects={projects}
                  assignments={assignments}
                />
              ) : null}
              <div className="headerActions projectActions">
                <button type="button" onClick={() => onDelete(selectedObject.id)}>Objekt loeschen</button>
              </div>
            </>
          ) : (
            <div className="emptyState"><p>Kein Objekt ausgewaehlt.</p></div>
          )}
        </div>
      </div>

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
  );
}

function ObjectDetailHeader({
  object,
  entrances,
  projects,
  documents
}: {
  object: ObjectRecord;
  entrances: EntranceRecord[];
  projects: ProjectRecord[];
  documents: ObjectAnalysis[];
}) {
  return (
    <div className="objectDetailHeader">
      <div>
        <span className="eyebrow">Wirtschaftseinheit</span>
        <h3>{object.objectNumber || object.objectName || "k.A."}</h3>
        <p>{object.address || "Adressbereich k.A."}</p>
      </div>
      <div className="objectHeaderMetrics">
        <CostMetric label="Hauseingaenge" value={formatNumber(entrances.length)} />
        <CostMetric label="Projekte" value={formatNumber(projects.length)} />
        <CostMetric label="Dokumente" value={formatNumber(documents.length)} />
        <CostMetric label="Kosten brutto" value={formatNullableCurrency(sumValues(documents.map((document) => document.totalCost.value)))} />
      </div>
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
          <h3>Hauseingaenge</h3>
          <p>Ein Objekt kann eine ganze Wirtschaftseinheit wie Pamirweg 1-14 umfassen.</p>
        </div>
        <button className="buttonPrimary" type="button" onClick={onCreate}>Hauseingang anlegen</button>
      </div>
      {entrances.length === 0 ? <div className="emptyState"><p>Noch keine Hauseingaenge angelegt.</p></div> : null}
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

function ObjectDocumentsTab({ documents, onSelect }: { documents: ObjectAnalysis[]; onSelect: (id: string) => void }) {
  return (
    <div className="tableWrap compactTable">
      <table>
        <thead>
          <tr><th>Dokumenttyp</th><th>Anbieter</th><th>Dokumentnummer</th><th>Adresse</th><th>Brutto</th><th>Status</th></tr>
        </thead>
        <tbody>
          {documents.length === 0 ? <tr><td colSpan={6}>k.A.</td></tr> : documents.map((document) => (
            <tr key={document.id} onClick={() => onSelect(document.id)}>
              <td>{fieldOrUnknown(document.documentType)}</td>
              <td>{fieldOrUnknown(document.provider)}</td>
              <td>{fieldOrUnknown(document.documentNumber)}</td>
              <td>{fieldOrUnknown(document.objectAddress)}</td>
              <td>{formatCurrency(document.totalCost)}</td>
              <td>{formatKiStatus(document)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ObjectMeasuresTab({
  documents,
  projects,
  assignments,
  onUpdateDocument
}: {
  documents: ObjectAnalysis[];
  projects: ProjectRecord[];
  assignments: Record<string, string | null>;
  onUpdateDocument: (id: string, updater: (document: ObjectAnalysis) => ObjectAnalysis) => void;
}) {
  const [selectedMeasureId, setSelectedMeasureId] = useState<string | null>(null);
  const [filters, setFilters] = useState({ project: "", year: "", documentType: "" });
  const filteredDocuments = documents.filter((document) => {
    const project = projects.find((entry) => entry.id === assignments[document.id]);
    return (
      (!filters.project || (project?.projectName ?? "").toLowerCase().includes(filters.project.toLowerCase())) &&
      (!filters.year || String(document.year.value ?? "").includes(filters.year)) &&
      (!filters.documentType || fieldOrUnknown(document.documentType).toLowerCase().includes(filters.documentType.toLowerCase()))
    );
  });
  const rows = buildMeasureRows(filteredDocuments);
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
      <TradeCostBarChart rows={chartRows} onSelect={setSelectedMeasureId} />
      <div className="measureGrid">
        <div className="tableWrap compactTable">
          <table className="measureTable">
            <thead>
              <tr>
                <th>Gewerk / Cluster</th>
                <th>Beschreibung</th>
                <th>Kosten netto</th>
                <th>MwSt</th>
                <th>Kosten brutto</th>
                <th>Anteil</th>
                <th>Quelle</th>
                <th>Status</th>
                <th>Bearbeiten</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? <tr><td colSpan={9}>k.A.</td></tr> : rows.map((row) => (
                <tr key={row.id} className={selectedRow?.id === row.id ? "selectedRow" : ""} onClick={() => setSelectedMeasureId(row.id)}>
                  <td><input value={row.cluster} onChange={(event) => updateMeasure(row, "cluster", event.target.value)} /></td>
                  <td><input value={row.description === "k.A." ? "" : row.description} onChange={(event) => updateMeasure(row, "description", event.target.value)} placeholder="k.A." /></td>
                  <td>{formatNullableCurrency(row.netCost)}</td>
                  <td>{formatNullableCurrency(row.vatCost)}</td>
                  <td><input value={row.grossCost === null ? "" : String(row.grossCost).replace(".", ",")} onChange={(event) => updateMeasure(row, "grossCost", event.target.value)} placeholder="k.A." /></td>
                  <td>{formatPercent(row.grossCost, totalGross)}</td>
                  <td className="wideCell">{row.source}</td>
                  <td><input value={row.status === "k.A." ? "" : row.status} onChange={(event) => updateMeasure(row, "status", event.target.value)} placeholder="k.A." /></td>
                  <td><button type="button" onClick={(event) => { event.stopPropagation(); setSelectedMeasureId(row.id); }}>Bearbeiten</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <MeasureDetailPanel row={selectedRow} />
      </div>
    </div>
  );
}

function MeasureDetailPanel({ row }: { row: MeasureRow | null }) {
  if (!row) return <aside className="measureDetail"><p className="muted">Kein Gewerk ausgewaehlt.</p></aside>;
  return (
    <aside className="measureDetail">
      <h3>{row.cluster}</h3>
      <InfoLine label="Beschreibung" value={row.description} />
      <InfoLine label="Abschnitt" value={row.section} />
      <InfoLine label="Kosten" value={formatNullableCurrency(row.grossCost)} />
      <InfoLine label="Quelle" value={row.source} />
      <InfoLine label="KI-Sicherheit" value={row.confidence} />
      <button type="button">Bearbeiten</button>
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
  const objectTotal = sumValues(documents.map((document) => document.totalCost.value));
  const byCluster = groupByCluster(documents);
  const byDocumentType = groupByDocumentType(documents);
  return (
    <div className="costHierarchy">
      <CostMetric label={`Gesamtkosten Objekt ${object.objectNumber || "k.A."}`} value={formatNullableCurrency(objectTotal)} />
      <div className="costSummaryGrid">
        <CostMetric label="Kosten netto" value={formatNullableCurrency(sumValues(documents.map((document) => document.netCost.value)))} />
        <CostMetric label="MwSt" value={formatNullableCurrency(sumValues(documents.map((document) => document.vatCost.value)))} />
        <CostMetric label="Kosten brutto" value={formatNullableCurrency(objectTotal)} />
        <CostMetric label="Kosten je sanierte WE" value={formatNullableCurrency(costPerRenovatedUnit(documents, objectTotal))} />
        <CostMetric label="Kosten je m2" value={formatNullableCurrency(costPerSqmForDocuments(documents, objectTotal))} />
      </div>
      <div className="tableWrap compactTable">
        <table>
          <thead>
            <tr><th>Ebene</th><th>Bezeichnung</th><th>Projekte</th><th>Dokumente</th><th>Kosten brutto</th></tr>
          </thead>
          <tbody>
            {entrances.length === 0 ? <tr><td colSpan={5}>Keine Hauseingaenge angelegt.</td></tr> : entrances.map((entrance) => {
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
  return (
    <section className="objectImagesPanel">
      <div className="panelHeader compactHeader">
        <div>
          <h3>Objektbilder</h3>
          <p>Bilder lokal auswaehlen und als Vorschau am Objekt anzeigen.</p>
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
        <div className="imageEmpty">Noch keine Bilder fuer dieses Objekt ausgewaehlt.</div>
      ) : (
        <div className="objectImageGrid">
          {images.map((image, index) => (
            <img key={`${image}-${index}`} src={image} alt={`Objektbild ${index + 1}`} />
          ))}
        </div>
      )}
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
            <div className="emptyState"><p>Kein Projekt ausgewaehlt.</p></div>
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
            <th>Wohnungsnummer</th>
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
              <td>{fieldOrUnknown(document.documentType)}</td>
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
  const summary = calculateProjectCosts(project, documents);
  return (
    <div className="costSummaryGrid">
      <CostMetric label="Summe Angebote netto" value={formatNullableCurrency(summary.offersNet)} />
      <CostMetric label="Summe Angebote brutto" value={formatNullableCurrency(summary.offersGross)} />
      <CostMetric label="Summe Rechnungen netto" value={formatNullableCurrency(summary.invoicesNet)} />
      <CostMetric label="Summe Rechnungen brutto" value={formatNullableCurrency(summary.invoicesGross)} />
      <CostMetric label="Summe Nachtraege netto" value={formatNullableCurrency(summary.supplementsNet)} />
      <CostMetric label="Summe Nachtraege brutto" value={formatNullableCurrency(summary.supplementsGross)} />
      <CostMetric label="Summe Schlussrechnungen netto" value={formatNullableCurrency(summary.finalInvoicesNet)} />
      <CostMetric label="Summe Schlussrechnungen brutto" value={formatNullableCurrency(summary.finalInvoicesGross)} />
      <CostMetric label="Abweichung Angebot zu Rechnung" value={formatNullableCurrency(summary.offerToInvoiceDelta)} />
      <CostMetric label="Abweichung Budget zu Ist" value={formatNullableCurrency(summary.budgetToActualDelta)} />
      <CostMetric label="Kosten pro sanierte Wohnung" value={formatNullableCurrency(summary.costPerApartment)} />
      <CostMetric label="Kosten pro m2" value={formatNullableCurrency(summary.costPerSqm)} />
    </div>
  );
}

function ProjectMeasuresTab({ documents }: { documents: ObjectAnalysis[] }) {
  const byCluster = groupByCluster(documents);
  return (
    <div className="tableWrap compactTable">
      <table>
        <thead>
          <tr><th>Massnahmencluster</th><th>Dokumente</th><th>Kosten brutto</th></tr>
        </thead>
        <tbody>
          {byCluster.length === 0 ? (
            <tr><td colSpan={3}>k.A.</td></tr>
          ) : byCluster.map((entry) => (
            <tr key={entry.cluster}>
              <td>{entry.cluster}</td>
              <td>{entry.count}</td>
              <td>{formatNullableCurrency(entry.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProjectAiTab({ documents }: { documents: ObjectAnalysis[] }) {
  return (
    <div className="previewList">
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
                <option value="">Projekt auswaehlen</option>
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
          <p>Kosten nach Objekt, Projekt und Massnahmencluster.</p>
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
          <p>OpenAI API-Key und Analyse-Regeln werden ueber Server-Umgebung und Backend gesteuert.</p>
        </div>
      </div>
      <div className="settingsGrid">
        <div className="metric"><span>KI-Agent</span><strong>PARIBUS Baukosten KI</strong><small>Dokument verstehen, Stammdatenabgleich vorbereiten, Confidence bewerten, Nutzerentscheidung offen lassen.</small></div>
        <div className="metric"><span>KI-Modus</span><strong>Dokumentbasierte Extraktion</strong><small>Keine Fantasiewerte, k.A. bei fehlenden Angaben.</small></div>
        <div className="metric"><span>Zuordnung</span><strong>Vorschlag statt Entscheidung</strong><small>Der Nutzer entscheidet. Manuelle Eingaben haben Vorrang.</small></div>
        <div className="metric"><span>Summen</span><strong>Regex, Tabellenanalyse, KI-Pruefung</strong><small>Mehrere Summen werden im Debug erklaert.</small></div>
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
        <div className="emptyState"><p>Kein Dokument ausgewaehlt.</p></div>
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
        <EditInput label="Anbieter" value={fieldOrUnknown(document.provider)} onChange={(value) => setText("provider", value)} />
        <EditInput label="Dokumentnummer" value={fieldOrUnknown(document.documentNumber)} onChange={(value) => setText("documentNumber", value)} />
        <EditInput label="Datum" value={fieldOrUnknown(document.documentDate)} onChange={(value) => setText("documentDate", value)} />
        <EditInput label="Jahr" value={fieldOrUnknown(document.year)} onChange={(value) => setNumber("year", value)} />
        <EditInput label="Wohnungsnummer" value={fieldOrUnknown(document.apartmentNumber)} onChange={(value) => setText("apartmentNumber", value)} />
        <EditInput label="Lage" value={fieldOrUnknown(document.location)} onChange={(value) => setText("location", value)} />
        <EditInput label="Anzahl sanierte Wohnungen" value={fieldOrUnknown(document.renovatedApartmentCount)} onChange={(value) => setNumber("renovatedApartmentCount", value)} />
        <EditInput label="Wohnflaeche m2" value={fieldOrUnknown(document.livingAreaSqm)} onChange={(value) => setNumber("livingAreaSqm", value)} />
        <EditInput label="Massnahmencluster" value={formatClusters(document)} onChange={(value) => setCluster(document.id, value, onUpdate)} />
        <EditInput label="Beschreibung" value={fieldOrUnknown(document.measureDescription)} onChange={(value) => setText("measureDescription", value)} />
        <EditInput label="Netto" value={fieldOrUnknown(document.netCost)} onChange={(value) => setNumber("netCost", value)} />
        <EditInput label="MwSt" value={fieldOrUnknown(document.vatCost)} onChange={(value) => setNumber("vatCost", value)} />
        <EditInput label="Brutto" value={fieldOrUnknown(document.totalCost)} onChange={(value) => setNumber("totalCost", value)} />
        <EditInput label="Datenqualitaet" value={fieldOrUnknown(document.dataQuality)} onChange={(value) => setText("dataQuality", value)} />
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

function MeasureDebugBlock({ document }: { document: ObjectAnalysis }) {
  const debug = document.measureDebug;
  const details = document.measureDetails ?? [];
  if (!debug && details.length === 0) return null;

  return (
    <div className="debugBlock">
      <h4>Massnahmen-Erkennung</h4>
      <div className="measureDebugGrid">
        <div>
          <strong>Abschnittsueberschriften</strong>
          <ul>
            {debug?.headings.length ? debug.headings.map((entry) => (
              <li key={`heading-${entry.section}`}>{entry.section}. {entry.heading}</li>
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
              <li key={`mapping-${entry.section}`}>{entry.heading} - {entry.cluster} - {formatNullableCurrency(entry.value)}</li>
            )) : <li>k.A.</li>}
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
        ["longitude", "Longitude"]
      ] as Array<[keyof ObjectRecord, string]>).map(([field, label]) => (
        <EditInput key={field} label={label} value={String(object[field] ?? "")} onChange={(value) => onChange(field, value)} />
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
        ["livingAreaSqm", "Wohnflaeche"],
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
      <EditInput label="Wohnflaeche m2" value={project.livingAreaSqm} onChange={(value) => onChange("livingAreaSqm", value)} />
    </div>
  );
}

function EditInput({ label, value, onChange, readOnly }: { label: string; value: string; onChange: (value: string) => void; readOnly?: boolean }) {
  return (
    <label className="filterInput">
      <span>{label}</span>
      <input
        value={value === "k.A." ? "" : value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="k.A."
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
    assetManager: "",
    portfolioManager: "",
    latitude: "",
    longitude: ""
  };
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
    status: "Pruefung",
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
  return {
    ...base,
    objects: documents,
    clusterSummary: documents.flatMap((document) => document.clusters),
    totalCost: aggregateNumberField(documents.map((document) => document.totalCost)),
    averageCostPerApartment: aggregateAverageField(
      documents.map((document) => document.totalCost),
      documents.map((document) => document.renovatedApartmentCount)
    ),
    averageCostPerSqm: aggregateAverageField(
      documents.map((document) => document.totalCost),
      documents.map((document) => document.livingAreaSqm)
    ),
    reviewRequiredCount: countReviewCases(documents),
    issues: base.issues ?? []
  };
}

function mergeDocumentsPreferManual(existing: ObjectAnalysis[], incoming: ObjectAnalysis[]): ObjectAnalysis[] {
  const byKey = new Map<string, ObjectAnalysis>();
  existing.forEach((document) => byKey.set(documentIdentity(document), document));
  const merged = [...existing];

  incoming.forEach((document) => {
    const match = byKey.get(documentIdentity(document));
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

function documentIdentity(document: ObjectAnalysis): string {
  const fileName = sourceLabel(document.totalCost).split(" - ")[0];
  const identity = [
    fieldOrUnknown(document.documentNumber),
    fieldOrUnknown(document.provider),
    fieldOrUnknown(document.objectNumber),
    fileName
  ].filter((part) => part && part !== "k.A.").join("|").toLowerCase();
  return identity || document.id;
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
    object: `${String(unwrap(document.objectNumber) ?? "")} ${String(unwrap(document.objectAddress) ?? "")}`,
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
    return haystacks[key as keyof Filters].toLowerCase().includes(value.trim().toLowerCase());
  });
}

function calculateProjectCosts(project: ProjectRecord, documents: ObjectAnalysis[]): ProjectCostSummary {
  const offers = documents.filter((document) => /angebot/i.test(fieldOrUnknown(document.documentType)));
  const invoices = documents.filter((document) => /rechnung/i.test(fieldOrUnknown(document.documentType)) && !/schluss/i.test(fieldOrUnknown(document.documentType)));
  const supplements = documents.filter((document) => /nachtrag/i.test(fieldOrUnknown(document.documentType)));
  const finalInvoices = documents.filter((document) => /schlussrechnung|schluss/i.test(fieldOrUnknown(document.documentType)));
  const offersNet = sumValues(offers.map((document) => document.netCost.value));
  const offersGross = sumValues(offers.map((document) => document.totalCost.value));
  const invoicesNet = sumValues(invoices.map((document) => document.netCost.value));
  const invoicesGross = sumValues(invoices.map((document) => document.totalCost.value));
  const supplementsNet = sumValues(supplements.map((document) => document.netCost.value));
  const supplementsGross = sumValues(supplements.map((document) => document.totalCost.value));
  const finalInvoicesNet = sumValues(finalInvoices.map((document) => document.netCost.value));
  const finalInvoicesGross = sumValues(finalInvoices.map((document) => document.totalCost.value));
  const actualGross = firstNumber(finalInvoicesGross, invoicesGross, sumValues(documents.map((document) => document.totalCost.value)));
  const actualNet = firstNumber(finalInvoicesNet, invoicesNet, sumValues(documents.map((document) => document.netCost.value)));
  const renovatedApartments = parseGermanNumber(project.renovatedApartmentCount) ?? sumValues(documents.map((document) => document.renovatedApartmentCount.value));
  const livingArea = parseGermanNumber(project.livingAreaSqm) ?? sumValues(documents.map((document) => document.livingAreaSqm.value));
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
    invoicesNet,
    invoicesGross,
    supplementsNet,
    supplementsGross,
    finalInvoicesNet,
    finalInvoicesGross,
    offerToInvoiceDelta: offersGross !== null && actualGross !== null ? actualGross - offersGross : null,
    budgetToActualDelta: budgetDelta,
    costPerApartment: actualGross !== null && renovatedApartments ? actualGross / renovatedApartments : null,
    costPerSqm: actualGross !== null && livingArea ? actualGross / livingArea : null
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
      return overviewRowFromDocuments({
        id: `project-${project.id}`,
        level: "Projekt",
        documents: projectDocuments,
        project,
        projects,
        assignments,
        manualRenovatedCount: parseGermanNumber(project.renovatedApartmentCount),
        manualLivingArea: parseGermanNumber(project.livingAreaSqm)
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
        manualLivingArea: parseGermanNumber(entrance.livingAreaSqm)
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
      manualLivingArea: parseGermanNumber(object.totalLivingAreaSqm)
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
  const livingArea = firstNumber(manualLivingArea, sumValues(documents.map((document) => document.livingAreaSqm.value)));
  const apartments = collectApartments(documents, rowProject);

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
    description: collectDescriptions(documents, rowProject),
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

function collectClusters(documents: ObjectAnalysis[]): string {
  const values = new Set<string>();
  documents.forEach((document) => {
    document.clusters.forEach((cluster) => {
      if (cluster.cluster.value) values.add(cluster.cluster.value);
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
  if (Array.from(values).some((value) => /pruefung|manuell|unsicher|k\.a\./i.test(value))) return "Prueffall";
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
  return (
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

function groupByCluster(documents: ObjectAnalysis[]) {
  const groups = new Map<string, { count: number; total: number | null }>();
  documents.forEach((document) => {
    const clusters = document.clusters.length ? document.clusters : [{ cluster: manualField("k.A."), totalCost: document.totalCost }];
    clusters.forEach((cluster) => {
      const name = fieldOrUnknown(cluster.cluster as ExtractedField<string>);
      const current = groups.get(name) ?? { count: 0, total: null };
      groups.set(name, {
        count: current.count + 1,
        total: sumValues([current.total, cluster.totalCost.value])
      });
    });
  });
  return Array.from(groups.entries()).map(([cluster, values]) => ({ cluster, ...values }));
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

function costPerRenovatedUnit(documents: ObjectAnalysis[], grossCost: number | null): number | null {
  const renovated = sumValues(documents.map((document) => document.renovatedApartmentCount.value));
  return grossCost !== null && renovated ? roundMoney(grossCost / renovated) : null;
}

function costPerSqmForDocuments(documents: ObjectAnalysis[], grossCost: number | null): number | null {
  const area = sumValues(documents.map((document) => document.livingAreaSqm.value));
  return grossCost !== null && area ? roundMoney(grossCost / area) : null;
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
          cluster: detail.cluster,
          description: detail.beschreibung || "k.A.",
          netCost: null,
          vatCost: null,
          grossCost: detail.summe,
          source,
          status: fieldOrUnknown(document.dataQuality),
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
      const cluster = fieldOrUnknown(measure.cluster);
      const detail = document.measureDetails?.find((entry) => entry.cluster === measure.cluster.value || entry.abschnitt === measure.description.value);
      const source = measure.totalCost.sources[0]?.textSnippet
        ?? detail?.quelle
        ?? sourceLabel(measure.totalCost);
      return {
        id: `${document.id}-${measure.id || index}`,
        documentId: document.id,
        measureId: measure.id,
        cluster,
        description: fieldOrUnknown(measure.description),
        netCost: null,
        vatCost: null,
        grossCost: measure.totalCost.value,
        source,
        status: fieldOrUnknown(document.dataQuality),
        section: detail?.abschnitt ?? fieldOrUnknown(measure.description),
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
  if (!value.trim()) return null;
  const parsed = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function firstNumber(...values: Array<number | null>): number | null {
  return values.find((value): value is number => typeof value === "number") ?? null;
}

function emptyIfUnknown(value: string): string {
  return value === "k.A." ? "" : value;
}

function firstKnown(...values: string[]): string {
  return values.find((value) => value && value !== "k.A.") ?? "";
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
  const clusters = Array.from(new Set(document.clusters.map((cluster) => cluster.cluster.value).filter(Boolean)));
  return clusters.length === 0 ? "k.A." : clusters.join(", ");
}

function formatKiStatus(document: ObjectAnalysis): string {
  const quality = fieldOrUnknown(document.dataQuality);
  const score = document.confidenceScore.value;
  if (score === null) return quality;
  return `${quality} (${Math.round(score)} %)`;
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
    /pruefung|unsicher|k\.a\.|manuelle/i.test(String(document.dataQuality.value ?? "")) ||
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
