"use client";

import { useMemo, useState } from "react";
import { reportMapping, reportWorkflowSteps } from "../lib/reports/reportMapping";
import { runQuarterlyReportWorkflow } from "../lib/reports/reportEngine";
import { severityLabel } from "../lib/reports/reviewEngine";
import type { PlaceholderPreview, ReportEngineResult, ReportWorkflowStepStatus } from "../lib/reports/reportTypes";

const initialResult: ReportEngineResult | null = null;

export function QuarterlyReportsModule() {
  const [fund, setFund] = useState("");
  const [quarter, setQuarter] = useState("Q1");
  const [fiscalYear, setFiscalYear] = useState(String(new Date().getFullYear()));
  const [reportDate, setReportDate] = useState("");
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [result, setResult] = useState<ReportEngineResult | null>(initialResult);
  const [isRunning, setIsRunning] = useState(false);

  const previewRows = useMemo<PlaceholderPreview[]>(() => result?.preview ?? [], [result]);
  const reviewItems = result?.review ?? [];

  async function runWorkflow() {
    setIsRunning(true);
    try {
      const nextResult = await runQuarterlyReportWorkflow({
        excelFile,
        templateFile,
        mapping: reportMapping
      });
      setResult(nextResult);
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="quarterlyProduct">
      <section className="quarterlyProductHeader">
        <div>
          <p className="eyebrow">Quartalsbericht-Generator</p>
          <h2>Excel + PowerPoint + Mapping</h2>
          <p className="muted">Deterministischer Workflow für Quartalsbericht-Entwürfe. Keine KI-Interpretation, keine externen Datenabrufe.</p>
        </div>
        <button className="buttonPrimary" type="button" onClick={runWorkflow} disabled={isRunning}>
          {isRunning ? "Workflow läuft..." : "Quartalsbericht-Entwurf erstellen"}
        </button>
      </section>

      <section className="quarterlyGeneratorGrid">
        <article className="panel quarterlyWorkflowPanel">
          <h3>Workflow</h3>
          <div className="quarterlyWorkflowSteps">
            {reportWorkflowSteps.map((step) => {
              const status = result?.stepStatuses[step.key] ?? "idle";
              return (
                <div className={`quarterlyWorkflowStep quarterlyWorkflowStep-${status}`} key={step.key}>
                  <strong>{step.label}</strong>
                  <span>{step.description}</span>
                  <em>{workflowStatusLabel(status)}</em>
                </div>
              );
            })}
          </div>

          <div className="quarterlyInputGrid">
            <label className="filterInput">
              <span>Fonds</span>
              <input value={fund} onChange={(event) => setFund(event.target.value)} placeholder="Fonds" />
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
        </article>

        <aside className="panel quarterlyStatusPanel">
          <h3>Status</h3>
          <div className="quarterlyStatusCards">
            <StatusCard label="Dateien" value={result?.files.excel && result.files.template ? "geladen" : "offen"} status={result?.stepStatuses.files ?? "idle"} />
            <StatusCard label="Mappingstatus" value={`${result?.mappingStatus.total ?? reportMapping.length} Einträge`} status={result?.stepStatuses.mapping ?? "idle"} />
            <StatusCard label="Review" value={`${reviewItems.length} Hinweise`} status={result?.stepStatuses.analysis ?? "idle"} />
            <StatusCard label="Bericht" value={result?.exportResult.created ? "erstellt" : "vorbereitet"} status={result?.stepStatuses.report ?? "idle"} />
          </div>

          <h3>Dateien</h3>
          <div className="quarterlyFileList">
            <span><strong>Excel</strong>{excelFile?.name ?? "nicht ausgewählt"}</span>
            <span><strong>Template</strong>{templateFile?.name ?? "nicht ausgewählt"}</span>
          </div>

          <h3>Review</h3>
          <div className="quarterlyReviewList">
            {(reviewItems.length ? reviewItems : [{
              id: "empty",
              severity: "info" as const,
              title: "Noch kein Lauf",
              message: "Bitte Dateien auswählen und den Workflow starten."
            }]).slice(0, 8).map((item) => (
              <p className={`quarterlyReviewItem quarterlyReviewItem-${item.severity}`} key={item.id}>
                <strong>{severityLabel(item.severity)} · {item.title}</strong>
                <span>{item.message}</span>
              </p>
            ))}
          </div>

          <h3>Log</h3>
          <div className="quarterlyLog">
            {(result?.log ?? ["Workflow wartet auf Start."]).map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
        </aside>
      </section>

      <section className="panel quarterlyPreviewPanel">
        <div className="panelHeader">
          <div>
            <h3>Preview der Mapping-Einträge</h3>
            <p className="muted">Alle Zuordnungen kommen aus dem Mapping und können später dort bearbeitet werden.</p>
          </div>
          <span className="status">{reportMapping.length} Einträge</span>
        </div>
        <div className="tableWrap quarterlyPreviewTable">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Quelle</th>
                <th>Ziel</th>
                <th>Typ</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(previewRows.length ? previewRows : reportMapping.map((entry) => ({
                id: entry.id,
                label: entry.label,
                section: entry.section,
                source: entry.sourceType,
                target: `Folie ${entry.target.slide} / ${entry.target.placeholder ?? entry.target.shapeName ?? "kein Ziel"}`,
                type: entry.type,
                format: entry.format,
                status: "info" as const,
                note: "Mapping geladen, noch nicht analysiert."
              }))).map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.label}</strong><small>{row.id}</small></td>
                  <td>{row.source}</td>
                  <td>{row.target}</td>
                  <td>{row.type} / {row.format}</td>
                  <td><span className={`status ${row.status === "success" ? "statusGreen" : ""}`}>{row.note}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatusCard({ label, value, status }: { label: string; value: string; status: ReportWorkflowStepStatus }) {
  return (
    <article className={`quarterlyStatusCard quarterlyStatusCard-${status}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function workflowStatusLabel(status: ReportWorkflowStepStatus): string {
  if (status === "done") return "ok";
  if (status === "warning") return "Review";
  if (status === "error") return "fehlt";
  if (status === "active") return "läuft";
  return "offen";
}
