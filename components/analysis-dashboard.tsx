"use client";

import { useMemo, useState } from "react";
import { UploadPanel } from "./upload-panel";
import { emptyAnalysisState, emptyField } from "../lib/analysis-state";
import { fieldOrUnknown, formatCurrency, formatNumber, formatSqm, sourceLabel, unwrap } from "../lib/format";
import type { CostAllocation, ExtractedField, MeasureCluster, ObjectAnalysis, PortfolioAnalysisState } from "../types/analysis";

type ViewKey = "dashboard" | "objects" | "projects" | "unassigned" | "reports" | "settings";
type ProjectTab = "overview" | "documents" | "costs" | "measures" | "ai";
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

interface ObjectRecord {
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
}

interface ProjectRecord {
  id: string;
  projectName: string;
  projectType: string;
  fund: string;
  objectId: string;
  object: string;
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

export function AnalysisDashboard() {
  const [analysis, setAnalysis] = useState<PortfolioAnalysisState>(emptyAnalysisState);
  const [view, setView] = useState<ViewKey>("dashboard");
  const [objects, setObjects] = useState<ObjectRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string | null>>({});
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [projectTab, setProjectTab] = useState<ProjectTab>("overview");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [previews, setPreviews] = useState<ParsedPreview[]>([]);
  const [filters, setFilters] = useState<Filters>(emptyFilters);

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

      setAnalysis(data.analysis);
      setSelectedDocumentId(data.analysis.objects[0]?.id ?? null);
      setAssignments((current) => autoAssignDocuments(data.analysis.objects, projects, current));
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
    const object = objectFromDocument(seed);
    setObjects((current) => [...current, object]);
    setSelectedObjectId(object.id);
    setView("objects");
  }

  function updateObject(objectId: string, field: keyof ObjectRecord, value: string) {
    setObjects((current) => current.map((object) => object.id === objectId ? { ...object, [field]: value } : object));
  }

  function deleteObject(objectId: string) {
    setObjects((current) => current.filter((object) => object.id !== objectId));
    setProjects((current) => current.map((project) => project.objectId === objectId ? { ...project, objectId: "", object: "" } : project));
    setSelectedObjectId(null);
  }

  function createProject(seed?: ObjectAnalysis) {
    const project = projectFromDocument(seed, objects);
    setProjects((current) => [...current, project]);
    setSelectedProjectId(project.id);
    setProjectTab("overview");
    if (seed) {
      setAssignments((current) => ({ ...current, [seed.id]: project.id }));
      setSelectedDocumentId(seed.id);
    }
    setView("projects");
  }

  function deleteProject(projectId: string) {
    setProjects((current) => current.filter((project) => project.id !== projectId));
    setAssignments((current) => {
      const next = { ...current };
      Object.keys(next).forEach((documentId) => {
        if (next[documentId] === projectId) next[documentId] = null;
      });
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
          return { ...project, objectId: value, object: object ? objectLabel(object) : "" };
        }
        return { ...project, [field]: value };
      })
    );
  }

  function updateDocument(documentId: string, updater: (document: ObjectAnalysis) => ObjectAnalysis) {
    setAnalysis((current) => ({
      ...current,
      objects: current.objects.map((document) => document.id === documentId ? updater(document) : document)
    }));
  }

  function deleteDocument(documentId: string) {
    setAnalysis((current) => ({
      ...current,
      objects: current.objects.filter((document) => document.id !== documentId)
    }));
    setAssignments((current) => {
      const next = { ...current };
      delete next[documentId];
      return next;
    });
    setSelectedDocumentId(null);
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
          <strong>Objekt - Projekt - Dokumente - Kosten</strong>
          <p>Keine einzelne Wohnungsverwaltung in diesem Schritt.</p>
        </div>
      </aside>

      <section className="content appWorkspace">
        <header className="pageHeader">
          <div>
            <p className="eyebrow">KI als Hauptarbeit</p>
            <h1>PARIBUS | Baukosten Analyse</h1>
            <p className="muted">Dokument hochladen, KI auslesen lassen, Projekt zuordnen und falsche Werte manuell korrigieren.</p>
          </div>
          <div className="headerActions">
            <button className="buttonPrimary" type="button" onClick={() => setView("dashboard")}>Upload</button>
            <button type="button" onClick={() => exportFile("excel")}>Export Excel</button>
            <button type="button" onClick={() => exportFile("pdf")}>Export PDF</button>
          </div>
        </header>

        {view === "dashboard" ? (
          <DashboardView
            kpis={kpis}
            documents={filteredDocuments}
            selectedDocument={selectedDocument}
            filters={filters}
            setFilters={setFilters}
            previews={previews}
            isAnalyzing={isAnalyzing}
            message={message}
            onAnalyze={handleAnalyze}
            onPreview={handlePreview}
            onSelectDocument={setSelectedDocumentId}
            onOpenProjects={() => setView("projects")}
            onOpenObjects={() => setView("objects")}
          />
        ) : (
          <section className="workspaceGrid">
            <div className="workspaceMain">
              {view === "objects" ? (
              <ObjectsView
                objects={objects}
                documents={filteredDocuments}
                selectedObject={selectedObject}
                onCreate={() => createObject()}
                onCreateFromDocument={createObject}
                onDelete={deleteObject}
                onSelectObject={setSelectedObjectId}
                onUpdateObject={updateObject}
                onSelectDocument={setSelectedDocumentId}
              />
              ) : null}

              {view === "projects" ? (
              <ProjectsView
                projects={projects}
                objects={objects}
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
                onAssign={(documentId, projectId) => setAssignments((current) => ({ ...current, [documentId]: projectId }))}
                onRemoveDocument={(documentId) => setAssignments((current) => ({ ...current, [documentId]: null }))}
                onDeleteDocument={deleteDocument}
              />
              ) : null}

              {view === "unassigned" ? (
              <UnassignedView
                documents={unassignedDocuments}
                projects={projects}
                onSelect={setSelectedDocumentId}
                onAssign={(documentId, projectId) => setAssignments((current) => ({ ...current, [documentId]: projectId }))}
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
              onAssign={(projectId) => selectedDocument && setAssignments((current) => ({ ...current, [selectedDocument.id]: projectId }))}
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
  documents,
  selectedDocument,
  filters,
  setFilters,
  previews,
  isAnalyzing,
  message,
  onAnalyze,
  onPreview,
  onSelectDocument,
  onOpenProjects,
  onOpenObjects
}: {
  kpis: KpiShape;
  documents: ObjectAnalysis[];
  selectedDocument: ObjectAnalysis | null;
  filters: Filters;
  setFilters: (value: Filters) => void;
  previews: ParsedPreview[];
  isAnalyzing: boolean;
  message: string | null;
  onAnalyze: (files: File[]) => Promise<void>;
  onPreview: (files: File[]) => Promise<void>;
  onSelectDocument: (id: string) => void;
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
        <PortfolioMap documents={documents} selectedDocument={selectedDocument} onSelectDocument={onSelectDocument} />
        <ObjectSideList documents={documents} selectedDocument={selectedDocument} onSelectDocument={onSelectDocument} />
      </section>

      <SelectedPortfolioDetail document={selectedDocument} />

      <section className="dashboardUtilityGrid">
        <UploadPanel isAnalyzing={isAnalyzing} message={message} onAnalyze={onAnalyze} onPreview={onPreview} />
        <PreviewPanel previews={previews} />
      </section>
    </section>
  );
}

function PortfolioMap({
  documents,
  selectedDocument,
  onSelectDocument
}: {
  documents: ObjectAnalysis[];
  selectedDocument: ObjectAnalysis | null;
  onSelectDocument: (id: string) => void;
}) {
  const groups = groupByObject(documents);
  return (
    <section className="portfolioMap panel">
      <div className="mapControls">
        <button type="button">+</button>
        <button type="button">-</button>
      </div>
      <div className="mapCompass">o</div>
      <div className="mapCanvas">
        {groups.length === 0 ? (
          <div className="mapEmpty">Nach Upload erscheinen erkannte Objekte auf der Karte.</div>
        ) : groups.map((group, index) => {
          const left = 14 + ((index * 17) % 70);
          const top = 18 + ((index * 23) % 58);
          const active = selectedDocument ? group.documents.some((document) => document.id === selectedDocument.id) : index === 0;
          return (
            <button
              key={group.key}
              className={active ? "mapMarker mapMarkerActive" : "mapMarker"}
              style={{ left: `${left}%`, top: `${top}%` }}
              type="button"
              onClick={() => onSelectDocument(group.documents[0].id)}
              title={group.address || group.objectNumber || "Objekt"}
            >
              {group.documents.length}
            </button>
          );
        })}
        {selectedDocument ? (
          <div className="mapTooltip">
            <strong>{fieldOrUnknown(selectedDocument.objectAddress)}</strong>
            <span>{formatClusters(selectedDocument)}</span>
            <span>{formatCurrency(selectedDocument.totalCost)} Gesamt</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ObjectSideList({
  documents,
  selectedDocument,
  onSelectDocument
}: {
  documents: ObjectAnalysis[];
  selectedDocument: ObjectAnalysis | null;
  onSelectDocument: (id: string) => void;
}) {
  const groups = groupByObject(documents).slice(0, 8);
  return (
    <section className="panel objectSidePanel">
      <div className="panelHeader">
        <div>
          <h2>Objekte</h2>
          <p>Erkannte Objektbereiche</p>
        </div>
      </div>
      <input className="sideSearch" placeholder="Suche Objekt..." readOnly />
      <div className="sideObjectRows">
        {groups.length === 0 ? <p className="muted">Noch keine Objekte erkannt.</p> : null}
        {groups.map((group) => {
          const active = selectedDocument ? group.documents.some((document) => document.id === selectedDocument.id) : false;
          return (
            <button
              key={group.key}
              className={active ? "sideObjectRow selectedRow" : "sideObjectRow"}
              type="button"
              onClick={() => onSelectDocument(group.documents[0].id)}
            >
              <span className="pinDot" />
              <span>{group.address || group.objectNumber || "k.A."}</span>
              <strong>{group.documents.length}</strong>
              <em>{formatNullableCurrency(sumValues(group.documents.map((document) => document.totalCost.value)))}</em>
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
  documents,
  selectedObject,
  onCreate,
  onCreateFromDocument,
  onDelete,
  onSelectObject,
  onUpdateObject,
  onSelectDocument
}: {
  objects: ObjectRecord[];
  documents: ObjectAnalysis[];
  selectedObject: ObjectRecord | null;
  onCreate: () => void;
  onCreateFromDocument: (document: ObjectAnalysis) => void;
  onDelete: (id: string) => void;
  onSelectObject: (id: string) => void;
  onUpdateObject: (id: string, field: keyof ObjectRecord, value: string) => void;
  onSelectDocument: (id: string) => void;
}) {
  const detectedGroups = groupByObject(documents);
  return (
    <section className="panel">
      <div className="panelHeader">
        <div>
          <h2>Objekte</h2>
          <p>Objekte koennen manuell angelegt und bearbeitet werden. Keine einzelne Wohnungsverwaltung.</p>
        </div>
        <button className="buttonPrimary" type="button" onClick={onCreate}>Objekt erstellen</button>
      </div>

      <div className="projectLayout">
        <div className="projectList">
          {objects.length === 0 ? <p className="muted">Noch keine manuell angelegten Objekte.</p> : null}
          {objects.map((object) => (
            <button
              key={object.id}
              className={selectedObject?.id === object.id ? "projectListItem selectedRow" : "projectListItem"}
              type="button"
              onClick={() => onSelectObject(object.id)}
            >
              <strong>{objectLabel(object) || "k.A."}</strong>
              <span>{object.fund || "k.A."}</span>
            </button>
          ))}
        </div>
        <div>
          {selectedObject ? (
            <>
              <ObjectForm object={selectedObject} onChange={(field, value) => onUpdateObject(selectedObject.id, field, value)} />
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

function ProjectsView({
  projects,
  objects,
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
    </aside>
  );
}

function ObjectForm({ object, onChange }: { object: ObjectRecord; onChange: (field: keyof ObjectRecord, value: string) => void }) {
  return (
    <div className="projectForm">
      {([
        ["fund", "Fonds"],
        ["objectNumber", "Objektnummer"],
        ["objectName", "Objektname"],
        ["address", "Adresse"],
        ["postalCode", "PLZ"],
        ["city", "Ort"],
        ["federalState", "Bundesland"],
        ["constructionYear", "Baujahr"],
        ["unitCount", "Anzahl Wohneinheiten"],
        ["totalLivingAreaSqm", "Gesamtwohnflaeche m2"],
        ["assetManager", "Asset Manager"],
        ["portfolioManager", "Portfolio Manager"]
      ] as Array<[keyof ObjectRecord, string]>).map(([field, label]) => (
        <EditInput key={field} label={label} value={object[field]} onChange={(value) => onChange(field, value)} />
      ))}
    </div>
  );
}

function ProjectForm({
  project,
  objects,
  onChange
}: {
  project: ProjectRecord;
  objects: ObjectRecord[];
  onChange: (field: keyof ProjectRecord, value: string) => void;
}) {
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
    portfolioManager: ""
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
