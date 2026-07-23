import type { MeasureCluster, ObjectAnalysis } from "../types/analysis";
import {
  isDisposalDemolitionTrade,
  isHazardousMaterialTrade,
  normalizeTradeName,
  PAINTING_TRADE
} from "./trades";

export type TradeAllocationRule =
  | "stored-cluster-total"
  | "single-cluster-document-total"
  | "split-repeated-document-total"
  | "stored-measure-total"
  | "cluster-fallback"
  | "split-document-total-by-measure"
  | "document-total";

export interface TradeAllocation {
  cluster: MeasureCluster;
  value: number | null;
  document: ObjectAnalysis;
  rule: TradeAllocationRule;
  sourceValue: number | null;
  multiplier: number | null;
}

interface ResolvedCost {
  value: number | null;
  rule: TradeAllocationRule;
  sourceValue: number | null;
  multiplier: number | null;
}

export const standardTradeCatalog: MeasureCluster[] = [
  "Schadstoffsanierung / Asbest",
  "Asbestarbeiten",
  "Bodenbelagsarbeiten",
  PAINTING_TRADE,
  "Fliesen und Estricharbeiten",
  "Heizung und Sanitär",
  "Elektroarbeiten",
  "Tischlerarbeiten",
  "Fassadenarbeiten",
  "Dacharbeiten",
  "Fensterarbeiten",
  "Rückbau / Entsorgung",
  "Außenanlagen",
  "Reinigung",
  "Planung / Dokumentation",
  "Sonstige"
];

export function fieldText(field: { value: unknown } | null | undefined): string {
  const value = field?.value;
  if (value === null || value === undefined || String(value).trim() === "") return "k.A.";
  return String(value);
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function sumValues(values: Array<number | null>): number | null {
  const numericValues = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numericValues.length === 0) return null;
  return roundMoney(numericValues.reduce((sum, value) => sum + value, 0));
}

export function safeDivide(
  value: number | null | undefined,
  divisor: number | null | undefined
): number | null {
  if (value === null || value === undefined || divisor === null || divisor === undefined || divisor === 0) return null;
  if (!Number.isFinite(value) || !Number.isFinite(divisor)) return null;
  return roundMoney(value / divisor);
}

export function documentTypeValue(document: ObjectAnalysis): string {
  return fieldText(document.documentType);
}

export function isOfferDocument(document: ObjectAnalysis): boolean {
  return /angebot/i.test(documentTypeValue(document));
}

export function isOrderDocument(document: ObjectAnalysis): boolean {
  return /auftrag/i.test(documentTypeValue(document));
}

export function isProgressInvoiceDocument(document: ObjectAnalysis): boolean {
  return /abschlag|teilrechnung|teilzahlung|akonto|vorauszahlung/i.test(documentTypeValue(document));
}

export function isFinalInvoiceDocument(document: ObjectAnalysis): boolean {
  return /schlussrechnung|schluss|final/i.test(documentTypeValue(document));
}

export function isCreditDocument(document: ObjectAnalysis): boolean {
  return /gutschrift/i.test(documentTypeValue(document));
}

export function isInvoiceDocument(document: ObjectAnalysis): boolean {
  const type = documentTypeValue(document);
  return /rechnung|eingangsrechnung/i.test(type) &&
    !isProgressInvoiceDocument(document) &&
    !isFinalInvoiceDocument(document);
}

export function isInvoiceLikeDocument(document: ObjectAnalysis): boolean {
  return isInvoiceDocument(document) ||
    isIncomingInvoiceDocument(document) ||
    isFinalInvoiceDocument(document) ||
    isProgressInvoiceDocument(document);
}

export function isIncomingInvoiceDocument(document: ObjectAnalysis): boolean {
  return isInvoiceDocument(document) || /eingangsrechnung/i.test(documentTypeValue(document));
}

export function selectEffectiveCostDocuments(documents: ObjectAnalysis[]): ObjectAnalysis[] {
  const groups = new Map<string, ObjectAnalysis[]>();
  documents.forEach((document) => {
    const key = firstKnownText(
      fieldText(document.objectNumber),
      fieldText(document.objectAddress),
      fieldText(document.assignmentSuggestion),
      document.sourceDocumentIds?.[0] ?? document.id
    );
    groups.set(key, [...(groups.get(key) ?? []), document]);
  });

  return Array.from(groups.values()).flatMap((group) => {
    const finalDocuments = group.filter((document) =>
      isFinalInvoiceDocument(document) || isInvoiceDocument(document) || isCreditDocument(document)
    );
    if (finalDocuments.length > 0) return finalDocuments;
    const progressDocuments = group.filter(isProgressInvoiceDocument);
    if (progressDocuments.length > 0) return progressDocuments;
    const offerDocuments = group.filter((document) => isOfferDocument(document) || isOrderDocument(document));
    return offerDocuments.length > 0 ? offerDocuments : group;
  });
}

export function selectFinalInvoiceCostDocuments(documents: ObjectAnalysis[]): ObjectAnalysis[] {
  const finalInvoices = documents.filter(isFinalInvoiceDocument);
  if (finalInvoices.length > 0) return finalInvoices;
  return documents.filter((document) => isInvoiceDocument(document) || isCreditDocument(document));
}

export function finalCostDocuments(documents: ObjectAnalysis[]): ObjectAnalysis[] {
  const finalInvoices = documents.filter(isFinalInvoiceDocument);
  if (finalInvoices.length > 0) return finalInvoices;
  const invoices = documents.filter((document) => isInvoiceDocument(document) || isCreditDocument(document));
  if (invoices.length > 0) return invoices;
  return [];
}

export function finalGrossCost(documents: ObjectAnalysis[]): number | null {
  return sumValues(finalCostDocuments(documents).map((document) => document.totalCost.value));
}

export function normalizeTradeCluster(value: string, description = ""): MeasureCluster {
  const text = `${value} ${description}`.toLowerCase();
  const normalizedName = normalizeTradeName(value, description);
  if (standardTradeCatalog.includes(normalizedName as MeasureCluster)) return normalizedName as MeasureCluster;
  if (standardTradeCatalog.includes(value as MeasureCluster)) return value as MeasureCluster;
  if (isHazardousMaterialTrade(text)) return "Schadstoffsanierung / Asbest";
  if (isDisposalDemolitionTrade(text)) return "Rückbau / Entsorgung";
  if (/dacharbeiten|dachsanierung|dachentw[aä]sser|regenrinne|fallrohr|ziegel|abdichtung|attika/.test(text)) return "Dacharbeiten";
  if (/fassadenarbeiten|fassadensanierung|\bwdvs\b|außenfassade|aussenfassade/.test(text)) return "Fassadenarbeiten";
  if (/w[aä]rmed[aä]mm|dämm|daemm/.test(text)) return "Fassadenarbeiten";
  if (/fensterarbeiten|fenstersanierung|fenstertausch/.test(text)) return "Fensterarbeiten";
  if (/tischler/.test(text)) return "Tischlerarbeiten";
  if (/t[uü]r|tuer|tischler/.test(text)) return "Tischlerarbeiten";
  if (/balkon|loggia/.test(text)) return "Außenanlagen";
  if (/heizung|therme|kessel|radiator|fernw[aä]rme|sanit[aä]r|\b(hls|shk|san)\b/.test(text)) return "Heizung und Sanitär";
  if (/trinkwasser/.test(text)) return "Trinkwasser";
  if (/abwasser|kanal/.test(text)) return "Abwasser";
  if (/bad\s*\/\s*fliesen|fliesen|estrich|badboden|bodenaufbau/.test(text)) return "Fliesen und Estricharbeiten";
  if (/elektro|z[aä]hler|installation|leitung/.test(text)) return "Elektroarbeiten";
  if (/trockenbau|gipskarton|rigips/.test(text)) return "Sonstige";
  if (/brand|rauchmelder|rwa|feuer/.test(text)) return "Sonstige";
  if (/aufzug|lift/.test(text)) return "Sonstige";
  if (/treppenhaus|treppe|gel[aä]nder/.test(text)) return "Sonstige";
  if (/keller/.test(text)) return "Sonstige";
  if (/außen|aussen|garten|hof|pflaster|gr[uü]n/.test(text)) return "Außenanlagen";
  if (/tiefgarage|garage|stellplatz/.test(text)) return "Außenanlagen";
  if (/maler|lackier|anstrich|tapezier/.test(text)) return PAINTING_TRADE;
  if (/boden|belag|parkett|vinyl|sockel/.test(text)) return "Bodenbelagsarbeiten";
  if (/schornstein|kamin/.test(text)) return "Sonstige";
  if (/l[uü]ftung|ventilat/.test(text)) return "Sonstige";
  if (/photovoltaik|solar|pv\b/.test(text)) return "Sonstige";
  return "Sonstige";
}

export function getTradeAllocations(document: ObjectAnalysis): TradeAllocation[] {
  if (document.clusters.length > 0) {
    return document.clusters.map((cluster) => {
      const resolved = resolveClusterCost(document, cluster);
      return {
        cluster: normalizeTradeCluster(fieldText(cluster.cluster), fieldText(cluster.description)),
        document,
        ...resolved
      };
    });
  }

  if (document.measureDetails?.length) {
    const detailCount = document.measureDetails.length;
    return document.measureDetails.map((detail) => {
      const resolved = resolveMeasureDetailCost(document, detail, null, detailCount);
      return {
        cluster: normalizeTradeCluster(detail.cluster, detail.beschreibung),
        document,
        ...resolved
      };
    });
  }

  return [{
    cluster: normalizeTradeCluster("Sonstige", fieldText(document.measureDescription)),
    value: document.totalCost.value,
    document,
    rule: "document-total",
    sourceValue: document.totalCost.value,
    multiplier: null
  }];
}

export function reliableClusterCost(
  document: ObjectAnalysis,
  cluster: ObjectAnalysis["clusters"][number] | null
): number | null {
  return cluster ? resolveClusterCost(document, cluster).value : null;
}

export function reliableMeasureDetailCost(
  document: ObjectAnalysis,
  detail: NonNullable<ObjectAnalysis["measureDetails"]>[number],
  matchingCluster: ObjectAnalysis["clusters"][number] | null,
  detailCount: number
): number | null {
  return resolveMeasureDetailCost(document, detail, matchingCluster, detailCount).value;
}

export function documentUniqueKey(document: ObjectAnalysis): string {
  const sourceFileNames = document.totalCost.sources.map((source) => source.fileName).filter(Boolean);
  const sourceKey = sourceFileNames[0] ?? "";
  const documentNumber = fieldText(document.documentNumber);
  return firstKnownText(
    sourceKey && documentNumber !== "k.A." ? `${sourceKey}-${documentNumber}` : "",
    sourceKey ? `${sourceKey}-${fieldText(document.documentDate)}-${fieldText(document.totalCost)}` : "",
    documentNumber !== "k.A." ? `${fieldText(document.provider)}-${documentNumber}-${fieldText(document.totalCost)}` : "",
    document.sourceDocumentIds?.[0] ?? "",
    document.id
  );
}

function resolveClusterCost(
  document: ObjectAnalysis,
  cluster: ObjectAnalysis["clusters"][number]
): ResolvedCost {
  const clusterValue = cluster.totalCost.value;
  if (clusterValue === null) {
    const useDocumentTotal = document.clusters.length <= 1;
    return {
      value: useDocumentTotal ? document.totalCost.value : null,
      rule: "single-cluster-document-total",
      sourceValue: document.totalCost.value,
      multiplier: useDocumentTotal ? 1 : null
    };
  }
  if (document.totalCost.value === null || document.clusters.length <= 1) {
    return {
      value: clusterValue,
      rule: "stored-cluster-total",
      sourceValue: clusterValue,
      multiplier: 1
    };
  }

  const repeatedDocumentTotalCount = document.clusters.filter((entry) =>
    entry.totalCost.value !== null && Math.abs(entry.totalCost.value - document.totalCost.value!) < 0.01
  ).length;
  if (repeatedDocumentTotalCount > 1 && Math.abs(clusterValue - document.totalCost.value) < 0.01) {
    return {
      value: roundMoney(document.totalCost.value / repeatedDocumentTotalCount),
      rule: "split-repeated-document-total",
      sourceValue: document.totalCost.value,
      multiplier: 1 / repeatedDocumentTotalCount
    };
  }

  const clusterSum = sumValues(document.clusters.map((entry) => entry.totalCost.value));
  if (clusterSum !== null && clusterSum > document.totalCost.value * 1.03) {
    if (Math.abs(clusterValue - document.totalCost.value) < 0.01 && repeatedDocumentTotalCount > 1) {
      return {
        value: roundMoney(document.totalCost.value / repeatedDocumentTotalCount),
        rule: "split-repeated-document-total",
        sourceValue: document.totalCost.value,
        multiplier: 1 / repeatedDocumentTotalCount
      };
    }
    return {
      value: Math.abs(clusterValue - document.totalCost.value) < 0.01 ? null : clusterValue,
      rule: "stored-cluster-total",
      sourceValue: clusterValue,
      multiplier: 1
    };
  }

  return {
    value: clusterValue,
    rule: "stored-cluster-total",
    sourceValue: clusterValue,
    multiplier: 1
  };
}

function resolveMeasureDetailCost(
  document: ObjectAnalysis,
  detail: NonNullable<ObjectAnalysis["measureDetails"]>[number],
  matchingCluster: ObjectAnalysis["clusters"][number] | null,
  detailCount: number
): ResolvedCost {
  if (detail.summe !== null && detail.summe !== undefined) {
    return {
      value: detail.summe,
      rule: "stored-measure-total",
      sourceValue: detail.summe,
      multiplier: 1
    };
  }
  if (matchingCluster) {
    const clusterCost = resolveClusterCost(document, matchingCluster);
    if (clusterCost.value !== null) return { ...clusterCost, rule: "cluster-fallback" };
  }
  if (document.totalCost.value !== null && detailCount > 0) {
    return {
      value: roundMoney(document.totalCost.value / detailCount),
      rule: "split-document-total-by-measure",
      sourceValue: document.totalCost.value,
      multiplier: 1 / detailCount
    };
  }
  return {
    value: null,
    rule: "split-document-total-by-measure",
    sourceValue: document.totalCost.value,
    multiplier: null
  };
}

function firstKnownText(...values: string[]): string {
  return values.find((value) => value && value !== "k.A.") ?? "";
}
