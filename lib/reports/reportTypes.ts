export type ReportSourceType =
  | "excelCell"
  | "excelRange"
  | "excelTable"
  | "excelChart"
  | "excelImage"
  | "textBlock"
  | "powerBiMeasure";

export type ReportValueType = "text" | "number" | "table" | "chart" | "image" | "comment";

export type ReportFormat = "eur" | "percent" | "sqm" | "date" | "text" | "number";

export interface ExcelCellSource {
  type?: "excelCell";
  sheet: string;
  cell: string;
}

export interface ExcelRangeSource {
  type?: "excelRange";
  sheet: string;
  range: string;
}

export interface ExcelTableSource {
  type?: "excelTable";
  sheet: string;
  tableName: string;
}

export interface ExcelChartSource {
  type?: "excelChart";
  sheet: string;
  chartName: string;
}

export interface ExcelImageSource {
  type?: "excelImage";
  sheet: string;
  imageName: string;
}

export interface TextBlockSource {
  type?: "textBlock";
  key: string;
}

export interface PowerBiMeasureSource {
  type?: "powerBiMeasure";
  workspace?: string;
  dataset?: string;
  measure: string;
}

export type ReportMappingSource =
  | ExcelCellSource
  | ExcelRangeSource
  | ExcelTableSource
  | ExcelChartSource
  | ExcelImageSource
  | TextBlockSource
  | PowerBiMeasureSource;

export interface ReportMappingTarget {
  slide: number;
  placeholder?: string;
  shapeName?: string;
}

export interface ReportMappingEntry {
  id: string;
  label: string;
  section: ReportSectionKey;
  sourceType: ReportSourceType;
  source: ReportMappingSource;
  target: ReportMappingTarget;
  type: ReportValueType;
  format: ReportFormat;
  required?: boolean;
  reviewHint?: string;
}

export type ReportSectionKey =
  | "cover"
  | "tableOfContents"
  | "executiveSummary"
  | "fundMasterData"
  | "fundKpis"
  | "nav"
  | "profitAndLoss"
  | "portfolioKpis"
  | "marketValueDevelopment"
  | "financingOverview"
  | "portfolioOverview"
  | "lettingOverview"
  | "operationalKpis"
  | "assetReports"
  | "propertyDirectory"
  | "disclaimer";

export interface ReportSection {
  key: ReportSectionKey;
  label: string;
}

export type ReportWorkflowStepKey =
  | "fileLoaded"
  | "mappingChecked"
  | "dataExtracted"
  | "reportCreated"
  | "reviewRequired"
  | "files"
  | "mapping"
  | "analysis"
  | "preview"
  | "report";

export type ReportWorkflowStepStatus = "idle" | "active" | "done" | "warning" | "error";

export type ReviewSeverity = "success" | "warning" | "error" | "info";

export interface ReportWorkflowStep {
  key: ReportWorkflowStepKey;
  label: string;
  description?: string;
}

export interface PlaceholderPreview {
  id: string;
  label: string;
  section: string;
  source: string;
  target: string;
  type: ReportValueType;
  format: ReportFormat;
  status: "ready" | "success" | "warning" | "missing" | "error" | "info";
  note: string;
}

export interface ReportFileInfo {
  name: string;
  size: number;
  extension: string;
  loaded: boolean;
}

export interface ReviewFinding {
  id: string;
  severity: ReviewSeverity;
  title: string;
  message: string;
  mappingId?: string;
}

export interface ExcelAnalysisResult {
  file: ReportFileInfo | null;
  supportedSources: ReportSourceType[];
  sheets: string[];
  findings: ReviewFinding[];
}

export interface PowerPointTemplateResult {
  file: ReportFileInfo | null;
  placeholderScanSupported: boolean;
  findings: ReviewFinding[];
}

export interface ExtractedReportValue {
  mappingId: string;
  status: "pending" | "ready" | "empty" | "unsupported" | "missing";
  value: string | number | string[][] | null;
  note: string;
}

export interface DraftExportResult {
  fileName: string;
  created: boolean;
  message: string;
}

export interface ReportEngineInput {
  excelFile: File | null;
  templateFile: File | null;
  mapping: ReportMappingEntry[];
}

export interface ReportEngineResult {
  files: {
    excel: ReportFileInfo | null;
    template: ReportFileInfo | null;
  };
  mappingStatus: {
    loaded: boolean;
    total: number;
    required: number;
  };
  excelAnalysis: ExcelAnalysisResult;
  templateAnalysis: PowerPointTemplateResult;
  extractedValues: ExtractedReportValue[];
  preview: PlaceholderPreview[];
  review: ReviewFinding[];
  exportResult: DraftExportResult;
  log: string[];
  stepStatuses: Partial<Record<ReportWorkflowStepKey, ReportWorkflowStepStatus>>;
}
