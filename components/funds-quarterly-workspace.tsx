"use client";

import { useEffect, useMemo, useState } from "react";
import {
  loadQuarterlyReportBundle,
  type FundRecord,
  type QuarterlyReportFileRecord,
  type QuarterlyReportPowerBiLinkRecord,
  type QuarterlyReportRecord,
  type QuarterlyReportValueRecord
} from "../lib/supabase";

type FundTab = "overview" | "reports" | "excel" | "powerbi" | "energy" | "documents";
type Message = { type: "info" | "success" | "error"; text: string };

interface EnergyCertificate {
  id: string;
  fundId: string;
  objectLabel: string;
  fileName: string;
  validUntil: string;
  energyValue: string;
  status: string;
}

interface FundDocument {
  id: string;
  fundId: string;
  documentType: string;
  title: string;
  fileName: string;
  status: string;
}

const fundTabs: Array<{ key: FundTab; label: string }> = [
  { key: "overview", label: "Uebersicht" },
  { key: "reports", label: "Quartalsberichte" },
  { key: "excel", label: "Excel-Quellen" },
  { key: "powerbi", label: "PowerBI-Verbindungen" },
  { key: "energy", label: "Energieausweise" },
  { key: "documents", label: "Dokumente/Quellen" }
];

const demoEnergyCertificates: EnergyCertificate[] = [
  { id: "energy-fonds-22-1", fundId: "local-fonds-22", objectLabel: "Objekt 1", fileName: "Energieausweis_Fonds22_Objekt1.pdf", validUntil: "2030-12-31", energyValue: "92 kWh/m2a", status: "gueltig" }
];

const demoDocuments: FundDocument[] = [
  { id: "doc-fonds-22-1", fundId: "local-fonds-22", documentType: "Quelle", title: "Bewertungsannahmen", fileName: "Bewertungsannahmen_Fonds22.xlsx", status: "aktiv" }
];

const localFallbackFunds: FundRecord[] = [
  { id: "local-fonds-9", fundName: "Fonds 9", fundNumber: "Fonds 9", address: "Hamburg", company: "Paribus", commercialRegisterNumber: "HRB offen", currentValue: "EUR 42,1 Mio.", objectCount: 6, contactPerson: "Asset Management", status: "active", remark: "Lokaler Beispiel-Fonds", updatedAt: "" },
  { id: "local-fonds-22", fundName: "Fonds 22", fundNumber: "Fonds 22", address: "Hamburg", company: "Paribus", commercialRegisterNumber: "HRB offen", currentValue: "EUR 67,0 Mio.", objectCount: 9, contactPerson: "Portfolio Management", status: "active", remark: "Lokaler Beispiel-Fonds", updatedAt: "" },
  { id: "local-paif-1", fundName: "PAIF 1", fundNumber: "PAIF 1", address: "Hamburg", company: "Paribus", commercialRegisterNumber: "HRB offen", currentValue: "EUR 118,4 Mio.", objectCount: 14, contactPerson: "Fund Management", status: "active", remark: "Lokaler Beispiel-Fonds", updatedAt: "" },
  { id: "local-paif-2", fundName: "PAIF 2", fundNumber: "PAIF 2", address: "Hamburg", company: "Paribus", commercialRegisterNumber: "HRB offen", currentValue: "EUR 94,8 Mio.", objectCount: 11, contactPerson: "Fund Management", status: "active", remark: "Lokaler Beispiel-Fonds", updatedAt: "" }
];

export function FundsQuarterlyWorkspace() {
  const [funds, setFunds] = useState<FundRecord[]>([]);
  const [reports, setReports] = useState<QuarterlyReportRecord[]>([]);
  const [files, setFiles] = useState<QuarterlyReportFileRecord[]>([]);
  const [powerBiLinks, setPowerBiLinks] = useState<QuarterlyReportPowerBiLinkRecord[]>([]);
  const [values, setValues] = useState<QuarterlyReportValueRecord[]>([]);
  const [selectedFundId, setSelectedFundId] = useState("");
  const [activeTab, setActiveTab] = useState<FundTab>("overview");
  const [message, setMessage] = useState<Message>({ type: "info", text: "Fondsbereich wird geladen." });

  useEffect(() => {
    void refreshBundle();
  }, []);

  const selectedFund = funds.find((fund) => fund.id === selectedFundId) ?? null;
  const fundReports = reports.filter((report) => report.fundId === selectedFundId);
  const fundFiles = files.filter((file) => file.fundId === selectedFundId);
  const fundPowerBiLinks = powerBiLinks.filter((link) => link.fundId === selectedFundId);
  const fundValues = values.filter((value) => value.fundId === selectedFundId);
  const fundEnergyCertificates = demoEnergyCertificates.filter((certificate) => certificate.fundId === selectedFundId);
  const fundDocuments = demoDocuments.filter((document) => document.fundId === selectedFundId);
  const selectedFundLastReport = useMemo(() => latestReportLabel(fundReports), [fundReports]);

  async function refreshBundle() {
    try {
      const bundle = await loadQuarterlyReportBundle();
      setFunds(bundle.funds);
      setReports(bundle.reports);
      setFiles(bundle.files);
      setPowerBiLinks(bundle.powerBiLinks);
      setValues(bundle.values);
      setSelectedFundId((current) => current || bundle.funds[0]?.id || "");
      const usesLocalFallback = bundle.funds.some((fund) => fund.id.startsWith("local-"));
      setMessage({
        type: usesLocalFallback ? "info" : "success",
        text: usesLocalFallback
          ? "Lokale Beispiel-Fonds aktiv. Bitte supabase/quarterly-reports-schema.sql im Supabase SQL Editor ausfuehren."
          : "Fonds und Quartalsbericht-Zuordnungen geladen."
      });
    } catch (error) {
      if (isMissingQuarterlySchemaMessage(error)) {
        setFunds(localFallbackFunds);
        setReports([]);
        setFiles([]);
        setPowerBiLinks([]);
        setValues([]);
        setSelectedFundId((current) => current || localFallbackFunds[0]?.id || "");
        setMessage({ type: "info", text: "Lokale Beispiel-Fonds aktiv. Supabase kennt public.funds noch nicht; bitte supabase/quarterly-reports-schema.sql im SQL Editor ausfuehren." });
        return;
      }
      setMessage({ type: "error", text: errorMessage(error) });
    }
  }

  if (!selectedFund) {
    return (
      <div className="quarterlyProduct">
        <section className="quarterlyProductHeader">
          <div>
            <p className="eyebrow">Fonds</p>
            <h2>Fonds-Struktur</h2>
            <p className="muted">Quartalsberichte, Excel-Dateien, PowerBI-Verbindungen und Quellen werden fondsbezogen verwaltet.</p>
          </div>
          <div className={`quarterlyMessage quarterlyMessage-${message.type}`}>{message.text}</div>
        </section>
        <section className="panel"><p className="muted">Keine Fonds geladen. Bitte Migration ausfuehren oder Fonds anlegen.</p></section>
      </div>
    );
  }

  return (
    <div className="quarterlyProduct">
      <section className="quarterlyDirectoryHeader">
        <div>
          <p className="eyebrow">Fonds</p>
          <h2>Quartalsberichte nach Fonds</h2>
          <p className="muted">Fonds auswaehlen, dann Stammdaten, Berichte und alle Quellen im Detail sehen.</p>
        </div>
        <div className="quarterlyDirectoryStats">
          <span><strong>{funds.length}</strong> Fonds</span>
          <span><strong>{reports.length}</strong> Berichte</span>
          <span><strong>{files.length + powerBiLinks.length}</strong> Quellen</span>
        </div>
      </section>
      <div className={`quarterlyMessage quarterlyMessage-${message.type}`}>{message.text}</div>

      <section className="quarterlyFundCards">
        {funds.map((fund) => {
          const reportsForFund = reports.filter((report) => report.fundId === fund.id);
          const fileCount = files.filter((file) => file.fundId === fund.id).length;
          const powerBiCount = powerBiLinks.filter((link) => link.fundId === fund.id).length;
          const isSelected = fund.id === selectedFundId;
          return (
            <button className={`quarterlyFundCard ${isSelected ? "quarterlyFundCardActive" : ""}`} type="button" key={fund.id} onClick={() => { setSelectedFundId(fund.id); setActiveTab("overview"); }}>
              <div className="quarterlyFundCardTop">
                <span>{fund.status || "Status offen"}</span>
                <em>{latestReportLabel(reportsForFund)}</em>
              </div>
              <strong>{fund.fundName}</strong>
              <small>Nr. {fund.fundNumber} · {fund.company || "Gesellschaft offen"}</small>
              <div className="quarterlyFundCardValue">
                <span>Verkehrswert / aktueller Wert</span>
                <strong>{fund.currentValue || "nicht hinterlegt"}</strong>
              </div>
              <div className="quarterlyFundMiniStats">
                <span><strong>{fund.objectCount || 0}</strong> Objekte</span>
                <span><strong>{reportsForFund.length}</strong> Berichte</span>
                <span><strong>{fileCount + powerBiCount}</strong> Quellen</span>
              </div>
              <dl>
                <div><dt>Adresse/Sitz</dt><dd>{fund.address || "nicht hinterlegt"}</dd></div>
                <div><dt>Handelsregister</dt><dd>{fund.commercialRegisterNumber || "nicht hinterlegt"}</dd></div>
                <div><dt>Ansprechpartner</dt><dd>{fund.contactPerson || "nicht hinterlegt"}</dd></div>
              </dl>
            </button>
          );
        })}
      </section>

      <section className="quarterlyFundDetail">
        <div className="quarterlyFundDetailHeader">
          <div>
            <button className="quarterlyBackButton" type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>Zur Fondsuebersicht</button>
            <p className="eyebrow">Fonds-Detail</p>
            <h3>{selectedFund.fundName}</h3>
            <p className="muted">{selectedFund.company || "Gesellschaft offen"} | {selectedFund.address || "Sitz offen"}</p>
          </div>
          <div className="quarterlyFundDetailMeta">
            <span>Aktueller Wert</span>
            <strong>{selectedFund.currentValue || "Wert offen"}</strong>
            <small>Letzter Bericht: {selectedFundLastReport}</small>
          </div>
        </div>

        <nav className="quarterlyTabs" aria-label="Fonds-Bereiche">
          {fundTabs.map((tab) => <button type="button" className={activeTab === tab.key ? "active" : ""} key={tab.key} onClick={() => setActiveTab(tab.key)}>{tab.label}</button>)}
        </nav>

        {activeTab === "overview" ? <OverviewTab fund={selectedFund} reports={fundReports} files={fundFiles} powerBiLinks={fundPowerBiLinks} values={fundValues} /> : null}
        {activeTab === "reports" ? <ReportsTab reports={fundReports} fund={selectedFund} /> : null}
        {activeTab === "excel" ? <ExcelTab files={fundFiles} fund={selectedFund} /> : null}
        {activeTab === "powerbi" ? <PowerBiTab links={fundPowerBiLinks} fund={selectedFund} /> : null}
        {activeTab === "energy" ? <EnergyTab certificates={fundEnergyCertificates} fund={selectedFund} /> : null}
        {activeTab === "documents" ? <DocumentsTab documents={fundDocuments} fund={selectedFund} /> : null}
      </section>
    </div>
  );
}

function OverviewTab({ fund, reports, files, powerBiLinks, values }: { fund: FundRecord; reports: QuarterlyReportRecord[]; files: QuarterlyReportFileRecord[]; powerBiLinks: QuarterlyReportPowerBiLinkRecord[]; values: QuarterlyReportValueRecord[] }) {
  return (
    <div className="quarterlyDetailGrid">
      <article className="panel quarterlyDetailPanel"><h3>Stammdaten</h3><InfoGrid rows={[["Fondsname", fund.fundName], ["Fondsnummer", fund.fundNumber], ["Adresse/Sitz", fund.address || "nicht hinterlegt"], ["Gesellschaft", fund.company || "nicht hinterlegt"], ["Handelsregisternummer", fund.commercialRegisterNumber || "nicht hinterlegt"], ["Status", fund.status || "offen"], ["Ansprechpartner", fund.contactPerson || "nicht hinterlegt"]]} /></article>
      <article className="panel quarterlyDetailPanel"><h3>Wertentwicklung</h3><div className="quarterlyKpiRow"><span><strong>{fund.currentValue || "offen"}</strong> aktueller Wert</span><span><strong>{fund.objectCount || 0}</strong> Objekte</span><span><strong>{reports.length}</strong> Berichte</span></div></article>
      <article className="panel quarterlyDetailPanel"><h3>Wichtige Kennzahlen</h3><div className="quarterlyKpiRow"><span><strong>{files.length}</strong> Excel-Quellen</span><span><strong>{powerBiLinks.length}</strong> PowerBI-Werte</span><span><strong>{values.filter((value) => value.isReviewed).length}</strong> geprueft</span></div></article>
      <article className="panel quarterlyDetailPanel"><h3>Letzte Aenderungen</h3><div className="quarterlySourceList"><SourceRow title="Fonds-Stammdaten" subtitle={fund.updatedAt || "noch kein Zeitstempel"} meta={fund.status || "offen"} /><SourceRow title="Letzter Quartalsbericht" subtitle={latestReportLabel(reports)} meta={`${reports.length} Berichte`} /></div></article>
    </div>
  );
}

function ReportsTab({ reports, fund }: { reports: QuarterlyReportRecord[]; fund: FundRecord }) {
  return <SourcePanel title="Quartalsberichte" intro={`${fund.fundName}: alle vorhandenen Quartalsberichte in zeitlicher Reihenfolge.`} empty="Keine Quartalsberichte fuer diesen Fonds vorhanden.">{reports.map((report) => <SourceRow key={report.id} title={`${report.quarter}/${report.year} - Stichtag ${report.reportDate}`} subtitle={`Version ${report.version} | Bearbeiter ${report.editor || "offen"} | Fonds ${fund.fundName}`} meta={report.status} actions={["oeffnen", "exportieren"]} />)}</SourcePanel>;
}

function ExcelTab({ files, fund }: { files: QuarterlyReportFileRecord[]; fund: FundRecord }) {
  return <SourcePanel title="Excel-Quellen" intro="Mieterliste, Verkehrswerte, CapEx, Budget, Leerstand und sonstige Dateien je Fonds." empty="Keine Excel-Dateien fuer diesen Fonds hinterlegt.">{files.map((file) => <SourceRow key={file.id} title={`${file.fileType}: ${file.fileName}`} subtitle={`${fund.fundName} | ${file.assignedQuarter}/${file.assignedYear} | Blatt ${file.sheetName || "offen"} | Zellen/Spalten ${file.relevantCells || file.relevantColumns || "offen"}`} meta={file.importStatus} actions={["Datei oeffnen", "Quelle bearbeiten"]} />)}</SourcePanel>;
}

function PowerBiTab({ links, fund }: { links: QuarterlyReportPowerBiLinkRecord[]; fund: FundRecord }) {
  return <SourcePanel title="PowerBI-Verbindungen" intro="Workspace, Report, Dataset, Kennzahlen und letzter Sync je Fonds." empty="Keine PowerBI-Verbindungen fuer diesen Fonds hinterlegt.">{links.map((link) => <SourceRow key={link.id} title={`${link.metric} - ${link.value || link.manualValue || "Wert offen"}`} subtitle={`${fund.fundName} | ${link.workspace} | ${link.reportDashboard} | Dataset ${link.dataset} | Quelle ${link.sourceCell || "offen"} | Stichtag ${link.reportDate}`} meta={link.lastSyncAt || "kein Sync"} actions={["Werte oeffnen", "bearbeiten"]} />)}</SourcePanel>;
}

function EnergyTab({ certificates, fund }: { certificates: EnergyCertificate[]; fund: FundRecord }) {
  return <SourcePanel title="Energieausweise" intro="Energieausweise mit Objektzuordnung, Gueltigkeit und Kennwerten." empty="Keine Energieausweise fuer diesen Fonds hinterlegt.">{certificates.map((certificate) => <SourceRow key={certificate.id} title={certificate.fileName} subtitle={`${fund.fundName} | Objekt ${certificate.objectLabel} | gueltig bis ${certificate.validUntil} | Kennwert ${certificate.energyValue}`} meta={certificate.status} actions={["Datei oeffnen", "Objektzuordnung"]} />)}</SourcePanel>;
}

function DocumentsTab({ documents, fund }: { documents: FundDocument[]; fund: FundRecord }) {
  return <SourcePanel title="Dokumente/Quellen" intro="Alle sonstigen Quellen mit eindeutiger Fondszuordnung." empty="Keine sonstigen Quellen fuer diesen Fonds hinterlegt.">{documents.map((document) => <SourceRow key={document.id} title={document.title} subtitle={`${fund.fundName} | ${document.documentType} | ${document.fileName || "keine Datei"}`} meta={document.status} actions={["Upload", "oeffnen", "bearbeiten"]} />)}</SourcePanel>;
}

function SourcePanel({ title, intro, empty, children }: { title: string; intro: string; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return <article className="panel quarterlyDetailPanel"><div className="panelHeader compactHeader"><div><h3>{title}</h3><p>{intro}</p></div></div><div className="quarterlySourceList">{hasChildren ? children : <p className="quarterlyEmpty">{empty}</p>}</div></article>;
}

function InfoGrid({ rows }: { rows: Array<[string, string]> }) {
  return <dl className="quarterlyInfoGrid">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

function SourceRow({ title, subtitle, meta, actions = [] }: { title: string; subtitle: string; meta: string; actions?: string[] }) {
  return <div className="quarterlySourceRow"><div><strong>{title}</strong><span>{subtitle}</span></div><em>{meta}</em>{actions.length ? <div className="quarterlySourceActions">{actions.map((action) => <button type="button" key={action}>{action}</button>)}</div> : null}</div>;
}

function latestReportLabel(reports: QuarterlyReportRecord[]): string {
  const latest = [...reports].sort((a, b) => `${b.year}${b.quarter}`.localeCompare(`${a.year}${a.quarter}`))[0];
  return latest ? `${latest.quarter}/${latest.year}` : "kein Bericht";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unbekannter Fehler im Quartalsbericht-Modul.";
}

function isMissingQuarterlySchemaMessage(error: unknown): boolean {
  const text = errorMessage(error).toLowerCase();
  return text.includes("pgrst205") || text.includes("could not find the table") || text.includes("schema cache") || text.includes("public.funds");
}
