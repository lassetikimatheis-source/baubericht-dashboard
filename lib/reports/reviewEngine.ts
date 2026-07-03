import { reportSections } from "./reportMapping";
import type {
  ExtractedReportValue,
  PlaceholderPreview,
  ReportMappingEntry,
  ReviewFinding
} from "./reportTypes";

export function reviewMapping(mapping: ReportMappingEntry[], extractedValues: ExtractedReportValue[]): ReviewFinding[] {
  if (!mapping.length) {
    return [{ id: "mapping-empty", severity: "error", title: "Mapping fehlt", message: "Es sind keine Mapping-Einträge vorhanden." }];
  }

  const valuesById = new Map(extractedValues.map((value) => [value.mappingId, value]));
  return mapping.flatMap((entry) => {
    const findings: ReviewFinding[] = [];
    const value = valuesById.get(entry.id);

    if (!entry.target.placeholder && !entry.target.shapeName) {
      findings.push({ id: `target-${entry.id}`, severity: "warning", title: "Platzhalter fehlt", message: `${entry.label} hat kein Ziel in der PowerPoint-Vorlage definiert.`, mappingId: entry.id });
    }

    if (!value || value.status === "missing") {
      findings.push({ id: `value-${entry.id}`, severity: "warning", title: "Excel-Wert leer", message: `${entry.label} konnte noch nicht aus der Quelle gelesen werden.`, mappingId: entry.id });
    }

    if ((entry.source.type ?? entry.sourceType) === "excelChart" && value?.status !== "ready") {
      findings.push({ id: `chart-${entry.id}`, severity: "warning", title: "Diagramm nicht gefunden", message: `${entry.label} ist als Diagramm vorbereitet, aber noch nicht extrahiert.`, mappingId: entry.id });
    }

    if (entry.reviewHint) {
      findings.push({ id: `hint-${entry.id}`, severity: "info", title: "Review-Hinweis", message: entry.reviewHint, mappingId: entry.id });
    }

    return findings;
  });
}

export function createPreviewRows(mapping: ReportMappingEntry[], extractedValues: ExtractedReportValue[]): PlaceholderPreview[] {
  const valuesById = new Map(extractedValues.map((value) => [value.mappingId, value]));

  return mapping.map((entry) => {
    const value = valuesById.get(entry.id);
    const hasTarget = Boolean(entry.target.placeholder || entry.target.shapeName);
    const status: PlaceholderPreview["status"] = !hasTarget ? "warning" : value?.status === "ready" ? "success" : "info";

    return {
      id: entry.id,
      label: entry.label,
      section: reportSections.find((section) => section.key === entry.section)?.label ?? entry.section,
      source: formatSource(entry),
      target: `Folie ${entry.target.slide} / ${entry.target.placeholder ?? entry.target.shapeName ?? "kein Ziel"}`,
      type: entry.type,
      format: entry.format,
      status,
      note: value?.note ?? "Noch nicht analysiert."
    };
  });
}

export function severityLabel(severity: ReviewFinding["severity"]): string {
  if (severity === "success") return "OK";
  if (severity === "warning") return "Hinweis";
  if (severity === "error") return "Fehler";
  return "Info";
}

function formatSource(entry: ReportMappingEntry): string {
  const sourceType = entry.source.type ?? entry.sourceType;
  if ("cell" in entry.source) return `${sourceType}: ${entry.source.sheet}!${entry.source.cell}`;
  if ("range" in entry.source) return `${sourceType}: ${entry.source.sheet}!${entry.source.range}`;
  if ("tableName" in entry.source) return `${sourceType}: ${entry.source.sheet}/${entry.source.tableName}`;
  if ("chartName" in entry.source) return `${sourceType}: ${entry.source.sheet}/${entry.source.chartName}`;
  if ("imageName" in entry.source) return `${sourceType}: ${entry.source.sheet}/${entry.source.imageName}`;
  if ("measure" in entry.source) return `${sourceType}: ${entry.source.measure}`;
  return `${sourceType}: ${entry.source.key}`;
}
