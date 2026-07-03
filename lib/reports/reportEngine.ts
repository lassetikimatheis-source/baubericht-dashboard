import { analyzeExcelFile, extractMappedValues } from "./excelReader";
import { createPreviewRows, reviewMapping } from "./reviewEngine";
import { exportDraft, findPlaceholder, loadTemplate, replaceChart, replaceImage, replaceTable, replaceText } from "./powerpointEngine";
import type { ReportEngineInput, ReportEngineResult, ReviewFinding } from "./reportTypes";

export async function runQuarterlyReportWorkflow(input: ReportEngineInput): Promise<ReportEngineResult> {
  const log: string[] = [];
  log.push("Workflow gestartet.");

  const mappingStatus = {
    loaded: input.mapping.length > 0,
    total: input.mapping.length,
    required: input.mapping.filter((entry) => entry.required).length
  };
  log.push(`Mapping geladen: ${mappingStatus.total} Einträge, ${mappingStatus.required} Pflichtwerte.`);

  const excelAnalysis = await analyzeExcelFile(input.excelFile, input.mapping);
  log.push(input.excelFile ? `Excel-Datei erkannt: ${input.excelFile.name}.` : "Excel-Datei fehlt.");

  const templateAnalysis = await loadTemplate(input.templateFile);
  log.push(input.templateFile ? `PowerPoint-Template erkannt: ${input.templateFile.name}.` : "PowerPoint-Template fehlt.");

  const extractedValues = await extractMappedValues(input.excelFile, input.mapping);
  log.push("Extraktionsplan erstellt. Echte Excel-Werte werden im nächsten Schritt gelesen.");

  const replacementFindings: ReviewFinding[] = [];
  for (const entry of input.mapping) {
    const hasPlaceholder = await findPlaceholder(entry.target);
    const value = extractedValues.find((item) => item.mappingId === entry.id) ?? {
      mappingId: entry.id,
      status: "missing" as const,
      value: null,
      note: "Kein Extraktionsergebnis vorhanden."
    };

    if (!hasPlaceholder) {
      replacementFindings.push({
        id: `placeholder-${entry.id}`,
        severity: "warning",
        title: "Platzhalter fehlt",
        message: `${entry.label} hat kein Ziel in der PowerPoint-Vorlage.`,
        mappingId: entry.id
      });
      continue;
    }

    if (entry.type === "table") replacementFindings.push(await replaceTable(entry, value));
    else if (entry.type === "chart") replacementFindings.push(await replaceChart(entry, value));
    else if (entry.type === "image") replacementFindings.push(await replaceImage(entry, value));
    else replacementFindings.push(await replaceText(entry, value));
  }

  const preview = createPreviewRows(input.mapping, extractedValues);
  const review = [
    ...excelAnalysis.findings,
    ...templateAnalysis.findings,
    ...reviewMapping(input.mapping, extractedValues),
    ...replacementFindings
  ];
  const exportResult = await exportDraft(input.templateFile);
  log.push(exportResult.message);

  const hasErrors = review.some((finding) => finding.severity === "error");
  const hasWarnings = review.some((finding) => finding.severity === "warning");

  return {
    files: {
      excel: excelAnalysis.file,
      template: templateAnalysis.file
    },
    mappingStatus,
    excelAnalysis,
    templateAnalysis,
    extractedValues,
    preview,
    review,
    exportResult,
    log,
    stepStatuses: {
      files: input.excelFile && input.templateFile ? "done" : "error",
      mapping: mappingStatus.loaded ? "done" : "error",
      analysis: hasErrors ? "error" : hasWarnings ? "warning" : "done",
      preview: preview.length ? "done" : "warning",
      report: exportResult.created ? "done" : "warning"
    }
  };
}
