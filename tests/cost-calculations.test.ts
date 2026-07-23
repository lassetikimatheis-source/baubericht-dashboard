import assert from "node:assert/strict";
import test from "node:test";
import {
  getTradeAllocations,
  normalizeTradeCluster,
  selectEffectiveCostDocuments,
  standardTradeCatalog,
  sumValues
} from "../lib/cost-calculations";
import { normalizeTradeName, PAINTING_TRADE } from "../lib/trades";
import {
  buildCalculationBreakdown,
  type AssistantDataSnapshot
} from "../lib/server/calculation-explanations";
import type {
  ExtractedField,
  MeasureCluster,
  MeasureItem,
  ObjectAnalysis
} from "../types/analysis";

test("Malerarbeiten bleibt als leeres Standardgewerk verfügbar", () => {
  assert.ok(standardTradeCatalog.includes(PAINTING_TRADE));
  assert.equal(normalizeTradeName("Maler"), PAINTING_TRADE);
  assert.equal(normalizeTradeName("Maler- und Lackierarbeiten"), PAINTING_TRADE);
  assert.equal(normalizeTradeCluster("Tapezierarbeiten"), PAINTING_TRADE);
});

test("wirksame Dokumentauswahl verhindert Angebots-/Abschlags-Doppelzählung", () => {
  const documents = [
    makeDocument({ id: "offer-a", objectNumber: "100", documentType: "Angebot", total: 100 }),
    makeDocument({ id: "progress-a", objectNumber: "100", documentType: "Abschlagsrechnung", total: 80 }),
    makeDocument({ id: "invoice-a", objectNumber: "100", documentType: "Rechnung", total: 90 }),
    makeDocument({ id: "offer-b", objectNumber: "200", documentType: "Angebot", total: 50 })
  ];

  const selected = selectEffectiveCostDocuments(documents);
  assert.deepEqual(selected.map((document) => document.id), ["invoice-a", "offer-b"]);
  assert.equal(sumValues(selected.map((document) => document.totalCost.value)), 140);
});

test("mehrfach gespeicherte Dokumentensumme wird exakt auf Gewerke verteilt", () => {
  const document = makeDocument({
    id: "split",
    objectNumber: "100",
    documentType: "Rechnung",
    total: 100,
    clusters: [
      makeCluster("Elektroarbeiten", 100),
      makeCluster("Malerarbeiten", 100)
    ]
  });

  const allocations = getTradeAllocations(document);
  assert.equal(allocations.length, 2);
  assert.equal(allocations[0].value, 50);
  assert.equal(allocations[1].value, 50);
  assert.equal(allocations[0].multiplier, 0.5);
  assert.equal(sumValues(allocations.map((allocation) => allocation.value)), 100);
});

test("Gewerk-Erklärung stimmt mit Dokument- und Positionssummen überein", () => {
  const first = makeDocument({
    id: "electrical-offer",
    objectNumber: "100",
    documentType: "Angebot",
    total: 28000,
    clusters: [makeCluster("Elektroarbeiten", 28000, [
      makeLineItem("1.1", "Leitungen", 2, "pauschal", 10000, 20000),
      makeLineItem("1.2", "Schalter", 1, "pauschal", 8000, 8000)
    ])]
  });
  const second = makeDocument({
    id: "electrical-invoice",
    objectNumber: "100",
    documentType: "Rechnung",
    total: 12500,
    clusters: [makeCluster("Elektroarbeiten", 12500)]
  });
  const third = makeDocument({
    id: "electrical-supplement",
    objectNumber: "100",
    documentType: "Nachtrag",
    total: 8000,
    clusters: [makeCluster("Elektroarbeiten", 8000)]
  });
  const snapshot = makeSnapshot([first, second, third]);

  const breakdown = buildCalculationBreakdown(
    "Warum beträgt der Wert beim Gewerk Elektro 48.500 €?",
    {
      view: "objects",
      objectId: "object-100",
      target: {
        label: "Gesamtkosten Elektro",
        calculation: "tradeTotal",
        trade: "Elektroarbeiten",
        documentIds: [first.id, second.id, third.id],
        objectId: "object-100"
      }
    },
    snapshot
  );

  assert.ok(breakdown);
  assert.equal(breakdown.result, 48500);
  assert.equal(sumValues(breakdown.operands.map((operand) => operand.value)), breakdown.result);
  assert.equal(sumValues(breakdown.sources.filter((source) => source.documentId === first.id).map((source) => source.amount)), 28000);
  assert.match(breakdown.formula ?? "", /48\.500,00/);
  assert.equal(breakdown.missing.length, 0);
});

test("Kosten pro Wohnung verwenden exakt Gesamtkosten geteilt durch sanierte Wohnungen", () => {
  const documents = [
    makeDocument({ id: "a", objectNumber: "100", documentType: "Rechnung", total: 30000, apartments: 1 }),
    makeDocument({ id: "b", objectNumber: "100", documentType: "Rechnung", total: 20000, apartments: 1 })
  ];
  const breakdown = buildCalculationBreakdown(
    "Wie wurden die Kosten pro Wohnung berechnet?",
    {
      view: "objects",
      objectId: "object-100",
      target: {
        label: "Kosten pro WE",
        calculation: "costPerApartment",
        documentIds: documents.map((document) => document.id),
        objectId: "object-100"
      }
    },
    makeSnapshot(documents)
  );

  assert.ok(breakdown);
  assert.equal(breakdown.result, 25000);
  assert.match(breakdown.formula ?? "", /50\.000,00.*2.*25\.000,00/);
});

test("fehlende sanierte Fläche wird offen ausgewiesen und nicht geschätzt", () => {
  const document = makeDocument({ id: "area", objectNumber: "100", documentType: "Rechnung", total: 10000 });
  const snapshot = makeSnapshot([document], null);
  const breakdown = buildCalculationBreakdown(
    "Wie hoch sind die Kosten pro m²?",
    {
      view: "objects",
      objectId: "object-100",
      target: {
        label: "Kosten pro m²",
        calculation: "costPerSqm",
        documentIds: [document.id],
        objectId: "object-100"
      }
    },
    snapshot
  );

  assert.ok(breakdown);
  assert.equal(breakdown.result, null);
  assert.ok(breakdown.missing.some((entry) => entry.includes("Wohnfläche")));
});

function makeSnapshot(
  inputDocuments: ObjectAnalysis[],
  renovatedArea: number | null = 100
): AssistantDataSnapshot {
  return {
    objects: [{
      id: "object-uuid-100",
      localObjectId: "object-100",
      objectNumber: "100",
      objectName: "Testobjekt",
      address: "Teststraße 1",
      renovatedLivingAreaSqm: renovatedArea,
      updatedAt: "2026-07-23T10:00:00.000Z"
    }],
    projects: [],
    assignments: [],
    reports: [],
    documents: inputDocuments.map((analysis, index) => ({
      analysis,
      databaseId: `database-${index}`,
      localDocumentId: analysis.id,
      localObjectId: "object-100",
      localProjectId: "",
      objectId: "object-uuid-100",
      projectId: "",
      fileName: `${analysis.id}.pdf`,
      updatedAt: `2026-07-23T10:0${index}:00.000Z`
    }))
  };
}

function makeDocument(input: {
  id: string;
  objectNumber: string;
  documentType: string;
  total: number;
  apartments?: number;
  clusters?: MeasureItem[];
}): ObjectAnalysis {
  const totalSource = {
    documentId: input.id,
    fileName: `${input.id}.pdf`,
    method: "Berechnung" as const,
    textSnippet: `Gesamtsumme ${input.total}`,
    confidence: 1
  };
  const text = (value: string) => field(value, input.id);
  const number = (value: number | null) => field(value, input.id);
  return {
    id: input.id,
    aiAgentName: text("PARIBUS Baukosten KI"),
    confidenceScore: number(100),
    projectSuggestion: text("Testprojekt"),
    assignmentSuggestion: text(`Objekt ${input.objectNumber}`),
    documentType: text(input.documentType),
    installmentNumber: text(""),
    projectType: text("Wohnungssanierung"),
    provider: text("Testanbieter"),
    year: number(2026),
    fund: text("Testfonds"),
    objectNumber: text(input.objectNumber),
    apartmentNumber: text("1"),
    objectAddress: text("Teststraße 1"),
    location: text("1. OG"),
    documentDate: text("2026-07-23"),
    documentNumber: text(input.id),
    renovatedApartmentCount: number(input.apartments ?? null),
    renovatedApartments: field(input.apartments ? ["1"] : [], input.id),
    livingAreaSqm: number(null),
    totalAreaSqm: number(null),
    renovatedAreaSqm: number(null),
    netCost: number(round(input.total / 1.19)),
    vatCost: number(round(input.total - input.total / 1.19)),
    totalCost: { value: input.total, sources: [totalSource], confidence: 1 },
    costPerApartment: number(null),
    costPerSqm: number(null),
    measureDescription: text(input.clusters?.map((cluster) => String(cluster.cluster.value)).join(", ") ?? ""),
    dataQuality: text("Sicher erkannt"),
    missingInformation: field<string[]>([], input.id),
    costDebug: null,
    measureDetails: input.clusters?.map((cluster, index) => ({
      abschnitt: `${index + 1}. ${cluster.cluster.value}`,
      cluster: cluster.cluster.value ?? "Sonstige",
      summe: cluster.totalCost.value,
      beschreibung: cluster.description.value ?? "",
      quelle: cluster.totalCost.sources[0]?.textSnippet ?? ""
    })),
    measureDebug: null,
    clusters: input.clusters ?? [],
    sourceDocumentIds: [input.id]
  };
}

function makeCluster(
  cluster: MeasureCluster,
  total: number,
  lineItems: MeasureItem["lineItems"] = []
): MeasureItem {
  return {
    id: `cluster-${cluster}`,
    cluster: field(cluster, "fixture"),
    description: field(cluster, "fixture"),
    totalCost: field(total, "fixture"),
    allocation: field(null, "fixture"),
    sourceDocumentId: "fixture",
    lineItems
  };
}

function makeLineItem(
  position: string,
  description: string,
  quantity: number,
  unit: string,
  unitPrice: number,
  totalPrice: number
) {
  return {
    position,
    description,
    quantity,
    unit,
    unitPrice,
    totalPrice,
    source: {
      documentId: "fixture",
      fileName: "electrical-offer.pdf",
      textSnippet: `${position} ${description}`,
      confidence: 1
    }
  };
}

function field<T>(value: T | null, documentId: string): ExtractedField<T> {
  return {
    value,
    sources: value === null ? [] : [{
      documentId,
      fileName: `${documentId}.pdf`,
      method: "Berechnung",
      textSnippet: String(value),
      confidence: 1
    }],
    confidence: value === null ? null : 1
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
