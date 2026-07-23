import { createDatabaseClient } from "../db";
import { assignments, documents, objects, projects, reports } from "../db/schema";
import {
  documentTypeValue,
  fieldText,
  finalCostDocuments,
  getTradeAllocations,
  isOfferDocument,
  isOrderDocument,
  isProgressInvoiceDocument,
  normalizeTradeCluster,
  roundMoney,
  selectEffectiveCostDocuments,
  sumValues
} from "../cost-calculations";
import type { MeasureCluster, ObjectAnalysis } from "../../types/analysis";
import type {
  AssistantCalculationBreakdown,
  AssistantCalculationMode,
  AssistantExplainTarget,
  AssistantPageContext,
  AssistantSourceReference
} from "../../types/assistant";

export interface AssistantStoredDocument {
  analysis: ObjectAnalysis;
  databaseId: string;
  localDocumentId: string;
  localObjectId: string;
  localProjectId: string;
  objectId: string;
  projectId: string;
  fileName: string;
  updatedAt: string | null;
}

export interface AssistantDataSnapshot {
  objects: Array<{
    id: string;
    localObjectId: string;
    objectNumber: string;
    objectName: string;
    address: string;
    renovatedLivingAreaSqm: number | null;
    updatedAt: string | null;
  }>;
  projects: Array<{
    id: string;
    localProjectId: string;
    localObjectId: string;
    objectId: string;
    projectName: string;
    objectLabel: string;
    renovatedApartmentCount: number | null;
    livingAreaSqm: number | null;
  }>;
  documents: AssistantStoredDocument[];
  assignments: Array<{
    localDocumentId: string;
    localProjectId: string;
    documentId: string;
    projectId: string;
  }>;
  reports: Array<{
    id: string;
    localReportId: string;
    title: string;
    reportType: string;
    generatedAt: string | null;
  }>;
}

interface ResolvedScope {
  documents: AssistantStoredDocument[];
  allCandidateDocuments: AssistantStoredDocument[];
  object: AssistantDataSnapshot["objects"][number] | null;
  project: AssistantDataSnapshot["projects"][number] | null;
  document: AssistantStoredDocument | null;
  report: AssistantDataSnapshot["reports"][number] | null;
  objectLabel: string | null;
  trade: string | null;
  target: AssistantExplainTarget | null;
}

export async function loadAssistantDataSnapshot(): Promise<AssistantDataSnapshot> {
  const database = createDatabaseClient();
  const [objectRows, projectRows, documentRows, assignmentRows, reportRows] = await Promise.all([
    database.select().from(objects),
    database.select().from(projects),
    database.select().from(documents),
    database.select().from(assignments),
    database.select().from(reports)
  ]);

  return {
    objects: objectRows.map((row) => ({
      id: row.id,
      localObjectId: row.localObjectId ?? "",
      objectNumber: row.objectNumber ?? "",
      objectName: row.objectName ?? "",
      address: row.address ?? "",
      renovatedLivingAreaSqm: numberValue(row.renovatedLivingAreaSqm),
      updatedAt: isoValue(row.updatedAt)
    })),
    projects: projectRows.map((row) => ({
      id: row.id,
      localProjectId: row.localProjectId ?? "",
      localObjectId: row.localObjectId ?? "",
      objectId: row.objectId ?? "",
      projectName: row.projectName ?? "",
      objectLabel: row.objectLabel ?? "",
      renovatedApartmentCount: numberValue(row.renovatedApartmentCount),
      livingAreaSqm: numberValue(row.livingAreaSqm)
    })),
    documents: documentRows.flatMap((row) => {
      const analysis = row.extractedData as ObjectAnalysis | null;
      if (!analysis || typeof analysis !== "object" || !analysis.id) return [];
      return [{
        analysis,
        databaseId: row.id,
        localDocumentId: row.localDocumentId ?? analysis.id,
        localObjectId: row.localObjectId ?? "",
        localProjectId: row.localProjectId ?? "",
        objectId: row.objectId ?? "",
        projectId: row.projectId ?? "",
        fileName: row.fileName ?? "",
        updatedAt: isoValue(row.updatedAt)
      }];
    }),
    assignments: assignmentRows.map((row) => ({
      localDocumentId: row.localDocumentId ?? "",
      localProjectId: row.localProjectId ?? "",
      documentId: row.documentId ?? "",
      projectId: row.projectId ?? ""
    })),
    reports: reportRows.map((row) => ({
      id: row.id,
      localReportId: row.localReportId ?? "",
      title: row.title ?? "",
      reportType: row.reportType ?? "",
      generatedAt: isoValue(row.generatedAt)
    }))
  };
}

export function buildCalculationBreakdown(
  question: string,
  context: AssistantPageContext,
  data: AssistantDataSnapshot
): AssistantCalculationBreakdown | null {
  const scope = resolveScope(question, context, data);
  const kind = inferCalculationMode(question, scope);
  if (!kind) return null;

  if (kind === "assignment") return buildAssignmentBreakdown(scope, data);
  if (kind === "tradeTotal") return buildTradeBreakdown(scope);
  if (kind === "costPerApartment") return buildCostPerApartmentBreakdown(scope);
  if (kind === "costPerSqm") return buildCostPerSqmBreakdown(scope, data);

  const selected = selectDocumentsForMode(kind, scope.documents);
  const field: "netCost" | "vatCost" | "totalCost" =
    kind === "net" ? "netCost" : kind === "vat" ? "vatCost" : "totalCost";
  const title = calculationTitle(kind, scope);
  return buildDocumentSumBreakdown(kind, title, selected, scope.allCandidateDocuments, field, scope);
}

export function formatCalculationAnswer(breakdown: AssistantCalculationBreakdown): string {
  if (breakdown.kind === "assignment") {
    const lines = [
      breakdown.notes[0] ?? "Für dieses Dokument ist keine belastbare Zuordnungsbegründung gespeichert."
    ];
    if (breakdown.missing.length > 0) {
      lines.push("", "Fehlende Angaben:", ...breakdown.missing.map((item) => `- ${item}`));
    }
    if (breakdown.lastUpdatedAt) {
      lines.push("", `Letzte Datenaktualisierung: ${formatDateTime(breakdown.lastUpdatedAt)}.`);
    }
    return lines.join("\n");
  }

  const result = breakdown.result === null
    ? "nicht vollständig berechnet werden"
    : breakdown.unit === "EUR_PER_SQM"
      ? `${formatEuro(breakdown.result)} pro m²`
      : formatEuro(breakdown.result);
  const lines: string[] = [];
  lines.push(
    breakdown.result === null
      ? `${breakdown.title} kann mit den gespeicherten Daten ${result}.`
      : `${breakdown.title} beträgt ${result}.`
  );

  if (breakdown.formula) {
    lines.push("", "Herleitung:", breakdown.formula);
  }

  const included = breakdown.operands.filter((operand) => operand.included);
  if (included.length > 0) {
    lines.push("", "Berücksichtigte Werte:");
    included.forEach((operand) => {
      const hasMultiplier = operand.multiplier !== null &&
        operand.multiplier !== undefined &&
        Math.abs(operand.multiplier - 1) > 0.000001;
      const calculation = hasMultiplier
        ? `${formatOperandValue(operand.sourceValue ?? null, operand.unit)} × ${formatFactor(operand.multiplier!)} = ${formatOperandValue(operand.value, operand.unit)}`
        : formatOperandValue(operand.value, operand.unit);
      lines.push(`- ${operand.label}: ${calculation} (${operand.reason})`);
    });
  }

  if (breakdown.sources.some((source) => source.position)) {
    lines.push("", "Relevante Positionen:");
    breakdown.sources
      .filter((source) => source.position)
      .slice(0, 12)
      .forEach((source) => {
        const quantity = source.quantity !== null && source.unitPrice !== null
          ? ` – ${formatNumber(source.quantity)} ${source.unit ?? ""} × ${formatEuro(source.unitPrice)}`
          : "";
        lines.push(
          `- ${source.documentName}, Pos. ${source.position}: ${source.description ?? "ohne Beschreibung"}${quantity} = ${formatNullableEuro(source.amount)}`
        );
      });
  }

  if (breakdown.excluded.length > 0) {
    lines.push("", "Nicht berücksichtigt:");
    breakdown.excluded.slice(0, 8).forEach((entry) => {
      lines.push(`- ${entry.label}: ${entry.reason}${entry.value === null ? "" : ` (${formatEuro(entry.value)})`}`);
    });
  }

  const factorUsed = breakdown.operands.some((operand) =>
    operand.multiplier !== null && operand.multiplier !== undefined && Math.abs(operand.multiplier - 1) > 0.000001
  );
  if (!factorUsed && breakdown.kind !== "costPerApartment" && breakdown.kind !== "costPerSqm") {
    lines.push("", "Es wurde kein separater Multiplikator verwendet.");
  }

  if (breakdown.notes.length > 0) {
    lines.push("", ...breakdown.notes.map((note) => `Hinweis: ${note}`));
  }
  if (breakdown.missing.length > 0) {
    lines.push("", "Fehlende Angaben:", ...breakdown.missing.map((item) => `- ${item}`));
  }
  if (breakdown.lastUpdatedAt) {
    lines.push("", `Letzte Datenaktualisierung: ${formatDateTime(breakdown.lastUpdatedAt)}.`);
  }
  return lines.join("\n");
}

function resolveScope(
  question: string,
  context: AssistantPageContext,
  data: AssistantDataSnapshot
): ResolvedScope {
  const target = context.target ?? null;
  const targetHasOwnScope = Boolean(
    target && (
      target.objectId !== undefined ||
      target.projectId !== undefined ||
      target.documentId !== undefined ||
      target.reportId !== undefined ||
      (target.documentIds?.length ?? 0) > 0
    )
  );
  const targetObjectId = target?.objectId !== undefined ? target.objectId : targetHasOwnScope ? null : context.objectId;
  const targetProjectId = target?.projectId !== undefined ? target.projectId : targetHasOwnScope ? null : context.projectId;
  const targetDocumentId = target?.documentId !== undefined ? target.documentId : targetHasOwnScope ? null : context.documentId;
  const targetReportId = target?.reportId !== undefined ? target.reportId : targetHasOwnScope ? null : context.reportId;
  const explicitDocumentIds = new Set((target?.documentIds ?? []).filter(Boolean).slice(0, 250));

  const object = findByAnyId(data.objects, targetObjectId ?? null, "localObjectId");
  const project = findByAnyId(data.projects, targetProjectId ?? null, "localProjectId");
  const document = data.documents.find((entry) =>
    Boolean(targetDocumentId) && documentMatchesId(entry, targetDocumentId!)
  ) ?? null;
  const report = findByAnyId(data.reports, targetReportId ?? null, "localReportId");

  let scoped = data.documents;
  if (explicitDocumentIds.size > 0) {
    scoped = data.documents.filter((entry) =>
      explicitDocumentIds.has(entry.analysis.id) ||
      explicitDocumentIds.has(entry.localDocumentId) ||
      explicitDocumentIds.has(entry.databaseId)
    );
  } else if (document) {
    scoped = [document];
  } else if (project) {
    scoped = data.documents.filter((entry) => documentBelongsToProject(entry, project, data));
  } else if (object) {
    scoped = data.documents.filter((entry) => documentBelongsToObject(entry, object, data));
  }

  const requestedTrade = target?.trade ?? context.trade ?? inferTrade(question);
  const trade = requestedTrade ? normalizeTradeCluster(requestedTrade, requestedTrade) : null;
  return {
    documents: scoped,
    allCandidateDocuments: scoped,
    object,
    project,
    document,
    report,
    objectLabel: object ? objectDisplayLabel(object) : inferObjectLabel(scoped),
    trade,
    target
  };
}

function inferCalculationMode(
  question: string,
  scope: ResolvedScope
): AssistantCalculationMode | null {
  if (scope.target?.calculation) return scope.target.calculation;
  const normalized = question.toLowerCase();
  if (/warum.*zugeordnet|zuordnung|zugeordnet/.test(normalized)) return "assignment";
  if (scope.trade || /gewerk|elektro|maler|heizung|sanit|fliesen|boden|tischler|asbest|fassade|dach|fenster/.test(normalized)) {
    return "tradeTotal";
  }
  if (/pro\s*(wohnung|we)|je\s*(wohnung|we)|kosten.*wohnung/.test(normalized)) return "costPerApartment";
  if (/pro\s*m[²2]|je\s*m[²2]|quadratmeter|kosten.*m[²2]/.test(normalized)) return "costPerSqm";
  if (/netto/.test(normalized)) return "net";
  if (/mwst|umsatzsteuer|steuer/.test(normalized)) return "vat";
  if (/angebot/.test(normalized)) return "offerTotal";
  if (/abschlag|teilrechnung/.test(normalized)) return "progressTotal";
  if (/schlussrechnung|finale kosten|final/.test(normalized)) return "finalTotal";
  if (scope.document || /dieses dokument|dokumentensumme|rechnungsbetrag/.test(normalized)) return "documentTotal";
  if (/gesamt|summe|betrag|kosten|wert|quelle|position|multiplikator|berechnet/.test(normalized)) return "sum";
  return null;
}

function selectDocumentsForMode(
  kind: AssistantCalculationMode,
  scoped: AssistantStoredDocument[]
): AssistantStoredDocument[] {
  if (kind === "effectiveTotal") {
    const selected = new Set(selectEffectiveCostDocuments(scoped.map((entry) => entry.analysis)).map((entry) => entry.id));
    return scoped.filter((entry) => selected.has(entry.analysis.id));
  }
  if (kind === "offerTotal") {
    return scoped.filter((entry) => isOfferDocument(entry.analysis) || isOrderDocument(entry.analysis));
  }
  if (kind === "progressTotal") {
    return scoped.filter((entry) => isProgressInvoiceDocument(entry.analysis));
  }
  if (kind === "finalTotal") {
    const selected = new Set(finalCostDocuments(scoped.map((entry) => entry.analysis)).map((entry) => entry.id));
    return scoped.filter((entry) => selected.has(entry.analysis.id));
  }
  return scoped;
}

function buildDocumentSumBreakdown(
  kind: AssistantCalculationMode,
  title: string,
  selected: AssistantStoredDocument[],
  allCandidates: AssistantStoredDocument[],
  field: "netCost" | "vatCost" | "totalCost",
  scope: ResolvedScope
): AssistantCalculationBreakdown {
  const operands = selected.map((stored) => {
    const value = stored.analysis[field].value;
    return {
      label: documentLabel(stored),
      value,
      documentId: stored.analysis.id,
      included: value !== null,
      unit: "EUR" as const,
      reason: `${documentDescriptor(stored.analysis)}, gespeicherter ${fieldLabel(field)}`,
      multiplier: 1
    };
  });
  const selectedIds = new Set(selected.map((entry) => entry.analysis.id));
  const excluded = allCandidates
    .filter((entry) => !selectedIds.has(entry.analysis.id))
    .map((entry) => ({
      label: documentLabel(entry),
      value: entry.analysis[field].value,
      reason: exclusionReason(kind, entry.analysis)
    }));
  selected
    .filter((entry) => entry.analysis[field].value === null)
    .forEach((entry) => excluded.push({
      label: documentLabel(entry),
      value: null,
      reason: `${fieldLabel(field)} ist nicht gespeichert`
    }));

  const values = operands.filter((operand) => operand.included).map((operand) => operand.value);
  const result = sumValues(values);
  const sources = selected.flatMap((stored) => documentSources(stored, field));
  const missing: string[] = [];
  if (selected.length === 0) missing.push("Keine passenden Dokumente im aktuellen Kontext.");
  if (selected.length > 0 && result === null) missing.push(`Kein belegter ${fieldLabel(field)} in den ausgewählten Dokumenten.`);
  if (sources.length === 0 && result !== null) missing.push("Zu den berücksichtigten Beträgen ist kein Quellenbeleg gespeichert.");

  return {
    kind,
    title,
    result,
    unit: "EUR",
    formula: result === null ? null : sumFormula(values, result),
    operands,
    sources,
    excluded,
    missing,
    notes: kind === "effectiveTotal"
      ? ["Die Dashboard-Regel wählt je Objekt Rechnungen vor Abschlägen und Abschläge vor Angeboten aus."]
      : [],
    lastUpdatedAt: latestDate(selected.map((entry) => entry.updatedAt)),
    objectLabel: scope.objectLabel,
    trade: null
  };
}

function buildTradeBreakdown(scope: ResolvedScope): AssistantCalculationBreakdown {
  const trade = scope.trade ?? inferTradeFromDocuments(scope.documents);
  const allocations = scope.documents.flatMap((stored) =>
    getTradeAllocations(stored.analysis).map((allocation) => ({ stored, allocation }))
  );
  const included = trade
    ? allocations.filter(({ allocation }) => normalizeTradeCluster(allocation.cluster, "") === normalizeTradeCluster(trade, ""))
    : [];
  const excludedAllocations = allocations.filter((entry) => !included.includes(entry));
  const operands = included.map(({ stored, allocation }) => ({
    label: `${documentLabel(stored)} – ${allocation.cluster}`,
    value: allocation.value,
    sourceValue: allocation.sourceValue,
    documentId: stored.analysis.id,
    included: allocation.value !== null,
    unit: "EUR" as const,
    reason: `${allocationRuleLabel(allocation.rule)}; ${documentDescriptor(stored.analysis)}`,
    multiplier: allocation.multiplier
  }));
  const values = operands.filter((operand) => operand.included).map((operand) => operand.value);
  const result = sumValues(values);
  const sources = included.flatMap(({ stored, allocation }) =>
    tradeSources(stored, allocation.cluster, allocation.value)
  );
  const missing: string[] = [];
  if (!trade) missing.push("Kein Gewerk wurde genannt oder im aktuellen Kontext erkannt.");
  if (scope.documents.length === 0) missing.push("Keine Dokumente im aktuellen Kontext.");
  if (trade && included.length === 0) missing.push(`Keine gespeicherte Position oder Gewerkesumme für ${trade}.`);
  if (included.some(({ allocation }) => allocation.value === null)) {
    missing.push("Mindestens eine passende Gewerkeposition hat keinen belastbaren Betrag.");
  }

  return {
    kind: "tradeTotal",
    title: trade ? `Die Kosten für ${trade}` : "Die Gewerkekosten",
    result,
    unit: "EUR",
    formula: result === null ? null : sumFormula(values, result),
    operands,
    sources,
    excluded: excludedAllocations
      .filter(({ allocation }) => allocation.value !== null)
      .slice(0, 30)
      .map(({ stored, allocation }) => ({
        label: `${documentLabel(stored)} – ${allocation.cluster}`,
        reason: `anderem Gewerk als ${trade ?? "dem gesuchten Gewerk"} zugeordnet`,
        value: allocation.value
      })),
    missing,
    notes: buildTradeNotes(included),
    lastUpdatedAt: latestDate(included.map(({ stored }) => stored.updatedAt)),
    objectLabel: scope.objectLabel,
    trade
  };
}

function buildCostPerApartmentBreakdown(scope: ResolvedScope): AssistantCalculationBreakdown {
  const numerator = sumValues(scope.documents.map((entry) => entry.analysis.totalCost.value));
  const documentApartmentCounts = scope.documents.map((entry) => entry.analysis.renovatedApartmentCount.value);
  const documentDenominator = sumValues(documentApartmentCounts);
  const denominator = scope.project?.renovatedApartmentCount ?? documentDenominator;
  const result = numerator !== null && denominator ? roundMoney(numerator / denominator) : null;
  const operands = [
    {
      label: "Gesamtkosten brutto",
      value: numerator,
      included: numerator !== null,
      unit: "EUR" as const,
      reason: "Summe der Bruttowerte der ausgewählten Dokumente",
      multiplier: 1
    },
    {
      label: "Sanierte Wohnungen",
      value: denominator,
      included: denominator !== null,
      unit: "COUNT" as const,
      reason: scope.project?.renovatedApartmentCount !== null && scope.project?.renovatedApartmentCount !== undefined
        ? "Projektstammdaten"
        : "Summe der Dokumentwerte",
      multiplier: null
    }
  ];
  const missing: string[] = [];
  if (numerator === null) missing.push("Gesamtkosten brutto.");
  if (!denominator) missing.push("Anzahl sanierter Wohnungen.");
  return {
    kind: "costPerApartment",
    title: "Die Kosten pro sanierter Wohnung",
    result,
    unit: "EUR",
    formula: result === null || numerator === null || !denominator
      ? null
      : `${formatEuro(numerator)} ÷ ${formatNumber(denominator)} Wohnungen = ${formatEuro(result)}`,
    operands,
    sources: scope.documents.flatMap((entry) => documentSources(entry, "totalCost")),
    excluded: [],
    missing,
    notes: ["Die Bezeichnung Teil- oder Vollsanierung verändert diese Division nicht."],
    lastUpdatedAt: latestDate(scope.documents.map((entry) => entry.updatedAt)),
    objectLabel: scope.objectLabel,
    trade: null
  };
}

function buildCostPerSqmBreakdown(
  scope: ResolvedScope,
  data: AssistantDataSnapshot
): AssistantCalculationBreakdown {
  const numerator = sumValues(scope.documents.map((entry) => entry.analysis.totalCost.value));
  const area = scope.object?.renovatedLivingAreaSqm ??
    scope.project?.livingAreaSqm ??
    (scope.object ? null : sumValues(data.objects.map((entry) => entry.renovatedLivingAreaSqm)));
  const result = numerator !== null && area ? roundMoney(numerator / area) : null;
  const missing: string[] = [];
  if (numerator === null) missing.push("Gesamtkosten brutto.");
  if (!area) missing.push("Sanierte Wohnfläche in m² in den Objekt- oder Projektstammdaten.");
  return {
    kind: "costPerSqm",
    title: "Die Kosten pro m²",
    result,
    unit: "EUR_PER_SQM",
    formula: result === null || numerator === null || !area
      ? null
      : `${formatEuro(numerator)} ÷ ${formatNumber(area)} m² = ${formatEuro(result)} pro m²`,
    operands: [
      {
        label: "Gesamtkosten brutto",
        value: numerator,
        included: numerator !== null,
        unit: "EUR",
        reason: "Summe der Bruttowerte der ausgewählten Dokumente",
        multiplier: 1
      },
      {
        label: "Sanierte Wohnfläche",
        value: area,
        included: area !== null,
        unit: "SQM",
        reason: scope.object ? "Objektstammdaten" : scope.project ? "Projektstammdaten" : "Summe der Objektstammdaten",
        multiplier: null
      }
    ],
    sources: scope.documents.flatMap((entry) => documentSources(entry, "totalCost")),
    excluded: [],
    missing,
    notes: [],
    lastUpdatedAt: latestDate([
      ...scope.documents.map((entry) => entry.updatedAt),
      scope.object?.updatedAt ?? null
    ]),
    objectLabel: scope.objectLabel,
    trade: null
  };
}

function buildAssignmentBreakdown(
  scope: ResolvedScope,
  data: AssistantDataSnapshot
): AssistantCalculationBreakdown {
  const stored = scope.document ?? scope.documents[0] ?? null;
  const assignment = stored ? data.assignments.find((entry) =>
    entry.localDocumentId === stored.localDocumentId ||
    (entry.documentId && entry.documentId === stored.databaseId)
  ) : null;
  const project = assignment
    ? data.projects.find((entry) =>
      (assignment.localProjectId && entry.localProjectId === assignment.localProjectId) ||
      (assignment.projectId && entry.id === assignment.projectId)
    ) ?? null
    : null;
  const analysis = stored?.analysis ?? null;
  const reasons = [
    analysis && fieldText(analysis.objectNumber) !== "k.A." ? `Objektnummer ${fieldText(analysis.objectNumber)}` : null,
    analysis && fieldText(analysis.objectAddress) !== "k.A." ? `Adresse ${fieldText(analysis.objectAddress)}` : null,
    analysis && fieldText(analysis.assignmentSuggestion) !== "k.A."
      ? `KI-Vorschlag „${fieldText(analysis.assignmentSuggestion)}“`
      : null,
    project ? `manuell gespeicherte Projektzuordnung „${project.projectName || project.objectLabel}“` : null
  ].filter((value): value is string => Boolean(value));
  const missing: string[] = [];
  if (!stored) missing.push("Kein Dokument im aktuellen Kontext.");
  if (stored && !assignment) missing.push("Keine gespeicherte Projektzuordnung.");
  if (analysis && fieldText(analysis.objectNumber) === "k.A." && fieldText(analysis.objectAddress) === "k.A.") {
    missing.push("Objektnummer und Objektadresse im Dokument.");
  }
  return {
    kind: "assignment",
    title: project
      ? `Die Zuordnung zu ${project.projectName || project.objectLabel || "dem Projekt"}`
      : "Die Dokumentzuordnung",
    result: null,
    unit: "TEXT",
    formula: reasons.length ? reasons.join(" + ") : null,
    operands: [],
    sources: stored ? documentSources(stored, "totalCost") : [],
    excluded: [],
    missing,
    notes: reasons.length
      ? [`Die Zuordnung basiert auf ${reasons.join(", ")}. Die gespeicherte Projektzuordnung hat Vorrang vor dem KI-Vorschlag.`]
      : ["Es ist keine belastbare Zuordnungsbegründung gespeichert."],
    lastUpdatedAt: stored?.updatedAt ?? null,
    objectLabel: scope.objectLabel,
    trade: null
  };
}

function documentSources(
  stored: AssistantStoredDocument,
  field: "netCost" | "vatCost" | "totalCost"
): AssistantSourceReference[] {
  const analysis = stored.analysis;
  const fieldSources = analysis[field].sources;
  if (fieldSources.length === 0) {
    return [{
      ...baseSource(stored),
      trade: null,
      amount: analysis[field].value,
      quantity: null,
      unit: null,
      unitPrice: null,
      position: null,
      description: fieldLabel(field),
      snippet: analysis.costDebug?.summaryBlock ?? null
    }];
  }
  return fieldSources.map((source) => ({
    ...baseSource(stored),
    documentName: source.fileName || documentLabel(stored),
    trade: null,
    amount: analysis[field].value,
    quantity: null,
    unit: null,
    unitPrice: null,
    position: null,
    description: fieldLabel(field),
    snippet: source.textSnippet ?? analysis.costDebug?.summaryBlock ?? null
  }));
}

function tradeSources(
  stored: AssistantStoredDocument,
  trade: MeasureCluster,
  allocationValue: number | null
): AssistantSourceReference[] {
  const normalizedTrade = normalizeTradeCluster(trade, "");
  const matchingClusters = stored.analysis.clusters.filter((cluster) =>
    normalizeTradeCluster(fieldText(cluster.cluster), fieldText(cluster.description)) === normalizedTrade
  );
  const lineItems = matchingClusters.flatMap((cluster) => cluster.lineItems ?? []);
  if (lineItems.length > 0) {
    return lineItems.map((item) => ({
      ...baseSource(stored),
      documentName: item.source.fileName || documentLabel(stored),
      trade: normalizedTrade,
      amount: item.totalPrice,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      position: item.position || null,
      description: item.description,
      snippet: item.source.textSnippet ?? null
    }));
  }

  const cluster = matchingClusters[0] ?? null;
  const source = cluster?.totalCost.sources[0] ?? stored.analysis.totalCost.sources[0] ?? null;
  const detail = stored.analysis.measureDetails?.find((entry) =>
    normalizeTradeCluster(entry.cluster, entry.beschreibung) === normalizedTrade
  ) ?? null;
  return [{
    ...baseSource(stored),
    documentName: source?.fileName || documentLabel(stored),
    trade: normalizedTrade,
    amount: allocationValue,
    quantity: null,
    unit: null,
    unitPrice: null,
    position: null,
    description: fieldText(cluster?.description) !== "k.A." ? fieldText(cluster?.description) : detail?.beschreibung ?? null,
    snippet: source?.textSnippet ?? detail?.quelle ?? null
  }];
}

function baseSource(stored: AssistantStoredDocument) {
  const analysis = stored.analysis;
  return {
    documentId: analysis.id,
    documentName: documentLabel(stored),
    documentType: documentTypeValue(analysis),
    documentNumber: fieldText(analysis.documentNumber),
    provider: fieldText(analysis.provider),
    objectLabel: firstKnown(
      fieldText(analysis.objectNumber),
      fieldText(analysis.objectAddress),
      "k.A."
    ),
    updatedAt: stored.updatedAt
  };
}

function buildTradeNotes(
  included: Array<{ stored: AssistantStoredDocument; allocation: ReturnType<typeof getTradeAllocations>[number] }>
): string[] {
  const notes: string[] = [];
  if (included.some(({ allocation }) => allocation.rule === "split-repeated-document-total")) {
    notes.push("Eine mehrfach gespeicherte Dokumentensumme wurde durch die Anzahl der betroffenen Gewerke geteilt.");
  }
  if (included.some(({ allocation }) => allocation.rule === "split-document-total-by-measure")) {
    notes.push("Mangels Abschnittssumme wurde die Dokumentensumme gleichmäßig auf die gespeicherten Maßnahmen verteilt.");
  }
  const positionComparisons = included.flatMap(({ stored, allocation }) => {
    const refs = tradeSources(stored, allocation.cluster, allocation.value).filter((source) => source.position);
    const positionSum = sumValues(refs.map((source) => source.amount));
    if (positionSum === null || allocation.value === null) return [];
    const difference = roundMoney(allocation.value - positionSum);
    return Math.abs(difference) > 0.01
      ? [`In ${documentLabel(stored)} weicht die Summe der gespeicherten Einzelpositionen um ${formatEuro(Math.abs(difference))} von der verwendeten Gewerkesumme ab.`]
      : [];
  });
  return [...notes, ...positionComparisons];
}

function calculationTitle(kind: AssistantCalculationMode, scope: ResolvedScope): string {
  const suffix = scope.objectLabel ? ` für ${scope.objectLabel}` : "";
  if (kind === "net") return `Die Nettokosten${suffix}`;
  if (kind === "vat") return `Die Umsatzsteuer${suffix}`;
  if (kind === "offerTotal") return `Die Angebotssumme${suffix}`;
  if (kind === "progressTotal") return `Die Summe der Abschlagsrechnungen${suffix}`;
  if (kind === "finalTotal") return `Die finalen Kosten${suffix}`;
  if (kind === "documentTotal") return "Der Dokumentbetrag";
  return `Die Gesamtkosten${suffix}`;
}

function exclusionReason(kind: AssistantCalculationMode, document: ObjectAnalysis): string {
  if (kind === "effectiveTotal") return "durch die wirksame Dokumentauswahl ersetzt";
  if (kind === "offerTotal") return "kein Angebot oder Auftrag";
  if (kind === "progressTotal") return "keine Abschlags- oder Teilrechnung";
  if (kind === "finalTotal") return "keine für die finale Kostenbasis verwendete Rechnung";
  return "nicht Teil der aktuellen Auswahl";
}

function allocationRuleLabel(rule: ReturnType<typeof getTradeAllocations>[number]["rule"]): string {
  if (rule === "stored-cluster-total") return "gespeicherte Gewerkesumme";
  if (rule === "stored-measure-total") return "gespeicherte Abschnittssumme";
  if (rule === "single-cluster-document-total") return "Dokumentensumme, da nur ein Gewerk vorhanden ist";
  if (rule === "split-repeated-document-total") return "Dokumentensumme gleichmäßig auf mehrfach belegte Gewerke verteilt";
  if (rule === "split-document-total-by-measure") return "Dokumentensumme gleichmäßig auf Maßnahmen verteilt";
  if (rule === "cluster-fallback") return "Gewerkesumme als Ersatz für fehlende Abschnittssumme";
  return "gespeicherte Dokumentensumme";
}

function fieldLabel(field: "netCost" | "vatCost" | "totalCost"): string {
  if (field === "netCost") return "Nettobetrag";
  if (field === "vatCost") return "Umsatzsteuerbetrag";
  return "Bruttobetrag";
}

function documentBelongsToObject(
  stored: AssistantStoredDocument,
  object: AssistantDataSnapshot["objects"][number],
  data: AssistantDataSnapshot
): boolean {
  if (stored.objectId && stored.objectId === object.id) return true;
  if (stored.localObjectId && stored.localObjectId === object.localObjectId) return true;
  const analysis = stored.analysis;
  if (object.objectNumber && fieldText(analysis.objectNumber).toLowerCase() === object.objectNumber.toLowerCase()) return true;
  if (object.address && normalizeAddress(fieldText(analysis.objectAddress)).includes(normalizeAddress(object.address))) return true;
  const assignment = data.assignments.find((entry) =>
    entry.localDocumentId === stored.localDocumentId ||
    (entry.documentId && entry.documentId === stored.databaseId)
  );
  if (!assignment) return false;
  const project = data.projects.find((entry) =>
    (assignment.localProjectId && entry.localProjectId === assignment.localProjectId) ||
    (assignment.projectId && entry.id === assignment.projectId)
  );
  return Boolean(project && (
    (project.objectId && project.objectId === object.id) ||
    (project.localObjectId && project.localObjectId === object.localObjectId)
  ));
}

function documentBelongsToProject(
  stored: AssistantStoredDocument,
  project: AssistantDataSnapshot["projects"][number],
  data: AssistantDataSnapshot
): boolean {
  if (stored.projectId && stored.projectId === project.id) return true;
  if (stored.localProjectId && stored.localProjectId === project.localProjectId) return true;
  return data.assignments.some((entry) =>
    (entry.localDocumentId === stored.localDocumentId || (entry.documentId && entry.documentId === stored.databaseId)) &&
    (entry.localProjectId === project.localProjectId || (entry.projectId && entry.projectId === project.id))
  );
}

function documentMatchesId(stored: AssistantStoredDocument, id: string): boolean {
  return stored.analysis.id === id || stored.localDocumentId === id || stored.databaseId === id;
}

function inferTrade(question: string): string | null {
  const aliases: Array<[RegExp, string]> = [
    [/elektro/i, "Elektroarbeiten"],
    [/maler/i, "Malerarbeiten"],
    [/heizung|sanit/i, "Heizung und Sanitär"],
    [/fliesen|estrich|bad/i, "Fliesen und Estricharbeiten"],
    [/boden/i, "Bodenbelagsarbeiten"],
    [/tischler|tür/i, "Tischlerarbeiten"],
    [/asbest|schadstoff/i, "Schadstoffsanierung / Asbest"],
    [/rückbau|rueckbau|entsorgung|abbruch/i, "Rückbau / Entsorgung"],
    [/fassade/i, "Fassadenarbeiten"],
    [/dach/i, "Dacharbeiten"],
    [/fenster/i, "Fensterarbeiten"],
    [/außenanlage|aussenanlage/i, "Außenanlagen"],
    [/reinigung/i, "Reinigung"],
    [/planung|dokumentation/i, "Planung / Dokumentation"]
  ];
  return aliases.find(([pattern]) => pattern.test(question))?.[1] ?? null;
}

function inferTradeFromDocuments(documentsInScope: AssistantStoredDocument[]): string | null {
  const trades = Array.from(new Set(documentsInScope.flatMap((entry) =>
    getTradeAllocations(entry.analysis).map((allocation) => allocation.cluster)
  )));
  return trades.length === 1 ? trades[0] : null;
}

function inferObjectLabel(documentsInScope: AssistantStoredDocument[]): string | null {
  const labels = Array.from(new Set(documentsInScope.map((entry) =>
    firstKnown(fieldText(entry.analysis.objectNumber), fieldText(entry.analysis.objectAddress))
  ).filter(Boolean)));
  return labels.length === 1 ? labels[0] : null;
}

function objectDisplayLabel(object: AssistantDataSnapshot["objects"][number]): string {
  return firstKnown(object.objectNumber, object.objectName, object.address, object.localObjectId, object.id);
}

function documentLabel(stored: AssistantStoredDocument): string {
  const analysis = stored.analysis;
  return firstKnown(
    stored.fileName,
    analysis.totalCost.sources[0]?.fileName ?? "",
    analysis.netCost.sources[0]?.fileName ?? "",
    analysis.clusters.flatMap((cluster) => cluster.totalCost.sources.map((source) => source.fileName)).find(Boolean) ?? "",
    fieldText(analysis.documentNumber) !== "k.A." ? `${documentTypeValue(analysis)} ${fieldText(analysis.documentNumber)}` : "",
    fieldText(analysis.provider),
    analysis.sourceDocumentIds?.[0] ?? "",
    analysis.id
  );
}

function documentDescriptor(document: ObjectAnalysis): string {
  const objectLabel = firstKnown(fieldText(document.objectNumber), fieldText(document.objectAddress));
  return [
    documentTypeValue(document),
    fieldText(document.documentNumber) !== "k.A." ? `Nr. ${fieldText(document.documentNumber)}` : "",
    fieldText(document.provider) !== "k.A." ? fieldText(document.provider) : "",
    objectLabel ? `Objekt ${objectLabel}` : ""
  ].filter(Boolean).join(", ");
}

function sumFormula(values: Array<number | null>, result: number): string {
  const numeric = values.filter((value): value is number => value !== null);
  return `${numeric.map(formatEuro).join(" + ")} = ${formatEuro(result)}`;
}

function formatEuro(value: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatNullableEuro(value: number | null): string {
  return value === null ? "k.A." : formatEuro(value);
}

function formatOperandValue(
  value: number | null,
  unit: "EUR" | "COUNT" | "SQM" | undefined
): string {
  if (value === null) return "k.A.";
  if (unit === "COUNT") return formatNumber(value);
  if (unit === "SQM") return `${formatNumber(value)} m²`;
  return formatEuro(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 3 }).format(value);
}

function formatFactor(value: number): string {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 6 }).format(value);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function latestDate(values: Array<string | null>): string | null {
  const timestamps = values
    .filter((value): value is string => Boolean(value))
    .map((value) => ({ value, timestamp: new Date(value).getTime() }))
    .filter((entry) => Number.isFinite(entry.timestamp))
    .sort((left, right) => right.timestamp - left.timestamp);
  return timestamps[0]?.value ?? null;
}

function normalizeAddress(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9äöüß]/g, "");
}

function findByAnyId<T extends { id: string }>(
  rows: T[],
  id: string | null,
  localKey: keyof T
): T | null {
  if (!id) return null;
  return rows.find((row) => row.id === id || String(row[localKey] ?? "") === id) ?? null;
}

function firstKnown(...values: string[]): string {
  return values.find((value) => value && value !== "k.A.") ?? "";
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function isoValue(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
