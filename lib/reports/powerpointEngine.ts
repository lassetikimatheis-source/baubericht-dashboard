import { fileInfo } from "./excelReader";
import type {
  DraftExportResult,
  ExtractedReportValue,
  PowerPointTemplateResult,
  ReportMappingEntry,
  ReportMappingTarget,
  ReviewFinding
} from "./reportTypes";

export async function loadTemplate(file: File | null): Promise<PowerPointTemplateResult> {
  if (!file) {
    return {
      file: null,
      placeholderScanSupported: false,
      findings: [{ id: "ppt-missing", severity: "error", title: "PowerPoint-Template fehlt", message: "Bitte eine .pptx- oder .potx-Vorlage auswählen." }]
    };
  }

  return {
    file: fileInfo(file),
    placeholderScanSupported: false,
    findings: [
      { id: "ppt-loaded", severity: "success", title: "PowerPoint-Template erkannt", message: `${file.name} wurde für den Entwurf registriert.` },
      { id: "ppt-dummy-parser", severity: "info", title: "Platzhalterprüfung vorbereitet", message: "Die echte PPTX-Shape-Analyse ist noch nicht aktiviert." }
    ]
  };
}

export async function findPlaceholder(target: ReportMappingTarget): Promise<boolean> {
  return Boolean(target.placeholder || target.shapeName);
}

export async function replaceText(entry: ReportMappingEntry, value: ExtractedReportValue): Promise<ReviewFinding> {
  return replacementFinding(entry, value, "Text-Ersetzung vorbereitet");
}

export async function replaceTable(entry: ReportMappingEntry, value: ExtractedReportValue): Promise<ReviewFinding> {
  return replacementFinding(entry, value, "Tabellen-Ersetzung vorbereitet");
}

export async function replaceChart(entry: ReportMappingEntry, value: ExtractedReportValue): Promise<ReviewFinding> {
  return replacementFinding(entry, value, "Diagramm-Ersetzung vorbereitet");
}

export async function replaceImage(entry: ReportMappingEntry, value: ExtractedReportValue): Promise<ReviewFinding> {
  return replacementFinding(entry, value, "Bild-Ersetzung vorbereitet");
}

export async function exportDraft(templateFile: File | null): Promise<DraftExportResult> {
  if (!templateFile) {
    return {
      fileName: "",
      created: false,
      message: "Kein Entwurf exportiert, da das PowerPoint-Template fehlt."
    };
  }

  return {
    fileName: templateFile.name.replace(/\.(pptx|potx)$/i, "_quartalsbericht_entwurf.pptx"),
    created: false,
    message: "Dummy-Export: Die Vorlage wurde noch nicht verändert. Der Export-Hook ist vorbereitet."
  };
}

function replacementFinding(entry: ReportMappingEntry, value: ExtractedReportValue, title: string): ReviewFinding {
  return {
    id: `replace-${entry.id}`,
    severity: value.status === "ready" ? "success" : "info",
    title,
    message: `${entry.label}: ${value.note}`,
    mappingId: entry.id
  };
}
