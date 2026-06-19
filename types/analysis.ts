export type ExtractedValue<T> = T | null;

export type MeasureCluster =
  | "Bad"
  | "Bad / Fliesen"
  | "Kueche"
  | "Boden"
  | "Elektro"
  | "Maler"
  | "Malerarbeiten"
  | "Planung / Dokumentation"
  | "Reinigung"
  | "Sanitaer / Heizung"
  | "Tueren / Fenster"
  | "Tueren"
  | "Fenster"
  | "Heizung"
  | "Sonstiges";

export type CostAllocation = "GE" | "SE" | null;

export type ProcessingStatus =
  | "uploaded"
  | "processing"
  | "review_required"
  | "extracted"
  | "duplicate";

export interface FieldSource {
  documentId: string;
  fileName: string;
  method?: "Regex" | "KI" | "Berechnung" | "Manuell";
  page?: number | null;
  sheet?: string | null;
  cell?: string | null;
  textSnippet?: string | null;
  confidence?: number | null;
}

export interface ExtractedField<T> {
  value: ExtractedValue<T>;
  sources: FieldSource[];
  confidence: number | null;
}

export interface SourceDocument {
  id: string;
  fileName: string;
  fileType: "pdf" | "xlsx" | "xls" | "csv" | "png" | "jpg" | "jpeg" | "unknown";
  uploadedAt: string;
  status: ProcessingStatus;
  textLength: number;
  fileSize?: number;
  parseDebug?: DocumentParseDebug;
  duplicateOf?: string | null;
  issues: string[];
}

export interface DocumentParseDebug {
  fileName: string;
  fileType: string;
  fileSize: number;
  textLength: number;
  textPreview: string;
  amountMatches: string[];
  objectNumberMatches: string[];
  addressMatches: string[];
  ocrUsed: boolean;
  ocrAvailable: boolean;
  status: "read" | "scan_detected" | "ocr_unavailable" | "error";
}

export interface MeasureItem {
  id: string;
  cluster: ExtractedField<MeasureCluster>;
  description: ExtractedField<string>;
  totalCost: ExtractedField<number>;
  allocation: ExtractedField<CostAllocation>;
  sourceDocumentId: string;
  lineItems?: LineItem[];
}

export interface MeasureDetail {
  abschnitt: string;
  cluster: MeasureCluster;
  summe: number | null;
  beschreibung: string;
  quelle: string;
}

export interface MeasureDebugInfo {
  headings: Array<{
    section: number;
    heading: string;
    raw: string;
  }>;
  sumLines: Array<{
    section: number;
    heading: string;
    value: number | null;
    raw: string;
  }>;
  mappings: Array<{
    section: number;
    heading: string;
    cluster: MeasureCluster;
    value: number | null;
    description: string;
  }>;
  notes: string[];
}

export interface LineItem {
  position: string;
  quantity: ExtractedValue<number>;
  unit: ExtractedValue<string>;
  description: ExtractedValue<string>;
  unitPrice: ExtractedValue<number>;
  totalPrice: ExtractedValue<number>;
  source: FieldSource;
}

export interface ObjectAnalysis {
  id: string;
  aiAgentName: ExtractedField<string>;
  confidenceScore: ExtractedField<number>;
  projectSuggestion: ExtractedField<string>;
  assignmentSuggestion: ExtractedField<string>;
  documentType: ExtractedField<string>;
  projectType: ExtractedField<string>;
  provider: ExtractedField<string>;
  year: ExtractedField<number>;
  fund: ExtractedField<string>;
  objectNumber: ExtractedField<string>;
  apartmentNumber: ExtractedField<string>;
  objectAddress: ExtractedField<string>;
  location: ExtractedField<string>;
  documentDate: ExtractedField<string>;
  documentNumber: ExtractedField<string>;
  renovatedApartmentCount: ExtractedField<number>;
  renovatedApartments: ExtractedField<string[]>;
  livingAreaSqm: ExtractedField<number>;
  totalAreaSqm: ExtractedField<number>;
  renovatedAreaSqm: ExtractedField<number>;
  netCost: ExtractedField<number>;
  vatCost: ExtractedField<number>;
  totalCost: ExtractedField<number>;
  costPerApartment: ExtractedField<number>;
  costPerSqm: ExtractedField<number>;
  measureDescription: ExtractedField<string>;
  dataQuality: ExtractedField<string>;
  missingInformation: ExtractedField<string[]>;
  costDebug: CostDebugInfo | null;
  measureDetails?: MeasureDetail[];
  measureDebug?: MeasureDebugInfo | null;
  clusters: MeasureItem[];
  sourceDocumentIds: string[];
}

export interface RegexMatchDebug {
  label: string;
  value: number | null;
  raw: string;
  source: "Regex" | "KI" | "Berechnung" | "Manuell";
}

export interface CostDebugInfo {
  summaryBlock: string | null;
  matches: RegexMatchDebug[];
  finalValues: {
    net: RegexMatchDebug;
    vat: RegexMatchDebug;
    gross: RegexMatchDebug;
  };
  notes: string[];
}

export interface DuplicateFinding {
  documentId: string;
  duplicateOf: string;
  reason: string;
}

export interface PortfolioAnalysisState {
  year: ExtractedField<number>;
  fund: ExtractedField<string>;
  objects: ObjectAnalysis[];
  sourceDocuments: SourceDocument[];
  clusterSummary: MeasureItem[];
  totalCost: ExtractedField<number>;
  averageCostPerApartment: ExtractedField<number>;
  averageCostPerSqm: ExtractedField<number>;
  reviewRequiredCount: number;
  duplicates: DuplicateFinding[];
  issues: string[];
}
