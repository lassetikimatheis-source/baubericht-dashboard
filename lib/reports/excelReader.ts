import type {
  ExcelAnalysisResult,
  ExtractedReportValue,
  ReportFileInfo,
  ReportMappingEntry,
  ReportSourceType,
  ReviewFinding
} from "./reportTypes";

const supportedSources: ReportSourceType[] = ["excelCell", "excelRange", "excelTable", "excelChart", "excelImage", "textBlock"];

export async function analyzeExcelFile(file: File | null, mapping: ReportMappingEntry[]): Promise<ExcelAnalysisResult> {
  if (!file) {
    return {
      file: null,
      supportedSources,
      sheets: [],
      findings: [finding("excel-missing", "error", "Excel-Datei fehlt", "Bitte eine Excel-Arbeitsdatei auswählen.")]
    };
  }

  const info = fileInfo(file);
  const sheets = Array.from(new Set(mapping.flatMap((entry) => "sheet" in entry.source ? [entry.source.sheet] : [])));

  return {
    file: info,
    supportedSources,
    sheets,
    findings: [
      finding("excel-loaded", "success", "Excel-Datei erkannt", `${info.name} wurde für die Analyse registriert.`),
      finding("excel-prepared", "info", "Excel-Extraktion vorbereitet", "Zellen, Ranges, Tabellen, Charts und Bilder sind als Quelltypen modelliert.")
    ]
  };
}

export async function extractMappedValues(file: File | null, mapping: ReportMappingEntry[]): Promise<ExtractedReportValue[]> {
  return mapping.map((entry) => {
    if (!file && isExcelSource(sourceTypeOf(entry))) {
      return {
        mappingId: entry.id,
        status: "missing",
        value: null,
        note: "Excel-Datei fehlt."
      };
    }

    if (entry.source.type === "textBlock" || entry.sourceType === "textBlock") {
      return {
        mappingId: entry.id,
        status: "ready",
        value: entry.reviewHint ?? "Review erforderlich.",
        note: "Textbaustein als definierte Quelle erkannt."
      };
    }

    return {
      mappingId: entry.id,
      status: "pending",
      value: null,
      note: `${sourceTypeOf(entry)} ist vorbereitet; echte Extraktion folgt im nächsten Schritt.`
    };
  });
}

export function fileInfo(file: File): ReportFileInfo {
  const extension = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() ?? "" : "";
  return {
    name: file.name,
    size: file.size,
    extension,
    loaded: true
  };
}

function sourceTypeOf(entry: ReportMappingEntry): ReportSourceType {
  return entry.source.type ?? entry.sourceType;
}

function isExcelSource(type: ReportSourceType): boolean {
  return type.startsWith("excel");
}

function finding(id: string, severity: ReviewFinding["severity"], title: string, message: string): ReviewFinding {
  return { id, severity, title, message };
}
