"use client";

import { useEffect, useMemo, useState } from "react";
import { reportMapping, reportWorkflowSteps } from "../lib/reports/reportMapping";
import { runQuarterlyReportWorkflow } from "../lib/reports/reportEngine";
import { severityLabel } from "../lib/reports/reviewEngine";
import {
  loadQuarterlyReportBundle,
  saveFund,
  saveQuarterlyPowerBiLink,
  saveQuarterlyReport,
  saveQuarterlyReportFile,
  saveQuarterlyReportValue,
  type FundRecord,
  type QuarterlyReportFileRecord,
  type QuarterlyReportFileType,
  type QuarterlyReportPowerBiLinkRecord,
  type QuarterlyReportRecord,
  type QuarterlyReportValueRecord
} from "../lib/supabase";
import type { PlaceholderPreview, ReportEngineResult, ReportWorkflowStepStatus } from "../lib/reports/reportTypes";

const fileTypes: QuarterlyReportFileType[] = ["Mieterliste", "Verkehrswerte/VKW", "CapEx/TDREV", "Budget", "Leerstand", "Sonstige"];
const quarters = ["Q1", "Q2", "Q3", "Q4"];

type Message = { type: "info" | "success" | "error"; text: string };

export function QuarterlyReportsWorkspace() {
  const [funds, setFunds] = useState<FundRecord[]>([]);
  const [reports, setReports] = useState<QuarterlyReportRecord[]>([]);
  const [files, setFiles] = useState<QuarterlyReportFileRecord[]>([]);
  const [powerBiLinks, setPowerBiLinks] = useState<QuarterlyReportPowerBiLinkRecord[]>([]);
  const [values, setValues] = useState<QuarterlyReportValueRecord[]>([]);
  const [selectedFundId, setSelectedFundId] = useState("");
  const [selectedReportId, setSelectedReportId] = useState("");
  const [quarter, setQuarter] = useState("Q1");
  const [fiscalYear, setFiscalYear] = useState(String(new Date().getFullYear()));
  const [reportDate, setReportDate] = useState("");
  const [status, setStatus] = useState("draft");
  const [version, setVersion] = useState("1.0");
  const [editor, setEditor] = useState("");
  const [fundForm, setFundForm] = useState({ fundName: "", fundNumber: "", company: "", contactPerson: "", status: "active", remark: "" });
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [fileForm, setFileForm] = useState({ fileType: "Mieterliste" as QuarterlyReportFileType, fileName: "", sheetName: "", relevantCells: "", relevantColumns: "", importStatus: "pending", errorLog: "" });
  const [powerBiForm, setPowerBiForm] = useState({ workspace: "", reportDashboard: "", dataset: "", metric: "", sourceCell: "", value: "", manualValue: "", isOverridden: false, importStatus: "pending", errorLog: "" });
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [result, setResult] = useState<ReportEngineResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState<Message>({ type: "info", text: "Quartalsbericht-Modul bereit." });
  const [lastSavedAt, setLastSavedAt] = useState("");

  useEffect(() => {
    void refreshBundle();
  }, []);

  const selectedFund = funds.find((fund) => fund.id === selectedFundId) ?? null;
  const selectedReport = reports.find((report) => report.id === selectedReportId) ?? null;
  const reportFiles = files.filter((file) => file.reportId === selectedReportId);
  const reportPowerBiLinks = powerBiLinks.filter((link) => link.reportId === selectedReportId);
  const reportValues = values.filter((value) => value.reportId === selectedReportId);
  const fundReports = reports.filter((report) => report.fundId === selectedFundId);
  const previewRows = useMemo<PlaceholderPreview[]>(() => result?.preview ?? [], [result]);
  const reviewItems = result?.review ?? [];
  const missingFields = buildMissingFields({ selectedFund, selectedReport, reportFiles, reportPowerBiLinks, reportDate, fiscalYear });

  async function refreshBundle() {
    try {
      const bundle = await loadQuarterlyReportBundle();
      setFunds(bundle.funds);
      setReports(bundle.reports);
      setFiles(bundle.files);
      setPowerBiLinks(bundle.powerBiLinks);
      setValues(bundle.values);
      setMessage({ type: "success", text: "Quartalsbericht-Daten geladen." });
    } catch (error) {
      setMessage({ type: "error", text: errorMessage(error) });
    }
  }

  async function handleSaveFund() {
    try {
      const saved = await saveFund(fundForm);
      setFunds((current) => upsertById(current, saved));
      setSelectedFundId(saved.id);
      setLastSavedAt(new Date().toLocaleString("de-DE"));
      setMessage({ type: "success", text: `Fonds gespeichert: ${saved.fundName}.` });
    } catch (error) {
      setMessage({ type: "error", text: errorMessage(error) });
    }
  }

  async function handleSaveReport() {
    try {
      const saved = await saveQuarterlyReport({
        id: selectedReportId || undefined,
        fundId: selectedFundId,
        quarter,
        year: Number(fiscalYear),
        reportDate,
        status,
        version,
        editor
      });
      setReports((current) => upsertById(current, saved));
      setSelectedReportId(saved.id);
      setLastSavedAt(new Date().toLocaleString("de-DE"));
      setMessage({ type: "success", text: `Bericht gespeichert: ${quarter}/${fiscalYear}.` });
    } catch (error) {
      setMessage({ type: "error", text: errorMessage(error) });
    }
  }

  async function handleSaveFile() {
    try {
      if (!selectedReport || !selectedFund) throw new Error("Bitte zuerst Fonds und Quartalsbericht speichern.");
      const saved = await saveQuarterlyReportFile({
        reportId: selectedReport.id,
        fundId: selectedFund.id,
        fileType: fileForm.fileType,
        fileName: (excelFile?.name ?? fileForm.fileName).trim(),
        assignedQuarter: selectedReport.quarter,
        assignedYear: selectedReport.year,
        sheetName: fileForm.sheetName,
        relevantCells: fileForm.relevantCells,
        relevantColumns: fileForm.relevantColumns,
        importStatus: fileForm.importStatus,
        errorLog: fileForm.errorLog
      });
      setFiles((current) => upsertById(current, saved));
      setExcelFile(null);
      setFileForm((current) => ({ ...current, fileName: "", sheetName: "", relevantCells: "", relevantColumns: "", errorLog: "", importStatus: "pending" }));
      setLastSavedAt(new Date().toLocaleString("de-DE"));
      setMessage({ type: "success", text: `Excel-Zuordnung gespeichert: ${saved.fileName}.` });
    } catch (error) {
      setMessage({ type: "error", text: errorMessage(error) });
    }
  }

  async function handleSavePowerBi() {
    try {
      if (!selectedReport || !selectedFund) throw new Error("Bitte zuerst Fonds und Quartalsbericht speichern.");
      const saved = await saveQuarterlyPowerBiLink({
        reportId: selectedReport.id,
        fundId: selectedFund.id,
        workspace: powerBiForm.workspace,
        reportDashboard: powerBiForm.reportDashboard,
        dataset: powerBiForm.dataset,
        metric: powerBiForm.metric,
        sourceCell: powerBiForm.sourceCell,
        reportDate: selectedReport.reportDate,
        value: powerBiForm.value,
        lastSyncAt: new Date().toISOString(),
        isOverridden: powerBiForm.isOverridden,
        manualValue: powerBiForm.manualValue,
        importStatus: powerBiForm.importStatus,
        errorLog: powerBiForm.errorLog
      });
      setPowerBiLinks((current) => upsertById(current, saved));
      setPowerBiForm({ workspace: "", reportDashboard: "", dataset: "", metric: "", sourceCell: "", value: "", manualValue: "", isOverridden: false, importStatus: "pending", errorLog: "" });
      setLastSavedAt(new Date().toLocaleString("de-DE"));
      setMessage({ type: "success", text: `PowerBI-Wert gespeichert: ${saved.metric}.` });
    } catch (error) {
      setMessage({ type: "error", text: errorMessage(error) });
    }
  }

  async function handleReviewValue(value: QuarterlyReportValueRecord, reviewedValue: string) {
    try {
      const saved = await saveQuarterlyReportValue({ ...value, reviewedValue, isReviewed: true, status: "reviewed" });
      setValues((current) => upsertById(current, saved));
      setLastSavedAt(new Date().toLocaleString("de-DE"));
    } catch (error) {
      setMessage({ type: "error", text: errorMessage(error) });
    }
  }

  async function runWorkflow() {
    if (missingFields.length) {
      setMessage({ type: "error", text: `Fehlende Pflichtfelder: ${missingFields.join(", ")}.` });
      return;
    }
    setIsRunning(true);
    try {
      const nextResult = await runQuarterlyReportWorkflow({ excelFile, templateFile, mapping: reportMapping });
      setResult(nextResult);
      if (selectedReport && selectedFund) {
        const extractedValues = nextResult.preview.slice(0, 20).map((row) => ({
          reportId: selectedReport.id,
          fundId: selectedFund.id,
          valueKey: row.id,
          label: row.label,
          sourceType: row.type,
          sourceReference: row.source,
          value: row.note,
          reviewedValue: "",
          isReviewed: false,
          status: row.status,
          remark: row.target
        }));
        const savedValues = await Promise.all(extractedValues.map((value) => saveQuarterlyReportValue(value)));
        setValues((current) => mergeManyById(current, savedValues));
      }
      setMessage({ type: "success", text: "Quartalsbericht-Workflow abgeschlossen. Werte sind pruefbar abgelegt." });
    } catch (error) {
      setMessage({ type: "error", text: errorMessage(error) });
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="quarterlyProduct">
      <section className="quarterlyProductHeader">
        <div>
          <p className="eyebrow">Quartalsberichte</p>
          <h2>Fonds, Datenquellen und Bericht eindeutig verknuepfen</h2>
          <p className="muted">Jeder Bericht gehoert zu genau einem Fonds; Dateien, PowerBI-Werte und Review-Werte werden daran gebunden.</p>
        </div>
        <div className={`quarterlyMessage quarterlyMessage-${message.type}`}>{message.text}</div>
      </section>

      <section className="quarterlyGeneratorGrid">
        <article className="panel quarterlyWorkflowPanel">
          <h3>Ablauf</h3>
          <div className="quarterlyWorkflowSteps quarterlyWorkflowStepsSix">
            {["Fonds auswaehlen", "Quartal anlegen", "Excel zuordnen", "PowerBI zuordnen", "Werte pruefen", "Export erzeugen"].map((label, index) => (
              <div className={`quarterlyWorkflowStep ${workflowClass(index, missingFields)}`} key={label}>
                <strong>Schritt {index + 1}</strong>
                <span>{label}</span>
                <em>{stepLabel(index, selectedFund, selectedReport, reportFiles, reportPowerBiLinks, reportValues)}</em>
              </div>
            ))}
          </div>

          <div className="quarterlySubgrid">
            <section className="quarterlyBlock">
              <h4>1. Fonds-Verwaltung</h4>
              <div className="quarterlyInputGrid">
                <label className="filterInput">
                  <span>Fonds auswaehlen</span>
                  <select value={selectedFundId} onChange={(event) => setSelectedFundId(event.target.value)}>
                    <option value="">Bitte waehlen</option>
                    {funds.map((fund) => <option key={fund.id} value={fund.id}>{fund.fundName} ({fund.fundNumber})</option>)}
                  </select>
                </label>
                <label className="filterInput"><span>Fondsname</span><input value={fundForm.fundName} onChange={(event) => setFundForm({ ...fundForm, fundName: event.target.value })} placeholder="Fonds 22" /></label>
                <label className="filterInput"><span>Fondsnummer</span><input value={fundForm.fundNumber} onChange={(event) => setFundForm({ ...fundForm, fundNumber: event.target.value })} placeholder="Fonds 22" /></label>
                <label className="filterInput"><span>Gesellschaft</span><input value={fundForm.company} onChange={(event) => setFundForm({ ...fundForm, company: event.target.value })} /></label>
                <label className="filterInput"><span>Ansprechpartner</span><input value={fundForm.contactPerson} onChange={(event) => setFundForm({ ...fundForm, contactPerson: event.target.value })} /></label>
                <label className="filterInput"><span>Status</span><input value={fundForm.status} onChange={(event) => setFundForm({ ...fundForm, status: event.target.value })} /></label>
                <label className="filterInput filterWide"><span>Bemerkung</span><input value={fundForm.remark} onChange={(event) => setFundForm({ ...fundForm, remark: event.target.value })} /></label>
              </div>
              <button className="buttonSecondary" type="button" onClick={handleSaveFund}>Fonds speichern</button>
            </section>

            <section className="quarterlyBlock">
              <h4>2. Quartalsbericht-Verwaltung</h4>
              <div className="quarterlyInputGrid">
                <label className="filterInput">
                  <span>Bericht auswaehlen</span>
                  <select value={selectedReportId} onChange={(event) => setSelectedReportId(event.target.value)}>
                    <option value="">Neuer Bericht</option>
                    {fundReports.map((report) => <option key={report.id} value={report.id}>{report.quarter}/{report.year} - {report.reportDate} - v{report.version}</option>)}
                  </select>
                </label>
                <label className="filterInput"><span>Quartal</span><select value={quarter} onChange={(event) => setQuarter(event.target.value)}>{quarters.map((item) => <option key={item}>{item}</option>)}</select></label>
                <label className="filterInput"><span>Jahr</span><input value={fiscalYear} onChange={(event) => setFiscalYear(event.target.value)} inputMode="numeric" /></label>
                <label className="filterInput"><span>Stichtag</span><input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} /></label>
                <label className="filterInput"><span>Status</span><input value={status} onChange={(event) => setStatus(event.target.value)} /></label>
                <label className="filterInput"><span>Version</span><input value={version} onChange={(event) => setVersion(event.target.value)} /></label>
                <label className="filterInput"><span>Bearbeiter</span><input value={editor} onChange={(event) => setEditor(event.target.value)} /></label>
              </div>
              <button className="buttonPrimary" type="button" onClick={handleSaveReport} disabled={!selectedFundId}>Quartalsbericht speichern</button>
            </section>

            <section className="quarterlyBlock">
              <h4>3. Excel-Dateien zuordnen</h4>
              <div className="quarterlyInputGrid">
                <label className="filterInput"><span>Datei-Typ</span><select value={fileForm.fileType} onChange={(event) => setFileForm({ ...fileForm, fileType: event.target.value as QuarterlyReportFileType })}>{fileTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
                <label className="filterInput filterWide"><span>Excel-Datei</span><input type="file" accept=".xlsx,.xlsm,.xls" onChange={(event) => setExcelFile(event.target.files?.[0] ?? null)} /></label>
                <label className="filterInput"><span>Dateiname</span><input value={fileForm.fileName || excelFile?.name || ""} onChange={(event) => setFileForm({ ...fileForm, fileName: event.target.value })} /></label>
                <label className="filterInput"><span>Tabellenblatt</span><input value={fileForm.sheetName} onChange={(event) => setFileForm({ ...fileForm, sheetName: event.target.value })} /></label>
                <label className="filterInput"><span>Zellen</span><input value={fileForm.relevantCells} onChange={(event) => setFileForm({ ...fileForm, relevantCells: event.target.value })} placeholder="G23, K23, M23, O23" /></label>
                <label className="filterInput"><span>Spalten</span><input value={fileForm.relevantColumns} onChange={(event) => setFileForm({ ...fileForm, relevantColumns: event.target.value })} /></label>
                <label className="filterInput"><span>Importstatus</span><input value={fileForm.importStatus} onChange={(event) => setFileForm({ ...fileForm, importStatus: event.target.value })} /></label>
                <label className="filterInput filterWide"><span>Fehlerlog</span><input value={fileForm.errorLog} onChange={(event) => setFileForm({ ...fileForm, errorLog: event.target.value })} /></label>
              </div>
              <button className="buttonSecondary" type="button" onClick={handleSaveFile} disabled={!selectedReportId}>Excel-Zuordnung speichern</button>
            </section>

            <section className="quarterlyBlock">
              <h4>4. PowerBI-Werte zuordnen</h4>
              <div className="quarterlyInputGrid">
                <label className="filterInput"><span>Workspace</span><input value={powerBiForm.workspace} onChange={(event) => setPowerBiForm({ ...powerBiForm, workspace: event.target.value })} /></label>
                <label className="filterInput"><span>Report/Dashboard</span><input value={powerBiForm.reportDashboard} onChange={(event) => setPowerBiForm({ ...powerBiForm, reportDashboard: event.target.value })} /></label>
                <label className="filterInput"><span>Dataset</span><input value={powerBiForm.dataset} onChange={(event) => setPowerBiForm({ ...powerBiForm, dataset: event.target.value })} /></label>
                <label className="filterInput"><span>Kennzahl</span><input value={powerBiForm.metric} onChange={(event) => setPowerBiForm({ ...powerBiForm, metric: event.target.value })} placeholder="G23" /></label>
                <label className="filterInput"><span>Quelle/Zelle</span><input value={powerBiForm.sourceCell} onChange={(event) => setPowerBiForm({ ...powerBiForm, sourceCell: event.target.value })} /></label>
                <label className="filterInput"><span>Wert</span><input value={powerBiForm.value} onChange={(event) => setPowerBiForm({ ...powerBiForm, value: event.target.value })} /></label>
                <label className="filterInput"><span>Manueller Wert</span><input value={powerBiForm.manualValue} onChange={(event) => setPowerBiForm({ ...powerBiForm, manualValue: event.target.value })} /></label>
                <label className="quarterlyCheck"><input type="checkbox" checked={powerBiForm.isOverridden} onChange={(event) => setPowerBiForm({ ...powerBiForm, isOverridden: event.target.checked })} /> Ueberschrieben</label>
              </div>
              <button className="buttonSecondary" type="button" onClick={handleSavePowerBi} disabled={!selectedReportId}>PowerBI-Zuordnung speichern</button>
            </section>
          </div>
        </article>

        <aside className="panel quarterlyStatusPanel">
          <h3>Diagnose</h3>
          <div className="quarterlyFileList">
            <span><strong>Ausgewaehlter Fonds</strong>{selectedFund ? `${selectedFund.fundName} (${selectedFund.fundNumber})` : "fehlt"}</span>
            <span><strong>Ausgewaehltes Quartal</strong>{selectedReport ? `${selectedReport.quarter}/${selectedReport.year}, Stichtag ${selectedReport.reportDate}` : `${quarter}/${fiscalYear}, noch nicht gespeichert`}</span>
            <span><strong>Excel-Dateien</strong>{reportFiles.length ? `${reportFiles.length} verknuepft` : "keine verknuepft"}</span>
            <span><strong>PowerBI-Quellen</strong>{reportPowerBiLinks.length ? `${reportPowerBiLinks.length} verknuepft` : "keine verknuepft"}</span>
            <span><strong>Fehlende Pflichtfelder</strong>{missingFields.length ? missingFields.join(", ") : "keine"}</span>
            <span><strong>Importfehler</strong>{[...reportFiles, ...reportPowerBiLinks].map((item) => item.errorLog).filter(Boolean).join(" | ") || "keine"}</span>
            <span><strong>Letzter Speicherzeitpunkt</strong>{lastSavedAt || selectedReport?.lastChangedAt || "noch nicht gespeichert"}</span>
          </div>

          <h3>6. Export</h3>
          <label className="filterInput">
            <span>PowerPoint-Template</span>
            <input type="file" accept=".pptx,.potx" onChange={(event) => setTemplateFile(event.target.files?.[0] ?? null)} />
          </label>
          <button className="buttonPrimary" type="button" onClick={runWorkflow} disabled={isRunning || missingFields.length > 0}>
            {isRunning ? "Workflow laeuft..." : "Quartalsbericht erzeugen/exportieren"}
          </button>

          <h3>Review</h3>
          <div className="quarterlyReviewList">
            {(reviewItems.length ? reviewItems : [{ id: "empty", severity: "info" as const, title: "Noch kein Lauf", message: "Bitte Fonds, Bericht und Quellen zuordnen." }]).slice(0, 8).map((item) => (
              <p className={`quarterlyReviewItem quarterlyReviewItem-${item.severity}`} key={item.id}>
                <strong>{severityLabel(item.severity)} - {item.title}</strong>
                <span>{item.message}</span>
              </p>
            ))}
          </div>
        </aside>
      </section>

      <section className="quarterlyDataGrid">
        <QuarterlyTable title="Verknuepfte Excel-Dateien" rows={reportFiles.map((file) => [file.fileType, file.fileName, `${file.assignedQuarter}/${file.assignedYear}`, file.sheetName, file.relevantCells || file.relevantColumns, file.importStatus])} empty="Keine Excel-Datei fuer diesen Bericht gespeichert." />
        <QuarterlyTable title="Verknuepfte PowerBI-Werte" rows={reportPowerBiLinks.map((link) => [selectedFund?.fundName ?? "", `${selectedReport?.quarter}/${selectedReport?.year}`, link.workspace, link.reportDashboard, link.dataset, link.metric, link.sourceCell, link.isOverridden ? link.manualValue : link.value, link.lastSyncAt])} empty="Keine PowerBI-Quelle fuer diesen Bericht gespeichert." />
      </section>

      <section className="panel quarterlyPreviewPanel">
        <div className="panelHeader">
          <div>
            <h3>5. Werte pruefen/korrigieren</h3>
            <p className="muted">PowerBI-Werte und extrahierte Mapping-Werte bleiben sichtbar an Fonds und Bericht gebunden.</p>
          </div>
          <span className="status">{reportValues.length || previewRows.length} Werte</span>
        </div>
        <div className="tableWrap quarterlyPreviewTable">
          <table>
            <thead>
              <tr><th>Wert</th><th>Quelle</th><th>Original</th><th>Korrektur</th><th>Status</th></tr>
            </thead>
            <tbody>
              {(reportValues.length ? reportValues : previewRows.map((row) => ({ id: row.id, label: row.label, sourceReference: row.source, value: row.note, reviewedValue: "", status: row.status }))).map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.label}</strong><small>{selectedFund?.fundName ?? "kein Fonds"} / {selectedReport ? `${selectedReport.quarter}/${selectedReport.year}` : "kein Bericht"}</small></td>
                  <td>{row.sourceReference}</td>
                  <td>{row.value}</td>
                  <td><input className="quarterlyInlineInput" defaultValue={row.reviewedValue} onBlur={(event) => "reportId" in row ? handleReviewValue(row, event.target.value) : undefined} /></td>
                  <td><span className="status">{row.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="quarterlyStatusGrid">
        {reportWorkflowSteps.slice(0, 5).map((step) => {
          const stepStatus = result?.stepStatuses[step.key] ?? "idle";
          return <article key={step.key} className={`quarterlyStatusCard quarterlyStatusCard-${stepStatus}`}><span>{step.label}</span><strong>{workflowStatusLabel(stepStatus)}</strong></article>;
        })}
      </section>
    </div>
  );
}

function QuarterlyTable({ title, rows, empty }: { title: string; rows: string[][]; empty: string }) {
  return (
    <article className="panel quarterlyPreviewPanel">
      <h3>{title}</h3>
      <div className="tableWrap quarterlyPreviewTable">
        <table>
          <tbody>
            {rows.length ? rows.map((row, index) => <tr key={`${title}-${index}`}>{row.map((cell, cellIndex) => <td key={`${title}-${index}-${cellIndex}`}>{cell || "-"}</td>)}</tr>) : <tr><td>{empty}</td></tr>}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function buildMissingFields(input: {
  selectedFund: FundRecord | null;
  selectedReport: QuarterlyReportRecord | null;
  reportFiles: QuarterlyReportFileRecord[];
  reportPowerBiLinks: QuarterlyReportPowerBiLinkRecord[];
  reportDate: string;
  fiscalYear: string;
}): string[] {
  const missing: string[] = [];
  if (!input.selectedFund) missing.push("Fonds");
  if (!input.selectedReport) missing.push("gespeicherter Quartalsbericht");
  if (!input.reportDate && !input.selectedReport?.reportDate) missing.push("Stichtag");
  if (!Number(input.fiscalYear || input.selectedReport?.year)) missing.push("Jahr");
  if (!input.reportFiles.length) missing.push("Excel-Datei");
  if (!input.reportPowerBiLinks.length) missing.push("PowerBI-Wert");
  return missing;
}

function workflowClass(index: number, missingFields: string[]): string {
  if (!missingFields.length) return "quarterlyWorkflowStep-done";
  if (index === 0 && missingFields.includes("Fonds")) return "quarterlyWorkflowStep-error";
  if (index === 1 && missingFields.some((field) => field.includes("Quartalsbericht") || field === "Stichtag" || field === "Jahr")) return "quarterlyWorkflowStep-error";
  if (index === 2 && missingFields.includes("Excel-Datei")) return "quarterlyWorkflowStep-warning";
  if (index === 3 && missingFields.includes("PowerBI-Wert")) return "quarterlyWorkflowStep-warning";
  return "quarterlyWorkflowStep-done";
}

function stepLabel(index: number, fund: FundRecord | null, report: QuarterlyReportRecord | null, files: QuarterlyReportFileRecord[], links: QuarterlyReportPowerBiLinkRecord[], values: QuarterlyReportValueRecord[]): string {
  if (index === 0) return fund ? fund.fundName : "fehlt";
  if (index === 1) return report ? `${report.quarter}/${report.year}` : "offen";
  if (index === 2) return `${files.length} Dateien`;
  if (index === 3) return `${links.length} Werte`;
  if (index === 4) return `${values.filter((value) => value.isReviewed).length}/${values.length} geprueft`;
  return report && files.length && links.length ? "bereit" : "gesperrt";
}

function upsertById<T extends { id: string }>(rows: T[], row: T): T[] {
  return rows.some((item) => item.id === row.id) ? rows.map((item) => item.id === row.id ? row : item) : [row, ...rows];
}

function mergeManyById<T extends { id: string }>(rows: T[], incoming: T[]): T[] {
  return incoming.reduce((current, row) => upsertById(current, row), rows);
}

function workflowStatusLabel(status: ReportWorkflowStepStatus): string {
  if (status === "done") return "ok";
  if (status === "warning") return "Review";
  if (status === "error") return "fehlt";
  if (status === "active") return "laeuft";
  return "offen";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unbekannter Fehler im Quartalsbericht-Modul.";
}
