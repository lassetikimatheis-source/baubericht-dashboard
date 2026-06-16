"use client";

import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { UploadPanel } from "./upload-panel";
import { ObjectTable } from "./object-table";
import { ObjectDetail } from "./object-detail";
import { emptyAnalysisState } from "../lib/analysis-state";
import { formatCurrency, formatNumber, unwrap } from "../lib/format";
import type { ObjectAnalysis, PortfolioAnalysisState } from "../types/analysis";

interface ParsedPreview {
  id: string;
  fileName: string;
  fileType: string;
  textLength: number;
  preview: string;
  issues: string[];
}

interface Filters {
  year: string;
  fund: string;
  object: string;
  address: string;
  documentType: string;
  cluster: string;
  dataQuality: string;
}

const emptyFilters: Filters = {
  year: "",
  fund: "",
  object: "",
  address: "",
  documentType: "",
  cluster: "",
  dataQuality: ""
};

export function AnalysisDashboard() {
  const [analysis, setAnalysis] = useState<PortfolioAnalysisState>(emptyAnalysisState);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [previews, setPreviews] = useState<ParsedPreview[]>([]);
  const [filters, setFilters] = useState<Filters>(emptyFilters);

  const filteredObjects = useMemo(() => {
    return analysis.objects.filter((object) => matchesFilters(object, filters));
  }, [analysis.objects, filters]);

  const selectedObject = useMemo(() => {
    return filteredObjects.find((object) => object.id === selectedObjectId) ?? filteredObjects[0] ?? null;
  }, [filteredObjects, selectedObjectId]);

  const kpis = useMemo(() => {
    const gross = sumValues(filteredObjects.map((object) => object.totalCost.value));
    const net = sumValues(filteredObjects.map((object) => object.netCost.value));
    const renovatedApartments = sumValues(filteredObjects.map((object) => object.renovatedApartmentCount.value));
    const renovatedArea = sumValues(filteredObjects.map((object) => object.renovatedAreaSqm.value));
    const unknownFields = countUnknownFields(filteredObjects);
    const reviewCases = filteredObjects.filter((object) =>
      /pruefung|prüfung|k\.a\.|unsicher/i.test(String(object.dataQuality.value ?? ""))
    ).length;

    return {
      gross,
      net,
      objects: new Set(filteredObjects.map((object) => object.objectNumber.value || object.objectAddress.value || object.id)).size,
      documents: analysis.sourceDocuments.length,
      renovatedApartments,
      costPerApartment: gross !== null && renovatedApartments ? gross / renovatedApartments : null,
      costPerSqm: gross !== null && renovatedArea ? gross / renovatedArea : null,
      reviewCount: unknownFields + reviewCases
    };
  }, [analysis.sourceDocuments.length, filteredObjects]);

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
      setSelectedObjectId(data.analysis.objects[0]?.id ?? null);
      setMessage("Analyse abgeschlossen.");
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
          <a href="#dashboard">Dashboard</a>
          <a href="#upload">Upload</a>
          <a href="#objects">Objekte</a>
          <a href="#details">Detailansicht</a>
          <a href="#exports">Export</a>
        </nav>
        <div className="sideNote">
          <span>Datenbasis</span>
          <strong>Dokumente</strong>
          <p>Keine Fantasiewerte. Nicht erkannte Werte bleiben k.A.</p>
        </div>
      </aside>

      <section className="content">
        <header className="pageHeader" id="dashboard">
          <div>
            <p className="eyebrow">PARIBUS | Baukosten Analyse</p>
            <h1>Objekt-Dashboard</h1>
            <p className="muted">Dokumentenbasierte Kostenanalyse fuer internes Fondsmanagement.</p>
          </div>
          <div className="headerActions">
            <a className="button buttonPrimary" href="#upload">Upload</a>
            <button type="button" onClick={() => exportFile("excel")}>Export Excel</button>
            <button type="button" onClick={() => exportFile("pdf")}>Export PDF</button>
          </div>
        </header>

        <section className="kpiGrid" aria-label="Kennzahlen">
          <Kpi label="Gesamtkosten brutto" value={formatNullableCurrency(kpis.gross)} accent />
          <Kpi label="Gesamtkosten netto" value={formatNullableCurrency(kpis.net)} />
          <Kpi label="Anzahl Objekte" value={formatNumber(kpis.objects)} />
          <Kpi label="Anzahl Dokumente" value={formatNumber(kpis.documents)} />
          <Kpi label="Sanierte Wohnungen" value={formatNullableNumber(kpis.renovatedApartments)} />
          <Kpi label="Ø Kosten pro Wohnung" value={formatNullableCurrency(kpis.costPerApartment)} />
          <Kpi label="Ø Kosten pro qm" value={formatNullableCurrency(kpis.costPerSqm)} />
          <Kpi label="k.A.-Felder / Prüffälle" value={formatNumber(kpis.reviewCount)} warning />
        </section>

        <section className="filterBar" aria-label="Filter">
          <FilterInput label="Jahr" value={filters.year} onChange={(value) => setFilter("year", value, setFilters)} />
          <FilterInput label="Fonds" value={filters.fund} onChange={(value) => setFilter("fund", value, setFilters)} />
          <FilterInput label="Objekt" value={filters.object} onChange={(value) => setFilter("object", value, setFilters)} />
          <FilterInput label="Adresse" value={filters.address} onChange={(value) => setFilter("address", value, setFilters)} />
          <FilterInput label="Dokumenttyp" value={filters.documentType} onChange={(value) => setFilter("documentType", value, setFilters)} />
          <FilterInput label="Maßnahmencluster" value={filters.cluster} onChange={(value) => setFilter("cluster", value, setFilters)} />
          <FilterInput label="Datenqualität" value={filters.dataQuality} onChange={(value) => setFilter("dataQuality", value, setFilters)} />
          <button type="button" onClick={() => setFilters(emptyFilters)}>Filter zurücksetzen</button>
        </section>

        <UploadPanel
          isAnalyzing={isAnalyzing}
          message={message}
          onAnalyze={handleAnalyze}
          onPreview={handlePreview}
        />

        {previews.length > 0 ? (
          <section className="panel">
            <div className="panelHeader">
              <div>
                <h2>Textvorschau aus Dokumenten</h2>
                <p>Pruefe hier zuerst, ob Adresse, Leistungsbereich und Summen korrekt gelesen wurden.</p>
              </div>
            </div>
            <div className="previewList">
              {previews.map((preview) => (
                <article key={preview.id} className="previewItem">
                  <div className="previewHeader">
                    <strong>{preview.fileName}</strong>
                    <span className="status statusNeutral">{preview.textLength} Zeichen</span>
                  </div>
                  {preview.issues.length > 0 ? (
                    <div className="issueList">
                      {preview.issues.map((issue) => <p key={issue}>{issue}</p>)}
                    </div>
                  ) : null}
                  <pre>{preview.preview || "k.A."}</pre>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <ObjectTable
          objects={filteredObjects}
          selectedObjectId={selectedObject?.id ?? null}
          onSelectObject={setSelectedObjectId}
        />

        <ObjectDetail object={selectedObject} />

        <section className="panel" id="exports">
          <div className="panelHeader">
            <div>
              <h2>Export</h2>
              <p>Exportiert den aktuellen Analysezustand inklusive Quellenangaben.</p>
            </div>
            <div className="headerActions">
              <button type="button" onClick={() => exportFile("excel")}>Als Excel herunterladen</button>
              <button type="button" onClick={() => exportFile("pdf")}>Als PDF herunterladen</button>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

function matchesFilters(object: ObjectAnalysis, filters: Filters): boolean {
  const haystacks = {
    year: String(unwrap(object.year) ?? ""),
    fund: String(unwrap(object.fund) ?? ""),
    object: String(unwrap(object.objectNumber) ?? ""),
    address: String(unwrap(object.objectAddress) ?? ""),
    documentType: String(unwrap(object.documentType) ?? ""),
    cluster: object.clusters.map((cluster) => unwrap(cluster.cluster) ?? "").join(" "),
    dataQuality: String(unwrap(object.dataQuality) ?? "")
  };

  return Object.entries(filters).every(([key, value]) => {
    if (!value.trim()) return true;
    return haystacks[key as keyof Filters].toLowerCase().includes(value.trim().toLowerCase());
  });
}

function setFilter(
  key: keyof Filters,
  value: string,
  setFilters: Dispatch<SetStateAction<Filters>>
) {
  setFilters((current) => ({ ...current, [key]: value }));
}

function sumValues(values: Array<number | null>): number | null {
  const numericValues = values.filter((value): value is number => typeof value === "number");
  if (numericValues.length === 0) return null;
  return numericValues.reduce((sum, value) => sum + value, 0);
}

function countUnknownFields(objects: ObjectAnalysis[]): number {
  return objects.reduce((count, object) => {
    const fields = [
      object.year,
      object.fund,
      object.objectNumber,
      object.objectAddress,
      object.apartmentNumber,
      object.documentType,
      object.provider,
      object.documentDate,
      object.documentNumber,
      object.netCost,
      object.vatCost,
      object.totalCost,
      object.costPerApartment,
      object.costPerSqm,
      object.dataQuality
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

function Kpi({ label, value, accent, warning }: { label: string; value: string; accent?: boolean; warning?: boolean }) {
  return (
    <article className={`kpi${accent ? " kpiAccent" : ""}${warning ? " kpiWarning" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function FilterInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="filterInput">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="Alle" />
    </label>
  );
}
