"use client";

import { useMemo, useState } from "react";
import { UploadPanel } from "./upload-panel";
import { emptyAnalysisState, emptyField } from "../lib/analysis-state";
import { fieldOrUnknown, formatCurrency, formatNumber, formatSqm, sourceLabel, unwrap } from "../lib/format";
import type { CostAllocation, ExtractedField, MeasureCluster, ObjectAnalysis, PortfolioAnalysisState } from "../types/analysis";

type ViewKey = "dashboard" | "objects" | "projects" | "unassigned" | "reports" | "settings";
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
  | "dataQuality";
type NumberFieldKey =
  | "year"
  | "renovatedApartmentCount"
  | "livingAreaSqm"
  | "netCost"
  | "vatCost"
  | "totalCost";

interface ParsedPreview {
  id: string;
  fileName: string;
  fileType: string;
  textLength: number;
  preview: string;
  issues: string[];
}

interface ProjectRecord {
  id: string;
  projectName: string;
  projectType: string;
  fund: string;
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
  address: string;
  documentType: string;
  cluster: string;
  dataQuality: string;
  apartmentNumber: string;
  location: string;
  livingAreaSqm: string;
}

interface KpiShape {
  gross: number | null;
  net: number | null;
  objects: number;
  projects: number;
  documents: number;
  unassigned: number;
  apartments: number | null;
  costPerApartment: number | null;
  costPerSqm: number | null;
  reviewCount: number;
}

const emptyFilters: Filters = {
  year: "",
  fund: "",
  object: "",
  address: "",
  documentType: "",
  cluster: "",
  dataQuality: "",
  apartmentNumber: "",
  location: "",
  livingAreaSqm: ""
};

const navItems: Array<{ key: ViewKey; label: string }> = [
  { key: "dashboard", label: "Dashboard" },
  { key: "objects", label: "Objekte" },
  { key: "projects", label: "Projekte" },
  { key: "unassigned", label: "Unzugeordnete Dokumente" },
  { key: "reports", label: "Auswertungen" },
  { key: "settings", label: "Einstellungen" }
];

export function AnalysisDashboard() {
  const [analysis, setAnalysis] = useState<PortfolioAnalysisState>(emptyAnalysisState);
  const [view, setView] = useState<ViewKey>("dashboard");
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string | null>>({});
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [previews, setPreviews] = useState<ParsedPreview[]>([]);
  const [filters, setFilters] = useState<Filters>(emptyFilters);

  const filteredDocuments = useMemo(() => {
    return analysis.objects.filter((document) => matchesFilters(document, filters));
  }, [analysis.objects, filters]);

  const selectedDocument = useMemo(() => {
    return analysis.objects.find((document) => document.id === selectedDocumentId) ?? filteredDocuments[0] ?? null;
  }, [analysis.objects, filteredDocuments, selectedDocumentId]);

  const selectedProject = useMemo(() => {
    return projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? null;
  }, [projects, selectedProjectId]);

  const unassignedDocuments = filteredDocuments.filter((document) => !assignments[document.id]);
  const selectedProjectDocuments = selectedProject
    ? filteredDocuments.filter((document) => assignments[document.id] === selectedProject.id)
    : [];

  const kpis = useMemo<KpiShape>(() => {
    const gross = sumValues(filteredDocuments.map((document) => document.totalCost.value));
    const net = sumValues(filteredDocuments.map((document) => document.netCost.value));
    const apartments = sumValues(filteredDocuments.map((document) => document.renovatedApartmentCount.value));
    const area = sumValues(filteredDocuments.map((document) => document.livingAreaSqm.value));

    return {
      gross,
      net,
      objects: new Set(filteredDocuments.map((document) => document.objectNumber.value || document.objectAddress.value || document.id)).size,
      projects: projects.length,
      documents: filteredDocuments.length,
      unassigned: unassignedDocuments.length,
      apartments,
      costPerApartment: gross !== null && apartments ? gross / apartments : null,
      costPerSqm: gross !== null && area ? gross / area : null,
      reviewCount: countUnknownFields(filteredDocuments)
    };
  }, [filteredDocuments, projects.length, unassignedDocuments.length]);

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
      setMessage("Analyse abgeschlossen. KI-Daten koennen rechts korrigiert werden.");
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

  function createProject(seed?: ObjectAnalysis) {
    const project = projectFromDocument(seed);
    setProjects((current) => [...current, project]);
    setSelectedProjectId(project.id);
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
      current.map((project) => project.id === projectId ? { ...project, [field]: value } : project)
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
          <strong>Objekt → Projekt → Dokumente → Kosten</strong>
          <p>Wohnungen bleiben Felder im Dokument oder Projekt.</p>
        </div>
      </aside>

      <section className="content appWorkspace">
        <header className="pageHeader">
          <div>
            <p className="eyebrow">KI als Hauptarbeit</p>
            <h1>PARIBUS | Baukosten Analyse</h1>
            <p className="muted">Dokument hochladen, KI auslesen lassen, Projekt zuordnen und bei Bedarf manuell korrigieren.</p>
          </div>
          <div className="headerActions">
            <button className="buttonPrimary" type="button" onClick={() => setView("dashboard")}>Upload</button>
            <button type="button" onClick={() => exportFile("excel")}>Export Excel</button>
            <button type="button" onClick={() => exportFile("pdf")}>Export PDF</button>
          </div>
        </header>

        <section className="workspaceGrid">
          <div className="workspaceMain">
            {view === "dashboard" ? (
              <>
                <KpiGrid kpis={kpis} />
                <FilterBar filters={filters} setFilters={setFilters} />
                <UploadPanel isAnalyzing={isAnalyzing} message={message} onAnalyze={handleAnalyze} onPreview={handlePreview} />
                <PreviewPanel previews={previews} />
                <DocumentTable
                  documents={filteredDocuments}
                  projects={projects}
                  assignments={assignments}
                  selectedDocumentId={selectedDocument?.id ?? null}
                  onSelect={setSelectedDocumentId}
                  onAssign={(documentId, projectId) => setAssignments((current) => ({ ...current, [documentId]: projectId }))}
                  onDelete={deleteDocument}
                />
              </>
            ) : null}

            {view === "objects" ? (
              <ObjectsView documents={filteredDocuments} onSelect={setSelectedDocumentId} />
            ) : null}

            {view === "projects" ? (
              <ProjectsView
                projects={projects}
                selectedProject={selectedProject}
                documents={selectedProjectDocuments}
                onCreate={() => createProject()}
                onDelete={deleteProject}
                onSelectProject={setSelectedProjectId}
                onUpdateProject={updateProject}
                onSelectDocument={setSelectedDocumentId}
                onRemoveDocument={(documentId) => setAssignments((current) => ({ ...current, [documentId]: null }))}
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
              <ReportsView documents={filteredDocuments} projects={projects} />
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
      </section>
    </main>
  );
}

function KpiGrid({ kpis }: { kpis: KpiShape }) {
  return (
    <section className="kpiGrid" aria-label="Kennzahlen">
      <Kpi label="Gesamtkosten brutto" value={formatNullableCurrency(kpis.gross)} accent />
      <Kpi label="Gesamtkosten netto" value={formatNullableCurrency(kpis.net)} />
      <Kpi label="Objekte" value={formatNumber(kpis.objects)} />
      <Kpi label="Projekte" value={formatNumber(kpis.projects)} />
      <Kpi label="Dokumente" value={formatNumber(kpis.documents)} />
      <Kpi label="Unzugeordnet" value={formatNumber(kpis.unassigned)} warning />
      <Kpi label="Sanierte Wohnungen" value={formatNullableNumber(kpis.apartments)} />
      <Kpi label="Kosten pro qm" value={formatNullableCurrency(kpis.costPerSqm)} />
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
        ["address", "Adresse"],
        ["documentType", "Dokumenttyp"],
        ["cluster", "Maßnahmencluster"],
        ["dataQuality", "Datenqualität"],
        ["apartmentNumber", "Wohnungsnummer"],
        ["location", "Lage"],
        ["livingAreaSqm", "Wohnfläche m²"]
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
      <button type="button" onClick={() => setFilters(emptyFilters)}>Filter zurücksetzen</button>
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
  onDelete
}: {
  documents: ObjectAnalysis[];
  projects: ProjectRecord[];
  assignments: Record<string, string | null>;
  selectedDocumentId: string | null;
  onSelect: (id: string) => void;
  onAssign: (documentId: string, projectId: string | null) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="panel panelFlush">
      <div className="panelHeader tableHeader">
        <div>
          <h2>Dokumente & Kosten</h2>
          <p>Wohnungsdaten sind nur Dokumentfelder und keine eigene Verwaltungsebene.</p>
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
              <th>Wohnfläche</th>
              <th>Cluster</th>
              <th>Netto</th>
              <th>MwSt</th>
              <th>Brutto</th>
              <th>Datenqualität</th>
              <th>Aktion</th>
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
                    {projects.map((project) => <option key={project.id} value={project.id}>{project.projectName}</option>)}
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
                <td>{fieldOrUnknown(document.dataQuality)}</td>
                <td>
                  <button type="button" onClick={(event) => { event.stopPropagation(); onDelete(document.id); }}>Löschen</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ObjectsView({ documents, onSelect }: { documents: ObjectAnalysis[]; onSelect: (id: string) => void }) {
  const objectGroups = groupByObject(documents);
  return (
    <section className="panel">
      <div className="panelHeader">
        <div>
          <h2>Objekte</h2>
          <p>Objekte bündeln Projekte und Dokumente anhand Objektnummer oder Adresse.</p>
        </div>
      </div>
      <div className="objectGrid">
        {objectGroups.map((group) => (
          <article className="objectCard" key={group.key}>
            <span>{group.documents.length} Dokument(e)</span>
            <strong>{group.objectNumber || "k.A."}</strong>
            <p>{group.address || "k.A."}</p>
            <div className="costLine costLineStrong">
              <span>Brutto</span>
              <strong>{formatNullableCurrency(sumValues(group.documents.map((document) => document.totalCost.value)))}</strong>
            </div>
            <button type="button" onClick={() => onSelect(group.documents[0].id)}>Erstes Dokument öffnen</button>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProjectsView({
  projects,
  selectedProject,
  documents,
  onCreate,
  onDelete,
  onSelectProject,
  onUpdateProject,
  onSelectDocument,
  onRemoveDocument
}: {
  projects: ProjectRecord[];
  selectedProject: ProjectRecord | null;
  documents: ObjectAnalysis[];
  onCreate: () => void;
  onDelete: (id: string) => void;
  onSelectProject: (id: string) => void;
  onUpdateProject: (id: string, field: keyof ProjectRecord, value: string) => void;
  onSelectDocument: (id: string) => void;
  onRemoveDocument: (id: string) => void;
}) {
  return (
    <section className="panel">
      <div className="panelHeader">
        <div>
          <h2>Projekte</h2>
          <p>Projekte erstellen, bearbeiten, löschen und Dokumente zuordnen.</p>
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
              <ProjectForm project={selectedProject} onChange={(field, value) => onUpdateProject(selectedProject.id, field, value)} />
              <div className="headerActions projectActions">
                <button type="button" onClick={() => onDelete(selectedProject.id)}>Projekt löschen</button>
              </div>
              <h3>Dokumente zu Projekt</h3>
              <MiniDocumentList documents={documents} onSelect={onSelectDocument} actionLabel="Entfernen" onAction={onRemoveDocument} />
            </>
          ) : (
            <div className="emptyState"><p>Kein Projekt ausgewählt.</p></div>
          )}
        </div>
      </div>
    </section>
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
          <p>Hier landen Dokumente ohne sichere Projektzuordnung.</p>
        </div>
      </div>
      <div className="unassignedList">
        {documents.length === 0 ? <div className="emptyState"><p>Keine unzugeordneten Dokumente.</p></div> : null}
        {documents.map((document) => (
          <article className="unassignedCard" key={document.id}>
            <div>
              <strong>{fieldOrUnknown(document.documentType)} - {fieldOrUnknown(document.documentNumber)}</strong>
              <p>{fieldOrUnknown(document.objectAddress)} · {formatCurrency(document.totalCost)}</p>
              <small>KI-Vorschlag: {fieldOrUnknown(document.objectNumber)} / {fieldOrUnknown(document.projectType)}</small>
            </div>
            <div className="headerActions">
              <button type="button" onClick={() => onSelect(document.id)}>Ansehen</button>
              <select onChange={(event) => onAssign(document.id, event.target.value || null)} defaultValue="">
                <option value="">Projekt auswählen</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.projectName}</option>)}
              </select>
              <button type="button" onClick={() => onCreateProject(document)}>Neues Projekt aus Dokument</button>
              <button type="button" onClick={() => onDelete(document.id)}>Löschen</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ReportsView({ documents, projects }: { documents: ObjectAnalysis[]; projects: ProjectRecord[] }) {
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
        <ReportCard label="Brutto" value={formatNullableCurrency(sumValues(documents.map((document) => document.totalCost.value)))} />
        <ReportCard label="Netto" value={formatNullableCurrency(sumValues(documents.map((document) => document.netCost.value)))} />
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
        <div className="metric"><span>KI-Modus</span><strong>Dokumentbasierte Extraktion</strong><small>Keine Fantasiewerte, k.A. bei fehlenden Angaben.</small></div>
        <div className="metric"><span>Zuordnung</span><strong>Projekt oder Unzugeordnet</strong><small>Automatisch nur bei sicherem Treffer.</small></div>
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
          {projects.map((project) => <option key={project.id} value={project.id}>{project.projectName}</option>)}
        </select>
      </label>

      <div className="editorActions">
        <button type="button" onClick={onCreateProject}>Neues Projekt aus Dokument</button>
        <button type="button">KI erneut starten</button>
        <button type="button" onClick={onDelete}>Dokument löschen</button>
      </div>

      <div className="editForm">
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
        <EditInput label="Wohnfläche m²" value={fieldOrUnknown(document.livingAreaSqm)} onChange={(value) => setNumber("livingAreaSqm", value)} />
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
    </aside>
  );
}

function ProjectForm({ project, onChange }: { project: ProjectRecord; onChange: (field: keyof ProjectRecord, value: string) => void }) {
  return (
    <div className="projectForm">
      {([
        ["projectName", "Projektname"],
        ["projectType", "Projektart"],
        ["fund", "Fonds"],
        ["object", "Objekt"],
        ["status", "Status"],
        ["budgetNet", "Budget netto"],
        ["budgetGross", "Budget brutto"],
        ["startDate", "Startdatum"],
        ["endDate", "Enddatum"],
        ["description", "Beschreibung"],
        ["apartmentNumber", "Wohnungsnummer"],
        ["location", "Lage"],
        ["renovatedApartmentCount", "Anzahl sanierte Wohnungen"],
        ["livingAreaSqm", "Wohnfläche m²"]
      ] as Array<[keyof ProjectRecord, string]>).map(([field, label]) => (
        <EditInput key={field} label={label} value={project[field]} onChange={(value) => onChange(field, value)} />
      ))}
    </div>
  );
}

function MiniDocumentList({
  documents,
  onSelect,
  actionLabel,
  onAction
}: {
  documents: ObjectAnalysis[];
  onSelect: (id: string) => void;
  actionLabel: string;
  onAction: (id: string) => void;
}) {
  if (documents.length === 0) return <p className="muted">Keine Dokumente zugeordnet.</p>;
  return (
    <div className="miniList">
      {documents.map((document) => (
        <div className="miniItem" key={document.id}>
          <button type="button" onClick={() => onSelect(document.id)}>
            <strong>{fieldOrUnknown(document.documentType)} - {fieldOrUnknown(document.documentNumber)}</strong>
            <span>{formatCurrency(document.totalCost)}</span>
          </button>
          <button type="button" onClick={() => onAction(document.id)}>{actionLabel}</button>
        </div>
      ))}
    </div>
  );
}

function EditInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="filterInput">
      <span>{label}</span>
      <input value={value === "k.A." ? "" : value} onChange={(event) => onChange(event.target.value)} placeholder="k.A." />
    </label>
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

function projectFromDocument(document?: ObjectAnalysis): ProjectRecord {
  const objectLabel = document ? firstKnown(fieldOrUnknown(document.objectNumber), fieldOrUnknown(document.objectAddress)) : "";
  const projectType = document ? emptyIfUnknown(fieldOrUnknown(document.projectType)) : "";
  return {
    id: `project-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    projectName: document ? `${projectType} ${objectLabel}`.trim() : "",
    projectType,
    fund: document ? emptyIfUnknown(fieldOrUnknown(document.fund)) : "",
    object: document ? objectLabel : "",
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
    const matches = projects.filter((project) => {
      const objectNumber = fieldOrUnknown(document.objectNumber);
      const address = fieldOrUnknown(document.objectAddress);
      return (
        (objectNumber !== "k.A." && project.object.toLowerCase().includes(objectNumber.toLowerCase())) ||
        (address !== "k.A." && project.object.toLowerCase().includes(address.toLowerCase()))
      );
    });
    next[document.id] = matches.length === 1 ? matches[0].id : null;
  });
  return next;
}

function matchesFilters(document: ObjectAnalysis, filters: Filters): boolean {
  const haystacks = {
    year: String(unwrap(document.year) ?? ""),
    fund: String(unwrap(document.fund) ?? ""),
    object: String(unwrap(document.objectNumber) ?? ""),
    address: String(unwrap(document.objectAddress) ?? ""),
    documentType: String(unwrap(document.documentType) ?? ""),
    cluster: document.clusters.map((cluster) => unwrap(cluster.cluster) ?? "").join(" "),
    dataQuality: String(unwrap(document.dataQuality) ?? ""),
    apartmentNumber: String(unwrap(document.apartmentNumber) ?? ""),
    location: String(unwrap(document.location) ?? ""),
    livingAreaSqm: String(unwrap(document.livingAreaSqm) ?? "")
  };

  return Object.entries(filters).every(([key, value]) => {
    if (!value.trim()) return true;
    return haystacks[key as keyof Filters].toLowerCase().includes(value.trim().toLowerCase());
  });
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

function emptyIfUnknown(value: string): string {
  return value === "k.A." ? "" : value;
}

function firstKnown(...values: string[]): string {
  return values.find((value) => value && value !== "k.A.") ?? "";
}

function manualNumberField(value: string): ExtractedField<number> {
  if (!value.trim()) return emptyField<number>();
  const parsed = Number(value.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(parsed)) return emptyField<number>();
  return {
    value: Math.round(parsed * 100) / 100,
    sources: [{ documentId: "manual", fileName: "Manuelle Korrektur", method: "Manuell", confidence: 1 }],
    confidence: 1
  };
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

function sumValues(values: Array<number | null>): number | null {
  const numericValues = values.filter((value): value is number => typeof value === "number");
  if (numericValues.length === 0) return null;
  return numericValues.reduce((sum, value) => sum + value, 0);
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
