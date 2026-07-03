import type { ReportMappingEntry, ReportSection, ReportWorkflowStep } from "./reportTypes";

export const reportSections: ReportSection[] = [
  { key: "cover", label: "Deckblatt" },
  { key: "tableOfContents", label: "Inhaltsverzeichnis" },
  { key: "executiveSummary", label: "Executive Summary" },
  { key: "fundMasterData", label: "Fondsstammdaten" },
  { key: "fundKpis", label: "Fondskennzahlen" },
  { key: "nav", label: "NAV" },
  { key: "profitAndLoss", label: "GuV" },
  { key: "portfolioKpis", label: "Portfoliokennzahlen" },
  { key: "marketValueDevelopment", label: "Verkehrswertentwicklung" },
  { key: "financingOverview", label: "Finanzierungsübersicht" },
  { key: "portfolioOverview", label: "Portfolioüberblick" },
  { key: "lettingOverview", label: "Vermietungsübersicht" },
  { key: "operationalKpis", label: "Operative KPIs" },
  { key: "assetReports", label: "Objektberichte" },
  { key: "propertyDirectory", label: "Immobilienverzeichnis" },
  { key: "disclaimer", label: "Disclaimer" }
];

export const reportWorkflowSteps: ReportWorkflowStep[] = [
  { key: "fileLoaded", label: "Datei geladen" },
  { key: "mappingChecked", label: "Mapping geprüft" },
  { key: "dataExtracted", label: "Daten extrahiert" },
  { key: "reportCreated", label: "Bericht erstellt" },
  { key: "reviewRequired", label: "Review erforderlich" }
];

export const reportMapping: ReportMappingEntry[] = [
  {
    id: "fonds_name",
    label: "Fondsname",
    section: "cover",
    sourceType: "excelCell",
    source: {
      sheet: "Report_Export",
      cell: "B2"
    },
    target: {
      slide: 1,
      placeholder: "{{Fonds_Name}}"
    },
    type: "text",
    format: "text",
    required: true
  },
  {
    id: "bericht_stichtag",
    label: "Berichtsstichtag",
    section: "cover",
    sourceType: "excelCell",
    source: {
      sheet: "Report_Export",
      cell: "B4"
    },
    target: {
      slide: 1,
      placeholder: "{{Stichtag}}"
    },
    type: "text",
    format: "date",
    required: true
  },
  {
    id: "leerstand_quote",
    label: "Leerstandsquote",
    section: "lettingOverview",
    sourceType: "excelCell",
    source: {
      sheet: "Report_Export",
      cell: "B12"
    },
    target: {
      slide: 18,
      placeholder: "{{Leerstand_Quote}}"
    },
    type: "number",
    format: "percent",
    required: true
  },
  {
    id: "nav_aktuell",
    label: "NAV aktuell",
    section: "nav",
    sourceType: "excelCell",
    source: {
      sheet: "NAV",
      cell: "D8"
    },
    target: {
      slide: 7,
      placeholder: "{{NAV_Aktuell}}"
    },
    type: "number",
    format: "eur",
    required: true
  },
  {
    id: "guv_tabelle",
    label: "GuV-Tabelle",
    section: "profitAndLoss",
    sourceType: "excelRange",
    source: {
      sheet: "GuV",
      range: "A4:F18"
    },
    target: {
      slide: 8,
      shapeName: "GuV_Table"
    },
    type: "table",
    format: "number",
    reviewHint: "Tabellenlayout später gegen PPT-Template prüfen."
  },
  {
    id: "verkehrswert_chart",
    label: "Verkehrswertentwicklung Diagramm",
    section: "marketValueDevelopment",
    sourceType: "excelChart",
    source: {
      sheet: "Verkehrswerte",
      chartName: "chart_verkehrswertentwicklung"
    },
    target: {
      slide: 10,
      shapeName: "Verkehrswert_Chart"
    },
    type: "chart",
    format: "eur",
    reviewHint: "Chart-Export wird in einem späteren Schritt angebunden."
  },
  {
    id: "review_kommentar",
    label: "Review-Kommentar",
    section: "disclaimer",
    sourceType: "textBlock",
    source: {
      key: "review_required"
    },
    target: {
      slide: 30,
      placeholder: "{{Review_Hinweis}}"
    },
    type: "comment",
    format: "text",
    reviewHint: "Automatisch erzeugte Entwürfe bleiben reviewpflichtig."
  }
];
