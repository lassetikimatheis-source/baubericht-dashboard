"use client";

import { useMemo, useState } from "react";
import { reportMapping, reportSections, reportWorkflowSteps } from "../lib/reports/reportMapping";
import type { PlaceholderPreview, ReportMappingEntry, ReportWorkflowStepKey } from "../lib/reports/reportTypes";

type WorkflowStatus = "idle" | "done" | "warning";

const initialStatuses: Partial<Record<ReportWorkflowStepKey, WorkflowStatus>> = {
  fileLoaded: "idle",
  mappingChecked: "idle",
  dataExtracted: "idle",
  reportCreated: "idle",
  reviewRequired: "idle"
};

export function QuarterlyReportsModule() {
  const [fund, setFund] = useState("");
  const [quarter, setQuarter] = useState("Q1");
  const [fiscalYear, setFiscalYear] = useState(String(new Date().getFullYear()));
  const [reportDate, setReportDate] = useState("");
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [statuses, setStatuses] = useState<Partial<Record<ReportWorkflowStepKey, WorkflowStatus>>>(initialStatuses);
  const [preview, setPreview] = useState<PlaceholderPreview[]>([]);
  const [reviewNotes, setReviewNotes] = useState<string[]>([
    "Noch kein Entwurf erstellt. Bitte Excel-Datei und PowerPoint-Template auswählen."
  ]);

  const requiredMappingCount = useMemo(() => reportMapping.filter((entry) => entry.required).length, []);

  function createDraftPreview() {
    const notes: string[] = [];
    const hasExcel = Boolean(excelFile);
    const hasTemplate = Boolean(templateFile);
    const hasMapping = reportMapping.length > 0;

    if (!hasExcel) notes.push("Excel-Arbeitsdatei fehlt.");
    if (!hasTemplate) notes.push("PowerPoint-Template fehlt.");
    if (!hasMapping) notes.push("Mapping ist leer oder nicht geladen.");

    const nextPreview = reportMapping.map((entry) => buildPlaceholderPreview(entry, hasExcel, hasTemplate));
    const canCheckMapping = hasMapping && hasExcel && hasTemplate;

    setPreview(nextPreview);
    setStatuses({
      fileLoaded: hasExcel && hasTemplate ? "done" : "warning",
      mappingChecked: canCheckMapping ? "done" : "warning",
      dataExtracted: "warning",
      reportCreated: "warning",
      reviewRequired: "warning"
    });
    setReviewNotes([
      ...notes,
      "Dummy-Workflow: Es wurden noch keine Excel-Werte extrahiert und keine PowerPoint-Datei verändert.",
      "Platzhalter und Shape-Namen müssen später gegen das echte Template validiert werden.",
      "Excel-Ranges, Excel-Charts und Power-BI-Measures sind im Mapping vorbereitet, aber noch nicht angebunden."
    ]);
  }

  return (
    <div className="quarterlyReports">
      <section className="quarterlySetup panel">
        <div className="panelHeader">
          <div>
            <h2>Quartalsbericht-Generator</h2>
            <p className="muted">Deterministischer Rahmen für Excel, optional Power BI und PowerPoint-Templates.</p>
          </div>
          <span className="status">{reportMapping.length} Mapping-Einträge</span>
        </div>

        <div className="quarterlyForm">
          <label className="filterInput">
            <span>Fonds</span>
            <input value={fund} onChange={(event) => setFund(event.target.value)} placeholder="Fonds auswählen oder eingeben" />
          </label>
          <label className="filterInput">
            <span>Quartal</span>
            <select value={quarter} onChange={(event) => setQuarter(event.target.value)}>
              <option>Q1</option>
              <option>Q2</option>
              <option>Q3</option>
              <option>Q4</option>
            </select>
          </label>
          <label className="filterInput">
            <span>Geschäftsjahr</span>
            <input value={fiscalYear} onChange={(event) => setFiscalYear(event.target.value)} inputMode="numeric" />
          </label>
          <label className="filterInput">
            <span>Stichtag</span>
            <input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} />
          </label>
          <label className="filterInput filterWide">
            <span>Excel-Datei</span>
            <input type="file" accept=".xlsx,.xlsm,.xls" onChange={(event) => setExcelFile(event.target.files?.[0] ?? null)} />
          </label>
          <label className="filterInput filterWide">
            <span>PowerPoint-Template</span>
            <input type="file" accept=".pptx,.potx" onChange={(event) => setTemplateFile(event.target.files?.[0] ?? null)} />
          </label>
        </div>

        <div className="quarterlyActions">
          <button className="buttonPrimary" type="button" onClick={createDraftPreview}>
            Quartalsbericht-Entwurf erstellen
          </button>
          <div className="quarterlyFileSummary">
            <span>Excel: {excelFile?.name ?? "nicht ausgewählt"}</span>
            <span>Template: {templateFile?.name ?? "nicht ausgewählt"}</span>
          </div>
        </div>
      </section>

      <section className="quarterlyStatusGrid">
        {reportWorkflowSteps.map((step) => (
          <article key={step.key} className={`quarterlyStatus quarterlyStatus-${statuses[step.key] ?? "idle"}`}>
            <span>{step.label}</span>
            <strong>{statusLabel(statuses[step.key] ?? "idle")}</strong>
          </article>
        ))}
      </section>

      <section className="quarterlyLayout">
        <article className="panel">
          <div className="panelHeader">
            <div>
              <h3>Dummy-Preview der Platzhalter</h3>
              <p className="muted">{requiredMappingCount} Pflichtwerte, vorbereitet für Excel-Zellen, Ranges, Charts und spätere Power-BI-Measures.</p>
            </div>
          </div>
          <div className="tableWrap quarterlyPreviewTable">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Bereich</th>
                  <th>Quelle</th>
                  <th>Ziel</th>
                  <th>Typ</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(preview.length ? preview : reportMapping.map((entry) => buildPlaceholderPreview(entry, false, false))).map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.label}</strong><small>{item.id}</small></td>
                    <td>{item.section}</td>
                    <td>{item.source}</td>
                    <td>{item.target}</td>
                    <td>{item.type} / {item.format}</td>
                    <td><span className={`status ${item.status === "ready" ? "statusGreen" : ""}`}>{item.note}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <aside className="panel quarterlyReview">
          <h3>Review-Hinweise</h3>
          <div className="issueList">
            {reviewNotes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
          <h3>Berichtsbereiche</h3>
          <div className="quarterlySectionList">
            {reportSections.map((section) => (
              <span key={section.key}>{section.label}</span>
            ))}
          </div>
        </aside>
      </section>
    </div>
  );
}

function buildPlaceholderPreview(entry: ReportMappingEntry, hasExcel: boolean, hasTemplate: boolean): PlaceholderPreview {
  const section = reportSections.find((item) => item.key === entry.section)?.label ?? entry.section;
  const source = formatSource(entry);
  const target = `Folie ${entry.target.slide} · ${entry.target.placeholder ?? entry.target.shapeName ?? "kein Ziel"}`;
  const hasTarget = Boolean(entry.target.placeholder || entry.target.shapeName);
  const status = hasExcel && hasTemplate && hasTarget ? "ready" : "warning";

  return {
    id: entry.id,
    label: entry.label,
    section,
    source,
    target,
    type: entry.type,
    format: entry.format,
    status,
    note: status === "ready" ? "bereit für spätere Ersetzung" : missingReason(hasExcel, hasTemplate, hasTarget)
  };
}

function formatSource(entry: ReportMappingEntry): string {
  if ("cell" in entry.source) return `${entry.sourceType}: ${entry.source.sheet}!${entry.source.cell}`;
  if ("range" in entry.source) return `${entry.sourceType}: ${entry.source.sheet}!${entry.source.range}`;
  if ("chartName" in entry.source) return `${entry.sourceType}: ${entry.source.sheet}/${entry.source.chartName}`;
  if ("measure" in entry.source) return `${entry.sourceType}: ${entry.source.measure}`;
  if ("key" in entry.source) return `${entry.sourceType}: ${entry.source.key}`;
  if ("tableName" in entry.source) return `${entry.sourceType}: ${entry.source.sheet}/${entry.source.tableName}`;
  if ("imageName" in entry.source) return `${entry.sourceType}: ${entry.source.sheet}/${entry.source.imageName}`;
  return entry.sourceType;
}

function missingReason(hasExcel: boolean, hasTemplate: boolean, hasTarget: boolean): string {
  if (!hasExcel) return "Excel fehlt";
  if (!hasTemplate) return "Template fehlt";
  if (!hasTarget) return "Zielplatzhalter fehlt";
  return "Review erforderlich";
}

function statusLabel(status: WorkflowStatus): string {
  if (status === "done") return "ok";
  if (status === "warning") return "Hinweis";
  return "offen";
}
