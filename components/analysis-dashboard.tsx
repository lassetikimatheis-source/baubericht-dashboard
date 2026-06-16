"use client";

import { useMemo, useState } from "react";
import { UploadPanel } from "./upload-panel";
import { ObjectTable } from "./object-table";
import { ObjectDetail } from "./object-detail";
import { emptyAnalysisState } from "../lib/analysis-state";
import { formatCurrency, formatNumber, fieldOrUnknown } from "../lib/format";
import type { PortfolioAnalysisState } from "../types/analysis";

interface ParsedPreview {
  id: string;
  fileName: string;
  fileType: string;
  textLength: number;
  preview: string;
  issues: string[];
}

export function AnalysisDashboard() {
  const [analysis, setAnalysis] = useState<PortfolioAnalysisState>(emptyAnalysisState);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [previews, setPreviews] = useState<ParsedPreview[]>([]);

  const selectedObject = useMemo(() => {
    return analysis.objects.find((object) => object.id === selectedObjectId) ?? analysis.objects[0] ?? null;
  }, [analysis.objects, selectedObjectId]);

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
          <strong>Nur Dokumentwerte</strong>
          <p>Fehlende Werte werden als k.A. angezeigt.</p>
        </div>
      </aside>

      <section className="content">
        <header className="pageHeader" id="dashboard">
          <div>
            <p className="eyebrow">OCR · PDF · Excel · KI</p>
            <h1>PARIBUS Baukosten Analyse</h1>
            <p className="muted">
              Upload von Rechnungen, Angeboten und Excel-Dateien. Die Extraktion uebernimmt nur
              Werte, die aus den Dokumenten gelesen wurden.
            </p>
          </div>
          <div className="headerActions">
            <button type="button" onClick={() => exportFile("excel")}>Excel Export</button>
            <button type="button" onClick={() => exportFile("pdf")}>PDF Export</button>
          </div>
        </header>

        <section className="kpiGrid" aria-label="Kennzahlen">
          <article className="kpi">
            <span>Jahr</span>
            <strong>{fieldOrUnknown(analysis.year)}</strong>
          </article>
          <article className="kpi">
            <span>Fonds</span>
            <strong>{fieldOrUnknown(analysis.fund)}</strong>
          </article>
          <article className="kpi">
            <span>Objekte erkannt</span>
            <strong>{analysis.objects.length}</strong>
          </article>
          <article className="kpi">
            <span>Gesamtkosten</span>
            <strong>{formatCurrency(analysis.totalCost)}</strong>
          </article>
          <article className="kpi">
            <span>Kosten pro Wohnung</span>
            <strong>{formatCurrency(analysis.averageCostPerApartment)}</strong>
          </article>
          <article className="kpi">
            <span>Kosten pro qm</span>
            <strong>{formatCurrency(analysis.averageCostPerSqm)}</strong>
          </article>
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
                <p>Pruefe hier zuerst, ob Adresse, Elektroarbeiten und Preise korrekt gelesen wurden.</p>
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

        <section className="gridTwo">
          <ObjectTable
            objects={analysis.objects}
            selectedObjectId={selectedObject?.id ?? null}
            onSelectObject={setSelectedObjectId}
          />
          <section className="panel">
            <div className="panelHeader">
              <div>
                <h2>Analyse Status</h2>
                <p>Dokumente, Dubletten und offene Pruefpunkte.</p>
              </div>
            </div>
            <div className="layoutPreview">
              <div>
                <span>Dokumente</span>
                <strong>{formatNumber(analysis.sourceDocuments.length)}</strong>
              </div>
              <div>
                <span>Dubletten</span>
                <strong>{formatNumber(analysis.duplicates.length)}</strong>
              </div>
              <div>
                <span>Pruefung offen</span>
                <strong>{formatNumber(analysis.reviewRequiredCount)}</strong>
              </div>
            </div>
            <div className="issueList">
              {analysis.issues.length === 0 ? (
                <p className="muted">Keine Hinweise vorhanden.</p>
              ) : (
                analysis.issues.map((issue) => <p key={issue}>{issue}</p>)
              )}
            </div>
          </section>
        </section>

        <ObjectDetail object={selectedObject} />

        <section className="panel" id="exports">
          <div className="panelHeader">
            <div>
              <h2>Export</h2>
              <p>Exportiert den aktuellen Analysezustand inklusive Quellenangaben.</p>
            </div>
          </div>
          <div className="headerActions">
            <button type="button" onClick={() => exportFile("excel")}>Als Excel herunterladen</button>
            <button type="button" onClick={() => exportFile("pdf")}>Als PDF herunterladen</button>
          </div>
        </section>
      </section>
    </main>
  );
}
