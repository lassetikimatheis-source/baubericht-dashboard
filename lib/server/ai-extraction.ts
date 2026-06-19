import OpenAI from "openai";
import type {
  CostAllocation,
  CostDebugInfo,
  ExtractedField,
  FieldSource,
  MeasureDebugInfo,
  MeasureCluster,
  MeasureDetail,
  MeasureItem,
  ObjectAnalysis,
  PortfolioAnalysisState,
  RegexMatchDebug,
  LineItem
} from "../../types/analysis";
import { emptyAnalysisState, emptyField } from "../analysis-state";
import type { ParsedDocument } from "./document-ingestion";
import { detectDuplicates, toSourceDocuments } from "./duplicates";

interface AiField<T> {
  value?: T | null;
  evidence?: string | null;
  confidence?: number | null;
}

interface AiMeasureResult {
  cluster?: AiField<MeasureCluster>;
  description?: AiField<string>;
  totalCost?: AiField<number>;
  allocation?: AiField<CostAllocation>;
  lineItems?: LineItem[];
}

interface AiObjectResult {
  confidenceScore?: AiField<number>;
  projektvorschlag?: AiField<string>;
  zuordnungsvorschlag?: AiField<string>;
  dokumenttyp?: AiField<string>;
  projektart?: AiField<string>;
  anbieter?: AiField<string>;
  dokumentnummer?: AiField<string>;
  datum?: AiField<string>;
  wohnungsnummer?: AiField<string>;
  lage?: AiField<string>;
  beschreibung_massnahmen?: AiField<string>;
  kosten_netto?: AiField<number>;
  mwst?: AiField<number>;
  kosten_brutto?: AiField<number>;
  datenqualitaet?: AiField<string>;
  fehlende_angaben?: AiField<string[]>;
  year?: AiField<number>;
  fund?: AiField<string>;
  objectNumber?: AiField<string>;
  objectAddress?: AiField<string>;
  renovatedApartmentCount?: AiField<number>;
  renovatedApartments?: AiField<string[]>;
  livingAreaSqm?: AiField<number>;
  totalAreaSqm?: AiField<number>;
  renovatedAreaSqm?: AiField<number>;
  totalCost?: AiField<number>;
  costPerApartment?: AiField<number>;
  costPerSqm?: AiField<number>;
  measures?: AiMeasureResult[];
  massnahmen_details?: MeasureDetail[];
  measureDebug?: MeasureDebugInfo | null;
}

interface AiExtractionResult {
  objects?: AiObjectResult[];
  issues?: string[];
}

const PARIBUS_AI_AGENT_NAME = "PARIBUS Baukosten KI";

export async function extractPortfolioData(
  parsedDocuments: ParsedDocument[]
): Promise<PortfolioAnalysisState> {
  const duplicates = detectDuplicates(parsedDocuments);
  const sourceDocuments = toSourceDocuments(parsedDocuments, duplicates);
  const nonDuplicateDocuments = parsedDocuments.filter(
    (document) => !duplicates.some((duplicate) => duplicate.documentId === document.id)
  );
  const readableDocuments = nonDuplicateDocuments.filter((document) => document.text.trim().length > 0);

  if (readableDocuments.length === 0) {
    return {
      ...emptyAnalysisState,
      sourceDocuments,
      duplicates,
      issues: ["Keine lesbaren Dokumentinhalte gefunden."]
    };
  }

  const deterministicIssues: string[] = [];
  const deterministicObjects = mergeObjects(
    readableDocuments.flatMap((document) => normalizeObjects([], document, deterministicIssues))
  );

  if (!process.env.OPENAI_API_KEY) {
    const totals = calculatePortfolioTotals(deterministicObjects);
    return {
      ...emptyAnalysisState,
      ...totals,
      objects: deterministicObjects,
      clusterSummary: deterministicObjects.flatMap((object) => object.clusters),
      sourceDocuments,
      duplicates,
      reviewRequiredCount:
        sourceDocuments.filter((document) => document.status === "review_required").length +
        deterministicIssues.length,
      issues: [
        "OPENAI_API_KEY fehlt. KI-Extraktion wurde nicht ausgefuehrt.",
        ...deterministicIssues
      ]
    };
  }

  const extractionResults = await runOpenAiExtractionPerDocument(readableDocuments);
  const validationIssues: string[] = [];
  const objects = mergeObjects(
    extractionResults.flatMap(({ result, document }) =>
      normalizeObjects(result.objects ?? [], document, validationIssues)
    )
  );
  const totals = calculatePortfolioTotals(objects);

  return {
    ...emptyAnalysisState,
    ...totals,
    objects,
    sourceDocuments,
    duplicates,
    clusterSummary: objects.flatMap((object) => object.clusters),
    reviewRequiredCount:
      sourceDocuments.filter((document) => document.status === "review_required").length +
      validationIssues.length,
    issues: [
      ...extractionResults.flatMap(({ result }) => result.issues ?? []),
      ...validationIssues
    ]
  };
}

async function runOpenAiExtractionPerDocument(
  documents: ParsedDocument[]
): Promise<Array<{ document: ParsedDocument; result: AiExtractionResult }>> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const results: Array<{ document: ParsedDocument; result: AiExtractionResult }> = [];

  for (const document of documents) {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            `Du bist ${PARIBUS_AI_AGENT_NAME}.`,
            "Du bist das Herzstueck eines professionellen Baukosten-, CapEx- und Sanierungsmanagement-Systems fuer Wohnimmobilienportfolios.",
            "Du unterstuetzt den Nutzer, ersetzt ihn aber nicht. Die manuelle Eingabe des Nutzers hat immer Vorrang vor KI-Ergebnissen.",
            "Arbeite in 4 Schritten: 1 Dokument verstehen, 2 Stammdatenabgleich vorbereiten, 3 Confidence Score vergeben, 4 Nutzerentscheidung offen lassen.",
            "Analysiere genau EIN Dokument. Verwende ausschliesslich Informationen, die tatsaechlich im Dokument stehen.",
            "Keine Schaetzungen. Keine Fantasiedaten. Wenn etwas fehlt: value:null und spaeter in der UI k.A.",
            "Jedes Feld muss als Objekt mit value, evidence und confidence geliefert werden.",
            "evidence muss ein kurzer Originalausschnitt aus dem Dokument sein, der den Wert belegt.",
            "Wenn du keinen Originalausschnitt findest, setze value:null, evidence:null, confidence:null.",
            "Vermische niemals Adresse, Wohnung, Massnahme oder Kosten aus anderen Objekten.",
            "Confidence-Regel: 0.95-1.00 Sicher erkannt, 0.80-0.94 Wahrscheinlich erkannt, 0.60-0.79 Pruefung empfohlen, unter 0.60 Manuelle Zuordnung erforderlich.",
            "Lieber Pruefung erforderlich als einen falschen Wert speichern.",
            "Antworte ausschliesslich als valides JSON."
          ].join(" ")
        },
        {
          role: "user",
          content: [
            "Extrahiere diese JSON-Struktur:",
            "{ objects: [{ confidenceScore:{value,evidence,confidence}, projektvorschlag:{value,evidence,confidence}, zuordnungsvorschlag:{value,evidence,confidence}, dokumenttyp:{value,evidence,confidence}, projektart:{value,evidence,confidence}, anbieter:{value,evidence,confidence}, year:{value,evidence,confidence}, datum:{value,evidence,confidence}, dokumentnummer:{value,evidence,confidence}, fund:{value,evidence,confidence}, objectNumber:{value,evidence,confidence}, wohnungsnummer:{value,evidence,confidence}, objectAddress:{value,evidence,confidence}, lage:{value,evidence,confidence}, renovatedApartmentCount:{value,evidence,confidence}, renovatedApartments:{value,evidence,confidence}, livingAreaSqm:{value,evidence,confidence}, totalAreaSqm:{value,evidence,confidence}, renovatedAreaSqm:{value,evidence,confidence}, kosten_netto:{value,evidence,confidence}, mwst:{value,evidence,confidence}, kosten_brutto:{value,evidence,confidence}, totalCost:{value,evidence,confidence}, costPerApartment:{value,evidence,confidence}, costPerSqm:{value,evidence,confidence}, beschreibung_massnahmen:{value,evidence,confidence}, datenqualitaet:{value,evidence,confidence}, fehlende_angaben:{value,evidence,confidence}, measures:[{ cluster:{value,evidence,confidence}, description:{value,evidence,confidence}, totalCost:{value,evidence,confidence}, allocation:{value,evidence,confidence} }] }], issues: [] }",
            "Erlaubte dokumenttyp-Werte: Angebot, Rechnung, Teilrechnung, Schlussrechnung, Nachtrag, Gutschrift, Auftrag, Freigabe, Sonstiges.",
            "Erlaubte cluster: Boden, Maler, Bad / Fliesen, Sanitaer / Heizung, Elektro, Tueren / Fenster, Reinigung, Planung / Dokumentation, Sonstiges.",
            "Erlaubte allocation: GE, SE oder null.",
            "Mapping: Erstbegehung -> Planung / Dokumentation; Bodenbelagsarbeiten -> Boden; Malerarbeiten -> Maler; Fliesenarbeiten und Estrich -> Bad / Fliesen; Sanitaer - Heizungsarbeiten -> Sanitaer / Heizung; Elektroarbeiten -> Elektro; Tischlerarbeiten -> Tueren / Fenster; Reinigung -> Reinigung; Zusatzarbeiten -> Sonstiges.",
            "Wenn der Betreff ein Muster wie 760005-1008 enthaelt: erster Teil objectNumber, zweiter Teil wohnungsnummer.",
            "Wenn im Betreff eine Lage wie 2.OG 3.v.li steht, als lage speichern.",
            "Projektart aus dem Dokument ableiten, z.B. Wohnungssanierung, Fassadensanierung, Dacharbeiten oder Elektroarbeiten, aber nur bei belegbarer Quelle.",
            "Wohnflaeche m2 nur fuellen, wenn eine Wohnflaeche im Dokument ausdruecklich genannt wird.",
            "Summenlogik: Regex-Erkennung und Backend-Validierung haben Vorrang. Wenn du Summen erkennst, belege sie mit Originalausschnitt. Erklaere in issues, wenn mehrere Summen gefunden wurden und welche du fachlich verwenden wuerdest.",
            "Erkenne: Nettosumme, Umsatzsteuer, MwSt, Gesamtsumme, Bruttosumme, Rechnungsbetrag.",
            "Wenn keine Wohnflaeche im Dokument steht, costPerSqm null und fehlende_angaben enthaelt Wohnflaeche in m2.",
            "Nicht jede Einzelposition als Hauptobjekt uebernehmen. Die Haupttabelle fasst je Dokument und Objekt zusammen.",
            "Rechnungsbetrag nur als totalCost uebernehmen, wenn er im selben Dokument eindeutig zu dieser Adresse oder Massnahme gehoert.",
            "Wenn Elektroarbeiten genannt sind, aber keine passende Adresse oder kein passender Preis direkt belegbar ist: nur belegte Felder fuellen, Rest null.",
            "Stammdatenabgleich vorbereiten: pruefe gedanklich Objektnummer, Adresse, Fonds, Wohnungsnummer und Projektart. Erzeuge nur einen zuordnungsvorschlag, keine endgueltige Entscheidung.",
            "Wenn kein passendes Projekt erkennbar ist, erzeuge einen projektvorschlag, z.B. Wohnungssanierung WE 1008. Der Nutzer entscheidet spaeter.",
            "datenqualitaet muss eines dieser Labels sein: Sicher erkannt, Wahrscheinlich erkannt, Pruefung empfohlen, Manuelle Zuordnung erforderlich.",
            "",
            `documentId: ${document.id}`,
            `fileName: ${document.fileName}`,
            "Vorhandene Objekte: [Objektdatenbank wird in dieser lokalen Version im Frontend gepflegt und vom Nutzer bestaetigt.]",
            "Vorhandene Projekte: [Projektdatenbank wird in dieser lokalen Version im Frontend gepflegt und vom Nutzer bestaetigt.]",
            "Dokumenttext:",
            document.text.slice(0, 18000)
          ].join("\n")
        }
      ]
    });

    const content = response.choices[0]?.message?.content || "{}";
    results.push({ document, result: JSON.parse(content) as AiExtractionResult });
  }

  return results;
}

function normalizeObjects(
  objects: AiObjectResult[],
  document: ParsedDocument,
  issues: string[]
): ObjectAnalysis[] {
  const standardOffer = parseStandardOffer(document, issues);
  const fallbackObject = parseGenericDocument(document, issues);
  const sourceObjects = standardOffer
    ? [mergeAiObject(standardOffer, objects[0] ?? {})]
    : objects.length > 0
      ? objects.map((object) => enrichAiObjectWithFallback(object, fallbackObject))
      : [fallbackObject];

  return sourceObjects.map((object, objectIndex) => {
    const costDebug = extractCostSummary(document);
    const objectNumber = verifiedField(object.objectNumber, document, "Objektnummer", issues);
    const objectAddress = verifiedField(object.objectAddress, document, "Objektadresse", issues);
    const id = objectNumber.value || objectAddress.value || `${document.id}-object-${objectIndex + 1}`;
    const renovatedApartmentCount = verifiedField(
      object.renovatedApartmentCount,
      document,
      "Anzahl sanierter Wohnungen",
      issues
    );
    const netCost = costFieldFromDebug(costDebug.finalValues.net, document)
      ?? verifiedField(object.kosten_netto, document, "Nettosumme", issues);
    const vatCost = costFieldFromDebug(costDebug.finalValues.vat, document)
      ?? verifiedField(object.mwst, document, "Umsatzsteuer", issues);
    const totalCost = costFieldFromDebug(costDebug.finalValues.gross, document)
      ?? verifiedField(object.kosten_brutto ?? object.totalCost, document, "Gesamtkosten", issues);
    const costPerApartment = totalCost.value !== null && renovatedApartmentCount.value === 1
      ? calculatedField(totalCost.value, document, "Kosten pro Wohnung aus Bruttosumme und 1 sanierter Wohnung")
      : verifiedField(object.costPerApartment, document, "Kosten pro Wohnung", issues);

    const projectSuggestion = metaStringField(
      object.projektvorschlag,
      document,
      generatedProjectSuggestion(object, objectNumber.value, objectAddress.value)
    );
    const assignmentSuggestion = metaStringField(
      object.zuordnungsvorschlag,
      document,
      generatedAssignmentSuggestion(objectNumber.value, objectAddress.value, object.fund?.value ?? null)
    );
    const confidenceScore = metaNumberField(
      object.confidenceScore,
      document,
      estimateConfidenceScore([objectNumber, objectAddress, renovatedApartmentCount, totalCost])
    );
    const dataQuality = metaStringField(
      object.datenqualitaet,
      document,
      qualityFromScore(confidenceScore.value)
    );

    return {
      id: String(id),
      aiAgentName: agentField(document),
      confidenceScore,
      projectSuggestion,
      assignmentSuggestion,
      documentType: verifiedField(object.dokumenttyp, document, "Dokumenttyp", issues),
      projectType: verifiedField(object.projektart, document, "Projektart", issues),
      provider: verifiedField(object.anbieter, document, "Anbieter", issues),
      year: verifiedField(object.year, document, "Jahr", issues),
      documentDate: verifiedField(object.datum, document, "Datum", issues),
      documentNumber: verifiedField(object.dokumentnummer, document, "Dokumentnummer", issues),
      fund: verifiedField(object.fund, document, "Fonds", issues),
      objectNumber,
      apartmentNumber: verifiedField(object.wohnungsnummer, document, "Wohnungsnummer", issues),
      objectAddress,
      location: verifiedField(object.lage, document, "Lage", issues),
      renovatedApartmentCount,
      renovatedApartments: verifiedField(
        object.renovatedApartments,
        document,
        "Welche Wohnungen saniert wurden",
        issues
      ),
      livingAreaSqm: verifiedField(object.livingAreaSqm, document, "Wohnflaeche", issues),
      totalAreaSqm: verifiedField(object.totalAreaSqm, document, "Gesamtflaeche", issues),
      renovatedAreaSqm: verifiedField(object.renovatedAreaSqm, document, "Sanierte Flaeche", issues),
      netCost,
      vatCost,
      totalCost,
      costPerApartment,
      costPerSqm: verifiedField(object.costPerSqm, document, "Kosten pro qm", issues),
      measureDescription: verifiedField(object.beschreibung_massnahmen, document, "Beschreibung Massnahmen", issues),
      dataQuality,
      missingInformation: verifiedField(object.fehlende_angaben, document, "Fehlende Angaben", issues),
      costDebug,
      measureDetails: object.massnahmen_details ?? [],
      measureDebug: object.measureDebug ?? null,
      clusters: (object.measures ?? []).map((measure, measureIndex) =>
        normalizeMeasure(measure, document, `${id}-measure-${measureIndex + 1}`, issues)
      ),
      sourceDocumentIds: [document.id]
    };
  });
}

function normalizeMeasure(
  measure: AiMeasureResult,
  document: ParsedDocument,
  id: string,
  issues: string[]
): MeasureItem {
  return {
    id,
    cluster: verifiedField(measure.cluster, document, "Massnahmencluster", issues),
    description: verifiedField(measure.description, document, "Massnahmenbeschreibung", issues),
    totalCost: verifiedField(measure.totalCost, document, "Massnahmenkosten", issues),
    allocation: verifiedField(measure.allocation, document, "GE/SE", issues),
    sourceDocumentId: document.id,
    lineItems: (measure.lineItems ?? []).map((item) => ({
      ...item,
      source: {
        ...item.source,
        documentId: document.id,
        fileName: document.fileName,
        page: document.fileType === "pdf" ? 1 : null
      }
    }))
  };
}

function verifiedField<T>(
  field: AiField<T> | undefined,
  document: ParsedDocument,
  label: string,
  issues: string[]
): ExtractedField<T> {
  if (!field || field.value === null || field.value === undefined || field.value === "") {
    return emptyField<T>();
  }

  const evidence = String(field.evidence || "").trim();
  if (!evidence || !documentContainsEvidence(document.text, evidence)) {
    issues.push(`${label} aus ${document.fileName} wurde verworfen: kein passender Quellenbeleg im Dokument.`);
    return emptyField<T>();
  }

  if (typeof field.value === "number" && !evidenceSupportsNumber(field.value, evidence)) {
    issues.push(`${label} aus ${document.fileName} wurde verworfen: Betrag/Zahl nicht im Quellenbeleg gefunden.`);
    return emptyField<T>();
  }

  return {
    value: field.value,
    sources: [sourceFromEvidence(document, evidence, field.confidence ?? 0.8)],
    confidence: field.confidence ?? 0.8
  };
}

function documentContainsEvidence(text: string, evidence: string): boolean {
  const normalizedText = normalizeText(text);
  const normalizedEvidence = normalizeText(evidence);
  if (normalizedEvidence.length < 4) return false;
  return normalizedText.includes(normalizedEvidence);
}

function evidenceSupportsNumber(value: number, evidence: string): boolean {
  const candidates = numberCandidates(value);
  const normalizedEvidence = normalizeText(evidence);
  return candidates.some((candidate) => normalizedEvidence.includes(normalizeText(candidate)));
}

function numberCandidates(value: number): string[] {
  const rounded = Math.round(value * 100) / 100;
  const noDecimals = Math.round(value);
  return [
    String(value),
    String(rounded),
    String(noDecimals),
    rounded.toLocaleString("de-DE"),
    rounded.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    noDecimals.toLocaleString("de-DE")
  ];
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[€]/g, "eur")
    .replace(/\u00a0/g, " ")
    .trim();
}

function sourceFromEvidence(document: ParsedDocument, evidence: string, confidence: number): FieldSource {
  return {
    documentId: document.id,
    fileName: document.fileName,
    method: "KI",
    page: document.fileType === "pdf" ? 1 : null,
    textSnippet: evidence,
    confidence
  };
}

function mergeObjects(objects: ObjectAnalysis[]): ObjectAnalysis[] {
  const byKey = new Map<string, ObjectAnalysis>();

  for (const object of objects) {
    const key = object.objectNumber.value || object.objectAddress.value || object.id;
    const existing = byKey.get(String(key));
    if (!existing) {
      byKey.set(String(key), object);
      continue;
    }

    byKey.set(String(key), {
      ...existing,
      aiAgentName: preferField(existing.aiAgentName, object.aiAgentName),
      confidenceScore: preferField(existing.confidenceScore, object.confidenceScore),
      projectSuggestion: preferField(existing.projectSuggestion, object.projectSuggestion),
      assignmentSuggestion: preferField(existing.assignmentSuggestion, object.assignmentSuggestion),
      year: preferField(existing.year, object.year),
      documentType: preferField(existing.documentType, object.documentType),
      projectType: preferField(existing.projectType, object.projectType),
      provider: preferField(existing.provider, object.provider),
      fund: preferField(existing.fund, object.fund),
      documentDate: preferField(existing.documentDate, object.documentDate),
      documentNumber: preferField(existing.documentNumber, object.documentNumber),
      objectNumber: preferField(existing.objectNumber, object.objectNumber),
      apartmentNumber: preferField(existing.apartmentNumber, object.apartmentNumber),
      objectAddress: preferField(existing.objectAddress, object.objectAddress),
      location: preferField(existing.location, object.location),
      renovatedApartmentCount: preferField(existing.renovatedApartmentCount, object.renovatedApartmentCount),
      renovatedApartments: preferField(existing.renovatedApartments, object.renovatedApartments),
      livingAreaSqm: preferField(existing.livingAreaSqm, object.livingAreaSqm),
      totalAreaSqm: preferField(existing.totalAreaSqm, object.totalAreaSqm),
      renovatedAreaSqm: preferField(existing.renovatedAreaSqm, object.renovatedAreaSqm),
      netCost: combineNumberFields(existing.netCost, object.netCost),
      vatCost: combineNumberFields(existing.vatCost, object.vatCost),
      totalCost: combineNumberFields(existing.totalCost, object.totalCost),
      costPerApartment: preferField(existing.costPerApartment, object.costPerApartment),
      costPerSqm: preferField(existing.costPerSqm, object.costPerSqm),
      measureDescription: preferField(existing.measureDescription, object.measureDescription),
      dataQuality: preferField(existing.dataQuality, object.dataQuality),
      missingInformation: preferField(existing.missingInformation, object.missingInformation),
      costDebug: existing.costDebug ?? object.costDebug,
      measureDetails: [...(existing.measureDetails ?? []), ...(object.measureDetails ?? [])],
      measureDebug: existing.measureDebug ?? object.measureDebug ?? null,
      clusters: [...existing.clusters, ...object.clusters],
      sourceDocumentIds: Array.from(new Set([...existing.sourceDocumentIds, ...object.sourceDocumentIds]))
    });
  }

  return Array.from(byKey.values());
}

function preferField<T>(current: ExtractedField<T>, next: ExtractedField<T>): ExtractedField<T> {
  if (current.value !== null) return current;
  return next;
}

function combineNumberFields(
  current: ExtractedField<number>,
  next: ExtractedField<number>
): ExtractedField<number> {
  if (current.value === null) return next;
  if (next.value === null) return current;
  return {
    value: current.value + next.value,
    sources: [...current.sources, ...next.sources],
    confidence: Math.min(current.confidence ?? 0.7, next.confidence ?? 0.7)
  };
}

function agentField(document: ParsedDocument): ExtractedField<string> {
  return {
    value: PARIBUS_AI_AGENT_NAME,
    sources: [{
      documentId: document.id,
      fileName: document.fileName,
      method: "KI",
      page: document.fileType === "pdf" ? 1 : null,
      textSnippet: "Analyse-Agent",
      confidence: 1
    }],
    confidence: 1
  };
}

function metaStringField(
  field: AiField<string> | undefined,
  document: ParsedDocument,
  fallback: string | null
): ExtractedField<string> {
  const value = field?.value ?? fallback;
  if (!value) return emptyField<string>();
  return {
    value,
    sources: [{
      documentId: document.id,
      fileName: document.fileName,
      method: "KI",
      page: document.fileType === "pdf" ? 1 : null,
      textSnippet: field?.evidence ?? "Aus erkannten Dokumentfeldern abgeleitet",
      confidence: field?.confidence ?? 0.75
    }],
    confidence: field?.confidence ?? 0.75
  };
}

function metaNumberField(
  field: AiField<number> | undefined,
  document: ParsedDocument,
  fallback: number | null
): ExtractedField<number> {
  const value = field?.value ?? fallback;
  if (value === null || value === undefined) return emptyField<number>();
  const normalized = value > 1 ? value : Math.round(value * 100);
  return {
    value: normalized,
    sources: [{
      documentId: document.id,
      fileName: document.fileName,
      method: "KI",
      page: document.fileType === "pdf" ? 1 : null,
      textSnippet: field?.evidence ?? "Aus Feld-Confidence berechnet",
      confidence: field?.confidence ?? normalized / 100
    }],
    confidence: field?.confidence ?? normalized / 100
  };
}

function estimateConfidenceScore(fields: Array<ExtractedField<unknown>>): number | null {
  const present = fields.filter((field) => field.value !== null);
  if (present.length === 0) return null;
  const average = present.reduce((sum, field) => sum + (field.confidence ?? 0.7), 0) / present.length;
  return Math.round(average * 100);
}

function generatedProjectSuggestion(
  object: AiObjectResult,
  objectNumber: string | null,
  objectAddress: string | null
): string | null {
  const projectType = object.projektart?.value ?? null;
  const apartment = object.wohnungsnummer?.value ?? null;
  const objectLabel = objectNumber ?? objectAddress;
  if (!projectType && !apartment && !objectLabel) return null;
  return [projectType, apartment ? `WE ${apartment}` : null, objectLabel].filter(Boolean).join(" ");
}

function generatedAssignmentSuggestion(
  objectNumber: string | null,
  objectAddress: string | null,
  fund: string | null
): string | null {
  const parts = [
    objectNumber ? `Objektnummer ${objectNumber}` : null,
    objectAddress ? `Adresse ${objectAddress}` : null,
    fund ? `Fonds ${fund}` : null
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return `Zuordnung pruefen anhand: ${parts.join(", ")}`;
}

function qualityFromScore(score: number | null): string | null {
  if (score === null) return null;
  if (score >= 95) return "Sicher erkannt";
  if (score >= 80) return "Wahrscheinlich erkannt";
  if (score >= 60) return "Pruefung empfohlen";
  return "Manuelle Zuordnung erforderlich";
}

const moneyValuePattern = "([0-9]{1,3}(?:\\.[0-9]{3})*,[0-9]{2}|[0-9]+,[0-9]{2})\\s*(?:€|EUR|Euro)?";

const costPatterns: Array<{ key: "net" | "vat" | "gross"; label: string; pattern: RegExp }> = [
  {
    key: "net",
    label: "Netto",
    pattern: new RegExp(`(?:Nettosumme|\\bNetto\\b|Zwischensumme)[^\\n\\r]{0,80}?${moneyValuePattern}`, "gi")
  },
  {
    key: "vat",
    label: "MwSt.",
    pattern: new RegExp(`(?:Umsatzsteuer|MwSt\\.?|Mehrwertsteuer)(?:\\s*\\d{1,2}\\s*%)?[^\\n\\r]{0,80}?${moneyValuePattern}`, "gi")
  },
  {
    key: "gross",
    label: "Brutto",
    pattern: new RegExp(`(?:Gesamtsumme|Gesamtbetrag|Bruttosumme|Rechnungsbetrag|Angebotssumme)[^\\n\\r]{0,80}?${moneyValuePattern}`, "gi")
  }
];

function extractCostSummary(document: ParsedDocument): CostDebugInfo {
  const text = document.text;
  const summaryBlock = findSummaryBlock(text);
  const searchableText = summaryBlock ?? text;
  const matches = findCostMatches(searchableText);
  const fallbackMatches = summaryBlock ? findCostMatches(text) : [];
  const allMatches = mergeCostMatches(matches, fallbackMatches);
  const net = pickLastMatch(allMatches, "net") ?? emptyCostMatch("Netto");
  let vat = pickLastMatch(allMatches, "vat") ?? emptyCostMatch("MwSt.");
  let gross = pickLastMatch(allMatches, "gross") ?? emptyCostMatch("Brutto");
  const notes: string[] = [];

  if (vat.value === null && net.value !== null && /(?:Umsatzsteuer|MwSt\.?|Mehrwertsteuer)\s*19\s*%/i.test(text)) {
    vat = {
      label: "MwSt.",
      value: roundMoney(net.value * 0.19),
      raw: "Berechnet aus Nettosumme und Umsatzsteuer 19 %",
      source: "Berechnung"
    };
    notes.push("MwSt. wurde berechnet, weil Umsatzsteuer 19 % erkannt wurde.");
  }

  if (gross.value === null && net.value !== null && vat.value !== null) {
    gross = {
      label: "Brutto",
      value: roundMoney(net.value + vat.value),
      raw: "Berechnet aus Nettosumme + MwSt.",
      source: "Berechnung"
    };
    notes.push("Bruttosumme wurde berechnet, weil Netto und MwSt. sicher erkannt wurden.");
  }

  if (gross.value !== null && net.value === null && vat.value === null) {
    notes.push("Nur Bruttosumme erkannt. Netto und MwSt. bleiben k.A.");
  }

  if (allMatches.length === 0) {
    notes.push("Kein Summenbegriff mit Betrag im Rohtext gefunden.");
  }

  return {
    summaryBlock,
    matches: allMatches,
    finalValues: { net, vat, gross },
    notes
  };
}

function findSummaryBlock(text: string): string | null {
  const terms = [
    "Nettosumme",
    "Netto",
    "Zwischensumme",
    "Umsatzsteuer",
    "MwSt",
    "Mehrwertsteuer",
    "Gesamtsumme",
    "Gesamtbetrag",
    "Bruttosumme",
    "Rechnungsbetrag",
    "Angebotssumme"
  ];
  const normalized = text.replace(/\r/g, "");
  const lower = normalized.toLowerCase();
  const indexes = terms
    .map((term) => lower.lastIndexOf(term.toLowerCase()))
    .filter((index) => index >= 0);
  if (indexes.length === 0) return null;
  const start = Math.max(0, Math.min(...indexes) - 700);
  const end = Math.min(normalized.length, Math.max(...indexes) + 900);
  return normalized.slice(start, end).trim();
}

function findCostMatches(text: string): Array<RegexMatchDebug & { key: "net" | "vat" | "gross" }> {
  const matches: Array<RegexMatchDebug & { key: "net" | "vat" | "gross" }> = [];
  for (const costPattern of costPatterns) {
    costPattern.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = costPattern.pattern.exec(text)) && matches.length < 80) {
      const value = parseGermanMoney(match[1]);
      const raw = match[0].replace(/\s+/g, " ").trim();
      matches.push({
        key: costPattern.key,
        label: costPattern.label,
        value,
        raw,
        source: "Regex"
      });
    }
  }
  return matches;
}

function mergeCostMatches(
  primary: Array<RegexMatchDebug & { key: "net" | "vat" | "gross" }>,
  fallback: Array<RegexMatchDebug & { key: "net" | "vat" | "gross" }>
): Array<RegexMatchDebug & { key: "net" | "vat" | "gross" }> {
  const seen = new Set(primary.map((match) => `${match.key}:${match.raw}:${match.value}`));
  return [
    ...primary,
    ...fallback.filter((match) => {
      const key = `${match.key}:${match.raw}:${match.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
  ];
}

function pickLastMatch(
  matches: Array<RegexMatchDebug & { key: "net" | "vat" | "gross" }>,
  key: "net" | "vat" | "gross"
): RegexMatchDebug | null {
  const found = matches.filter((match) => match.key === key && match.value !== null);
  if (found.length === 0) return null;
  const match = found[found.length - 1];
  return {
    label: match.label,
    value: match.value,
    raw: match.raw,
    source: match.source
  };
}

function emptyCostMatch(label: string): RegexMatchDebug {
  return { label, value: null, raw: "", source: "Regex" };
}

function costFieldFromDebug(match: RegexMatchDebug, document: ParsedDocument): ExtractedField<number> | null {
  if (match.value === null) return null;
  return {
    value: match.value,
    sources: [{
      documentId: document.id,
      fileName: document.fileName,
      method: match.source,
      page: document.fileType === "pdf" ? 1 : null,
      textSnippet: match.raw,
      confidence: match.source === "Regex" ? 0.96 : 0.9
    }],
    confidence: match.source === "Regex" ? 0.96 : 0.9
  };
}

function calculatedField(value: number, document: ParsedDocument, note: string): ExtractedField<number> {
  return {
    value: roundMoney(value),
    sources: [{
      documentId: document.id,
      fileName: document.fileName,
      method: "Berechnung",
      page: document.fileType === "pdf" ? 1 : null,
      textSnippet: note,
      confidence: 0.9
    }],
    confidence: 0.9
  };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseStandardOffer(document: ParsedDocument, issues: string[]): AiObjectResult | null {
  const text = document.text;
  if (!/Angebot/i.test(text) || !/Beleg-Nr\./i.test(text)) return null;

  const subject = text.match(/Wohnungssanierung\s+(.+?)\s+(\d{6})-(\d{3,})/i);
  const date = text.match(/Datum:\s*(\d{2}\.\d{2}\.\d{4})/i);
  const documentNumber = text.match(/Beleg-Nr\.:\s*([A-Z]\d{4}\/\d{4})/i);
  const fund = text.match(/(Ampega Investment GmbH[^\n]+)/i);
  const provider = text.match(/^(Artis Projekte GmbH)/im);
  const costSummary = extractCostSummary(document);
  const net = costSummary.finalValues.net;
  const vat = costSummary.finalValues.vat;
  const gross = costSummary.finalValues.gross;

  if (!subject) {
    issues.push(`${document.fileName}: Angebotsformat erkannt, aber Betreff mit Objektnummer-Wohnung wurde nicht gefunden.`);
    return null;
  }

  const subjectEvidence = subject[0];
  const locationAndAddress = parseSubject(subject[1]);
  const objectNumber = subject[2];
  const apartmentNumber = subject[3];
  const grossValue = gross.value;
  const year = date ? Number(date[1].slice(-4)) : null;
  const measureAnalysis = parseOfferMeasures(text);
  const missing: string[] = [];

  if (!/wohnfl[aä]che|m² wohnfl|m2 wohnfl/i.test(text)) {
    missing.push("Wohnflaeche in m2");
  }

  return {
    dokumenttyp: aiField("Angebot", "Angebot"),
    projektart: aiField("Wohnungssanierung", subjectEvidence),
    anbieter: aiField(provider?.[1] ?? null, provider?.[0] ?? null),
    year: aiField(year, date?.[0] ?? documentNumber?.[0] ?? null),
    datum: aiField(date?.[1] ?? null, date?.[0] ?? null),
    dokumentnummer: aiField(documentNumber?.[1] ?? null, documentNumber?.[0] ?? null),
    fund: aiField(cleanFund(fund?.[1] ?? null), fund?.[0] ?? null),
    objectNumber: aiField(objectNumber, subjectEvidence),
    wohnungsnummer: aiField(apartmentNumber, subjectEvidence),
    objectAddress: aiField(locationAndAddress.address, subjectEvidence),
    lage: aiField(locationAndAddress.location, subjectEvidence),
    renovatedApartmentCount: aiField(1, subjectEvidence),
    renovatedApartments: aiField([apartmentNumber], subjectEvidence),
    livingAreaSqm: aiField(null, null),
    totalAreaSqm: aiField(null, null),
    renovatedAreaSqm: aiField(null, null),
    kosten_netto: aiField(net.value, net.raw || null),
    mwst: aiField(vat.value, vat.raw || null),
    kosten_brutto: aiField(grossValue, gross.raw || null),
    totalCost: aiField(grossValue, gross.raw || null),
    costPerApartment: aiField(grossValue, gross.raw || null),
    costPerSqm: aiField(null, null),
    beschreibung_massnahmen: aiField(buildOfferMeasureSummary(measureAnalysis.details), measureAnalysis.details[0]?.quelle ?? null),
    datenqualitaet: aiField("Sicher erkannt", subjectEvidence),
    fehlende_angaben: aiField(missing.length ? missing : null, subjectEvidence),
    measures: measureAnalysis.measures,
    massnahmen_details: measureAnalysis.details,
    measureDebug: measureAnalysis.debug
  };
}

function parseGenericDocument(document: ParsedDocument, issues: string[]): AiObjectResult {
  const text = document.text;
  const costSummary = extractCostSummary(document);
  const objectNumber = firstRegex(text, /\b(\d{6})(?:-\d{3,})?\b/);
  const address = firstAddress(text);
  const date = firstRegex(text, /\b(\d{2}\.\d{2}\.\d{4})\b/);
  const documentNumber = firstRegex(text, /\b(?:Rechnung(?:s)?(?:nummer|nr\.?)?|Beleg-Nr\.?|Angebot(?:s)?(?:nummer|nr\.?)?)\s*:?\s*([A-Z]?\d{2,6}[/-]\d{2,6}|[A-Z]\d{4}[/-]\d{4}|\d{4,})/i);
  const provider = firstProvider(text);
  const fund = firstRegex(text, /((?:Ampega|Paribus|Tredev|Fonds)[^\n]{0,90})/i);
  const livingArea = firstNumberRegex(text, /(\d+(?:[.,]\d+)?)\s*(?:m²|m2|qm)\b/i);
  const apartmentCount = firstNumberRegex(text, /(?:Anzahl\s+sanierte\s+Wohnungen|sanierte\s+WE|Wohnungen\s+betroffen)\D{0,30}(\d{1,4})/i);
  const documentType = detectDocumentType(text);
  const measures = detectMeasures(text);
  const primaryMeasure = measures[0] ?? null;
  const gross = costSummary.finalValues.gross.value;
  const recognized = [
    objectNumber?.value,
    address?.value,
    date?.value,
    documentNumber?.value,
    provider?.value,
    fund?.value,
    measures.map((measure) => measure.cluster).join(", "),
    costSummary.finalValues.net.value,
    costSummary.finalValues.vat.value,
    gross
  ].filter((value) => value !== null && value !== undefined && value !== "").length;

  if (recognized === 0) {
    issues.push(`${document.fileName}: Text wurde gelesen, aber keine Objektwerte oder Kostenmuster erkannt.`);
  }

  return {
    dokumenttyp: aiField(documentType.value, documentType.evidence),
    projektart: aiField(primaryMeasure?.projectType ?? null, primaryMeasure?.evidence ?? null),
    anbieter: aiField(provider?.value ?? null, provider?.evidence ?? null),
    year: aiField(date?.value ? Number(date.value.slice(-4)) : null, date?.evidence ?? null),
    datum: aiField(date?.value ?? null, date?.evidence ?? null),
    dokumentnummer: aiField(documentNumber?.value ?? null, documentNumber?.evidence ?? null),
    fund: aiField(fund?.value ?? null, fund?.evidence ?? null),
    objectNumber: aiField(objectNumber?.value ?? null, objectNumber?.evidence ?? null),
    wohnungsnummer: aiField(firstRegex(text, /\b\d{6}-(\d{3,})\b/)?.value ?? null, objectNumber?.evidence ?? null),
    objectAddress: aiField(address?.value ?? null, address?.evidence ?? null),
    lage: aiField(firstRegex(text, /\b(\d+\.OG\s+\d+\.?v\.?li|\d+\.OG\s+\d+\.?v\.?re)\b/i)?.value ?? null, objectNumber?.evidence ?? null),
    renovatedApartmentCount: aiField(apartmentCount?.value ?? null, apartmentCount?.evidence ?? null),
    renovatedApartments: aiField(null, null),
    livingAreaSqm: aiField(livingArea?.value ?? null, livingArea?.evidence ?? null),
    totalAreaSqm: aiField(null, null),
    renovatedAreaSqm: aiField(null, null),
    kosten_netto: aiField(costSummary.finalValues.net.value, costSummary.finalValues.net.raw || null),
    mwst: aiField(costSummary.finalValues.vat.value, costSummary.finalValues.vat.raw || null),
    kosten_brutto: aiField(gross, costSummary.finalValues.gross.raw || null),
    totalCost: aiField(gross, costSummary.finalValues.gross.raw || null),
    costPerApartment: aiField(gross !== null && apartmentCount?.value ? roundMoney(gross / apartmentCount.value) : null, costSummary.finalValues.gross.raw || null),
    costPerSqm: aiField(gross !== null && livingArea?.value ? roundMoney(gross / livingArea.value) : null, costSummary.finalValues.gross.raw || null),
    beschreibung_massnahmen: aiField(measures.length ? measures.map((measure) => measure.description).join(", ") : null, primaryMeasure?.evidence ?? null),
    datenqualitaet: aiField(recognized > 4 ? "Pruefung empfohlen" : "Manuelle Zuordnung erforderlich", address?.evidence ?? objectNumber?.evidence ?? provider?.evidence ?? null),
    fehlende_angaben: aiField(missingFromGeneric({ objectNumber, address, gross, provider }), address?.evidence ?? objectNumber?.evidence ?? null),
    measures: measures.map((measure) => ({
      cluster: aiField(measure.cluster, measure.evidence),
      description: aiField(measure.description, measure.evidence),
      totalCost: aiField(measure.sum, measure.sumEvidence),
      allocation: aiField(null, null)
    })),
    massnahmen_details: measures.map((measure) => ({
      abschnitt: measure.description,
      cluster: measure.cluster,
      summe: measure.sum,
      beschreibung: measure.description,
      quelle: measure.sumEvidence ?? measure.evidence
    })),
    measureDebug: measures.length ? {
      headings: [],
      sumLines: measures.filter((measure) => measure.sum !== null).map((measure, index) => ({
        section: index + 1,
        heading: measure.description,
        value: measure.sum,
        raw: measure.sumEvidence ?? measure.evidence
      })),
      mappings: measures.map((measure, index) => ({
        section: index + 1,
        heading: measure.description,
        cluster: measure.cluster,
        value: measure.sum,
        description: measure.description
      })),
      notes: ["Generische Regex-Erkennung aus Rohtext verwendet. Alle gefundenen Gewerke wurden uebernommen."]
    } : null
  };
}

function firstRegex(text: string, pattern: RegExp): { value: string; evidence: string } | null {
  const match = text.match(pattern);
  if (!match) return null;
  return { value: (match[1] ?? match[0]).trim(), evidence: match[0].replace(/\s+/g, " ").trim() };
}

function firstNumberRegex(text: string, pattern: RegExp): { value: number; evidence: string } | null {
  const match = firstRegex(text, pattern);
  if (!match) return null;
  const value = Number(match.value.replace(",", "."));
  return Number.isFinite(value) ? { value, evidence: match.evidence } : null;
}

function firstAddress(text: string): { value: string; evidence: string } | null {
  const patterns = [
    /\b([A-ZÄÖÜ][A-Za-zÄÖÜäöüß.-]+(?:straße|strasse|weg|allee|platz|ring|damm)\s+\d+[a-z]?(?:\s*,?\s*\d{5}\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß.-]+)?)/i,
    /\b(Pamirweg\s+\d+[a-z]?(?:\s+in\s+Hamburg|,\s*Hamburg)?)/i
  ];
  for (const pattern of patterns) {
    const match = firstRegex(text, pattern);
    if (match) return { ...match, value: match.value.replace(/\s+in\s+/i, ", ") };
  }
  return null;
}

function firstProvider(text: string): { value: string; evidence: string } | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const line = lines.find((entry) => /\b(GmbH|AG|KG|Gbr|GmbH\s*&\s*Co\.)\b/i.test(entry) && !/Investment|Fonds/i.test(entry));
  return line ? { value: line.replace(/\s+/g, " "), evidence: line } : null;
}

function detectDocumentType(text: string): { value: string | null; evidence: string | null } {
  const types = ["Schlussrechnung", "Teilrechnung", "Rechnung", "Angebot", "Nachtrag", "Gutschrift", "Auftrag", "Freigabe"];
  const found = types.find((type) => new RegExp(type, "i").test(text));
  return found ? { value: found, evidence: text.match(new RegExp(found, "i"))?.[0] ?? found } : { value: null, evidence: null };
}

function detectMeasures(text: string): Array<{
  cluster: MeasureCluster;
  description: string;
  projectType: string;
  evidence: string;
  sum: number | null;
  sumEvidence: string | null;
}> {
  const mappings: Array<{ pattern: RegExp; cluster: MeasureCluster; description: string; projectType: string }> = [
    { pattern: /Dach(?:arbeiten|sanierung)?/i, cluster: "Sonstiges", description: "Dacharbeiten", projectType: "Dacharbeiten" },
    { pattern: /Fassade(?:narbeiten|nsanierung)?/i, cluster: "Sonstiges", description: "Fassadenarbeiten", projectType: "Fassadensanierung" },
    { pattern: /Fenster(?:arbeiten|tausch)?/i, cluster: "Fenster", description: "Fensterarbeiten", projectType: "Fensterarbeiten" },
    { pattern: /Heizung(?:sarbeiten)?/i, cluster: "Heizung", description: "Heizungsarbeiten", projectType: "Heizungsarbeiten" },
    { pattern: /Elektro(?:arbeiten)?/i, cluster: "Elektro", description: "Elektroarbeiten", projectType: "Elektroarbeiten" },
    { pattern: /Sanit(?:aer|\u00e4r)(?:arbeiten)?/i, cluster: "Sanitaer / Heizung", description: "Sanitaerarbeiten", projectType: "Sanitaerarbeiten" },
    { pattern: /Maler(?:arbeiten)?/i, cluster: "Maler", description: "Malerarbeiten", projectType: "Malerarbeiten" },
    { pattern: /Boden(?:belagsarbeiten|arbeiten)?/i, cluster: "Boden", description: "Bodenarbeiten", projectType: "Bodenarbeiten" },
    { pattern: /Fliesen(?:arbeiten)?|Estrich/i, cluster: "Bad / Fliesen", description: "Fliesenarbeiten und Estrich", projectType: "Bad- / Fliesenarbeiten" },
    { pattern: /Tischler(?:arbeiten)?|T(?:ue|\u00fc)ren/i, cluster: "Tueren / Fenster", description: "Tischlerarbeiten / Tueren", projectType: "Tischlerarbeiten" },
    { pattern: /Reinigung/i, cluster: "Reinigung", description: "Reinigung", projectType: "Reinigung" },
    { pattern: /Wohnungssanierung/i, cluster: "Sonstiges", description: "Wohnungssanierung", projectType: "Wohnungssanierung" }
  ];
  const found = new Map<string, {
    cluster: MeasureCluster;
    description: string;
    projectType: string;
    evidence: string;
    sum: number | null;
    sumEvidence: string | null;
  }>();

  mappings.forEach((mapping) => {
    const match = text.match(mapping.pattern);
    if (!match) return;
    const sumMatch = findMeasureSum(text, mapping.pattern);
    found.set(mapping.cluster, {
      cluster: mapping.cluster,
      description: mapping.description,
      projectType: mapping.projectType,
      evidence: match[0],
      sum: sumMatch.value,
      sumEvidence: sumMatch.raw
    });
  });

  return Array.from(found.values());
}

function findMeasureSum(text: string, pattern: RegExp): { value: number | null; raw: string | null } {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const money = /([\d.]+,\d{2})\s*(?:\u20ac|EUR|Euro)?/i;
  const line = lines.find((entry) => /Summe/i.test(entry) && pattern.test(entry) && money.test(entry));
  if (!line) return { value: null, raw: null };
  return { value: parseGermanMoney(line.match(money)?.[1] ?? null), raw: line };
}

function detectPrimaryMeasure(text: string): { cluster: MeasureCluster; description: string; projectType: string; evidence: string } | null {
  const mappings: Array<{ pattern: RegExp; cluster: MeasureCluster; description: string; projectType: string }> = [
    { pattern: /Dach/i, cluster: "Sonstiges", description: "Dacharbeiten", projectType: "Dacharbeiten" },
    { pattern: /Fassade/i, cluster: "Sonstiges", description: "Fassadenarbeiten", projectType: "Fassadensanierung" },
    { pattern: /Fenster/i, cluster: "Fenster", description: "Fensterarbeiten", projectType: "Fensterarbeiten" },
    { pattern: /Heizung/i, cluster: "Heizung", description: "Heizungsarbeiten", projectType: "Heizungsarbeiten" },
    { pattern: /Elektro/i, cluster: "Elektro", description: "Elektroarbeiten", projectType: "Elektroarbeiten" },
    { pattern: /Sanit[aä]r/i, cluster: "Sanitaer / Heizung", description: "Sanitaerarbeiten", projectType: "Sanitaerarbeiten" },
    { pattern: /Maler/i, cluster: "Maler", description: "Malerarbeiten", projectType: "Malerarbeiten" },
    { pattern: /Boden/i, cluster: "Boden", description: "Bodenarbeiten", projectType: "Bodenarbeiten" },
    { pattern: /Wohnungssanierung/i, cluster: "Sonstiges", description: "Wohnungssanierung", projectType: "Wohnungssanierung" }
  ];
  for (const mapping of mappings) {
    const match = text.match(mapping.pattern);
    if (match) return { ...mapping, evidence: match[0] };
  }
  return null;
}

function missingFromGeneric({
  objectNumber,
  address,
  gross,
  provider
}: {
  objectNumber: { value: string; evidence: string } | null;
  address: { value: string; evidence: string } | null;
  gross: number | null;
  provider: { value: string; evidence: string } | null;
}): string[] | null {
  const missing: string[] = [];
  if (!objectNumber) missing.push("Objektnummer");
  if (!address) missing.push("Objektadresse");
  if (!provider) missing.push("Lieferant / Firma");
  if (gross === null) missing.push("Bruttobetrag / Kosten gesamt");
  return missing.length ? missing : null;
}

function mergeAiObject(primary: AiObjectResult, secondary: AiObjectResult): AiObjectResult {
  return {
    ...secondary,
    ...primary,
    measures: primary.measures && primary.measures.length > 0 ? primary.measures : secondary.measures,
    massnahmen_details: primary.massnahmen_details && primary.massnahmen_details.length > 0
      ? primary.massnahmen_details
      : secondary.massnahmen_details,
    measureDebug: primary.measureDebug ?? secondary.measureDebug
  };
}

function enrichAiObjectWithFallback(primary: AiObjectResult, fallback: AiObjectResult): AiObjectResult {
  return {
    ...primary,
    dokumenttyp: aiFieldWithFallback(primary.dokumenttyp, fallback.dokumenttyp),
    projektart: aiFieldWithFallback(primary.projektart, fallback.projektart),
    anbieter: aiFieldWithFallback(primary.anbieter, fallback.anbieter),
    dokumentnummer: aiFieldWithFallback(primary.dokumentnummer, fallback.dokumentnummer),
    datum: aiFieldWithFallback(primary.datum, fallback.datum),
    year: aiFieldWithFallback(primary.year, fallback.year),
    fund: aiFieldWithFallback(primary.fund, fallback.fund),
    objectNumber: aiFieldWithFallback(primary.objectNumber, fallback.objectNumber),
    objectAddress: aiFieldWithFallback(primary.objectAddress, fallback.objectAddress),
    wohnungsnummer: aiFieldWithFallback(primary.wohnungsnummer, fallback.wohnungsnummer),
    lage: aiFieldWithFallback(primary.lage, fallback.lage),
    renovatedApartmentCount: aiFieldWithFallback(primary.renovatedApartmentCount, fallback.renovatedApartmentCount),
    livingAreaSqm: aiFieldWithFallback(primary.livingAreaSqm, fallback.livingAreaSqm),
    kosten_netto: aiFieldWithFallback(primary.kosten_netto, fallback.kosten_netto),
    mwst: aiFieldWithFallback(primary.mwst, fallback.mwst),
    kosten_brutto: aiFieldWithFallback(primary.kosten_brutto, fallback.kosten_brutto),
    totalCost: aiFieldWithFallback(primary.totalCost, fallback.totalCost),
    costPerApartment: aiFieldWithFallback(primary.costPerApartment, fallback.costPerApartment),
    costPerSqm: aiFieldWithFallback(primary.costPerSqm, fallback.costPerSqm),
    beschreibung_massnahmen: aiFieldWithFallback(primary.beschreibung_massnahmen, fallback.beschreibung_massnahmen),
    datenqualitaet: aiFieldWithFallback(primary.datenqualitaet, fallback.datenqualitaet),
    fehlende_angaben: aiFieldWithFallback(primary.fehlende_angaben, fallback.fehlende_angaben),
    measures: primary.measures && primary.measures.length > 0 ? primary.measures : fallback.measures,
    massnahmen_details: primary.massnahmen_details && primary.massnahmen_details.length > 0 ? primary.massnahmen_details : fallback.massnahmen_details,
    measureDebug: primary.measureDebug ?? fallback.measureDebug
  };
}

function aiFieldWithFallback<T>(primary?: AiField<T>, fallback?: AiField<T>): AiField<T> | undefined {
  if (primary?.value !== null && primary?.value !== undefined && primary?.value !== "") return primary;
  return fallback ?? primary;
}

function parseSubject(value: string): { address: string | null; location: string | null } {
  const normalized = value.replace(/\s+/g, " ").trim();
  const match = normalized.match(/(Pamirweg\s+\S+)\s+(.+?)\s+in\s+(Hamburg)/i);
  if (!match) return { address: null, location: null };
  return {
    address: `${match[1]}, ${match[3]}`,
    location: normalizeLocation(match[2])
  };
}

function normalizeLocation(value: string): string {
  return value
    .replace(/\b3v\.li\b/i, "3.v.li")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanFund(value: string | null): string | null {
  if (!value) return null;
  return value.replace(/"/g, "").trim();
}

function parseOfferMeasures(text: string): {
  measures: AiMeasureResult[];
  details: MeasureDetail[];
  debug: MeasureDebugInfo;
} {
  const definitions = offerMeasureDefinitions();
  const headings = findOfferSectionHeadings(text, definitions);
  const sumLines = findOfferSectionSums(text, definitions);
  const notes: string[] = [];
  if (headings.length === 0) notes.push("Keine nummerierten Massnahmen-Abschnittsueberschriften gefunden.");
  if (sumLines.length === 0) notes.push("Keine Abschnitts-Summenzeilen gefunden.");

  const measures: AiMeasureResult[] = [];
  const details: MeasureDetail[] = [];
  const mappings: MeasureDebugInfo["mappings"] = [];

  definitions.forEach((definition) => {
    const heading = headings.find((entry) => entry.section === definition.section);
    const sumLine = sumLines.find((entry) => entry.section === definition.section);
    if (!heading && !sumLine) return;

    const lineItems = parseSectionLineItems(text, definition.section);
    const description = buildMeasureDescription(definition.description, lineItems);
    const evidence = sumLine?.raw ?? heading?.raw ?? null;
    const value = sumLine?.value ?? null;

    mappings.push({
      section: definition.section,
      heading: heading?.heading ?? sumLine?.heading ?? definition.heading,
      cluster: definition.cluster,
      value,
      description
    });

    details.push({
      abschnitt: heading?.heading ?? sumLine?.heading ?? definition.heading,
      cluster: definition.cluster,
      summe: value,
      beschreibung: description,
      quelle: evidence ?? "k.A."
    });

    measures.push({
      cluster: aiField(definition.cluster, evidence),
      description: aiField(description, evidence),
      totalCost: aiField(value, sumLine?.raw ?? null),
      allocation: aiField(null, null),
      lineItems
    });
  });

  return { measures, details, debug: { headings, sumLines, mappings, notes } };
}

function offerMeasureDefinitions(): Array<{
  section: number;
  heading: string;
  aliases: RegExp[];
  cluster: MeasureCluster;
  description: string;
}> {
  return [
    { section: 1, heading: "Erstbegehung", aliases: [/Erstbegehung/i], cluster: "Planung / Dokumentation", description: "Erstbegehung und Dokumentation" },
    { section: 2, heading: "Bodenbelagsarbeiten", aliases: [/Bodenbelagsarbeiten/i], cluster: "Boden", description: "Bodenbelagsarbeiten" },
    { section: 3, heading: "Malerarbeiten", aliases: [/Malerarbeiten/i], cluster: "Maler", description: "Malerarbeiten" },
    { section: 4, heading: "Fliesenarbeiten und Estrich", aliases: [/Fliesenarbeiten(?:\s+und\s+Estrich)?/i, /Estrich/i], cluster: "Bad / Fliesen", description: "Fliesenarbeiten und Estrich" },
    { section: 5, heading: "Sanitaer - Heizungsarbeiten", aliases: [/Sanit\S*r\s*-\s*Heizungsarbeiten/i, /Sanit\S*r.*Heizung/i], cluster: "Sanitaer / Heizung", description: "Sanitaer- und Heizungsarbeiten" },
    { section: 6, heading: "Elektroarbeiten", aliases: [/Elektroarbeiten/i], cluster: "Elektro", description: "Elektroarbeiten" },
    { section: 7, heading: "Tischlerarbeiten", aliases: [/Tischlerarbeiten/i], cluster: "Tueren / Fenster", description: "Tischlerarbeiten" },
    { section: 8, heading: "Reinigung", aliases: [/Reinigung/i], cluster: "Reinigung", description: "Reinigung" },
    { section: 9, heading: "Zusatzarbeiten", aliases: [/(?:Stundenlohn\s+)?Zusatzarbeiten/i], cluster: "Sonstiges", description: "Zusatzarbeiten" }
  ];
}

function findOfferSectionHeadings(
  text: string,
  definitions: ReturnType<typeof offerMeasureDefinitions>
): MeasureDebugInfo["headings"] {
  const headings: MeasureDebugInfo["headings"] = [];
  text.split(/\r?\n/).forEach((line) => {
    const normalizedLine = line.replace(/\s+/g, " ").trim();
    const match = normalizedLine.match(/^(\d{1,2})\.\s+(.{3,90})$/);
    if (!match) return;
    const section = Number(match[1]);
    const title = cleanupSectionHeading(match[2]);
    const definition = definitions.find((entry) =>
      entry.section === section && entry.aliases.some((alias) => alias.test(title))
    );
    if (!definition || headings.some((entry) => entry.section === section)) return;
    headings.push({ section, heading: title, raw: normalizedLine });
  });
  return headings;
}

function findOfferSectionSums(
  text: string,
  definitions: ReturnType<typeof offerMeasureDefinitions>
): MeasureDebugInfo["sumLines"] {
  const sumLines: MeasureDebugInfo["sumLines"] = [];
  const moneyPattern = /([\d.]+,\d{2})\s*(?:\u20ac|EUR|Euro|â‚¬)?/i;
  text.split(/\r?\n/).forEach((line) => {
    const normalizedLine = line.replace(/\s+/g, " ").trim();
    const sectionMatch = normalizedLine.match(/^Summe\s+(\d{1,2})\.\s+(.+)$/i);
    if (!sectionMatch) return;
    const section = Number(sectionMatch[1]);
    const definition = definitions.find((entry) => entry.section === section);
    if (!definition || !definition.aliases.some((alias) => alias.test(normalizedLine))) return;
    const moneyMatch = normalizedLine.match(moneyPattern);
    const headingPart = cleanupSectionHeading(sectionMatch[2].replace(moneyPattern, ""));
    sumLines.push({
      section,
      heading: headingPart || definition.heading,
      value: parseGermanMoney(moneyMatch?.[1] ?? null),
      raw: normalizedLine
    });
  });
  return sumLines;
}

function cleanupSectionHeading(value: string): string {
  return value
    .replace(/([\d.]+,\d{2})\s*(?:\u20ac|EUR|Euro|â‚¬)?/ig, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildMeasureDescription(fallback: string, lineItems: LineItem[]): string {
  const descriptions = lineItems
    .map((item) => item.description)
    .filter((description): description is string => Boolean(description))
    .slice(0, 6);
  return descriptions.length > 0 ? descriptions.join(", ") : fallback;
}

function buildOfferMeasureSummary(details: MeasureDetail[]): string | null {
  if (details.length === 0) return null;
  const sections = details.map((detail) => detail.abschnitt).filter(Boolean);
  return sections.length > 0 ? `Wohnungssanierung mit ${sections.join(", ")}.` : null;
}

function parseOfferMeasuresLegacy(text: string): AiMeasureResult[] {
  const mappings: Array<{ section: number; heading: RegExp; cluster: MeasureCluster; description: string }> = [
    { section: 1, heading: /Summe\s+1\.\s+Erstbegehung\s+([\d.]+,\d{2})\s*€/i, cluster: "Planung / Dokumentation", description: "Erstbegehung und Dokumentation" },
    { section: 2, heading: /Summe\s+2\.\s+Bodenbelagsarbeiten\s+([\d.]+,\d{2})\s*€/i, cluster: "Boden", description: "Bodenbelagsarbeiten" },
    { section: 3, heading: /Summe\s+3\.\s+Malerarbeiten\s+([\d.]+,\d{2})\s*€/i, cluster: "Maler", description: "Malerarbeiten" },
    { section: 4, heading: /Summe\s+4\.\s+Fliesenarbeiten\s+([\d.]+,\d{2})\s*€/i, cluster: "Bad / Fliesen", description: "Fliesenarbeiten und Estrich" },
    { section: 5, heading: /Summe\s+5\.\s+Sanit[aä]r\s*-\s*Heizungsarbeiten\s+([\d.]+,\d{2})\s*€/i, cluster: "Sanitaer / Heizung", description: "Sanitaer- und Heizungsarbeiten" },
    { section: 6, heading: /Summe\s+6\.\s+Elektroarbeiten\s+([\d.]+,\d{2})\s*€/i, cluster: "Elektro", description: "Elektroarbeiten" },
    { section: 7, heading: /Summe\s+7\.\s+Tischlerarbeiten\s+([\d.]+,\d{2})\s*€/i, cluster: "Tueren / Fenster", description: "Tischlerarbeiten" },
    { section: 8, heading: /Summe\s+8\.\s+Reinigung\s+([\d.]+,\d{2})\s*€/i, cluster: "Reinigung", description: "Reinigung" },
    { section: 9, heading: /Summe\s+9\.\s+(?:Stundenlohn\s+)?Zusatzarbeiten\s+([\d.]+,\d{2})\s*€/i, cluster: "Sonstiges", description: "Zusatzarbeiten" }
  ];

  return mappings.flatMap((mapping) => {
    const match = text.match(mapping.heading);
    if (!match) return [];
    return [{
      cluster: aiField(mapping.cluster, match[0]),
      description: aiField(mapping.description, match[0]),
      totalCost: aiField(parseGermanMoney(match[1]), match[0]),
      allocation: aiField(null, null),
      lineItems: parseSectionLineItems(text, mapping.section)
    } satisfies AiMeasureResult];
  });
}

function parseSectionLineItems(text: string, section: number): LineItem[] {
  const start = new RegExp(`(?:^|\\n)${section}\\.\\s+`, "i");
  const end = new RegExp(`(?:Summe\\s+${section}\\.|\\n${section + 1}\\.\\s+)`, "i");
  const startIndex = text.search(start);
  if (startIndex === -1) return [];
  const sectionText = text.slice(startIndex);
  const endMatch = sectionText.search(end);
  const scoped = endMatch === -1 ? sectionText : sectionText.slice(0, endMatch);
  const robustLinePattern = new RegExp(`^${section}\\.\\d+\\s+(.+?)\\s+([\\d.]+,\\d{2})\\s*(?:\\u20ac|EUR|Euro|â‚¬)?\\s+([\\d.]+,\\d{2})\\s*(?:\\u20ac|EUR|Euro|â‚¬)?`, "gim");
  const linePattern = new RegExp(`^${section}\\.\\d+\\s+(.+?)\\s+([\\d.]+,\\d{2})\\s*€\\s+([\\d.]+,\\d{2})\\s*€`, "gim");
  const items: LineItem[] = [];
  let match: RegExpExecArray | null;

  while ((match = robustLinePattern.exec(scoped) ?? linePattern.exec(scoped)) && items.length < 80) {
    const rawLine = match[0].replace(/\s+/g, " ").trim();
    const position = rawLine.match(new RegExp(`^(${section}\\.\\d+)`))?.[1] ?? "";
    items.push({
      position,
      quantity: null,
      unit: null,
      description: match[1].replace(/\s+/g, " ").trim(),
      unitPrice: parseGermanMoney(match[2]),
      totalPrice: parseGermanMoney(match[3]),
      source: {
        documentId: "",
        fileName: "",
        textSnippet: rawLine,
        confidence: 0.7
      }
    });
  }

  return items;
}

function aiField<T>(value: T | null, evidence: string | null): AiField<T> {
  return {
    value,
    evidence,
    confidence: value === null ? null : 0.95
  };
}

function parseGermanMoney(value: string | null): number | null {
  if (!value) return null;
  const numeric = value.replace(/[^\d,.-]/g, "");
  const cleaned = numeric.includes(",")
    ? numeric.replace(/\./g, "").replace(",", ".")
    : numeric;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? roundMoney(parsed) : null;
}

function calculatePortfolioTotals(objects: ObjectAnalysis[]): Pick<
  PortfolioAnalysisState,
  "year" | "fund" | "totalCost" | "averageCostPerApartment" | "averageCostPerSqm"
> {
  const totalCost = sumField(objects.map((object) => object.totalCost));
  const renovatedApartments = sumField(objects.map((object) => object.renovatedApartmentCount));
  const renovatedArea = sumField(objects.map((object) => object.renovatedAreaSqm));
  const source = firstSource(objects);

  return {
    year: firstField(objects.map((object) => object.year)),
    fund: firstField(objects.map((object) => object.fund)),
    totalCost: totalCost === null ? emptyField<number>() : field(totalCost, source),
    averageCostPerApartment:
      totalCost !== null && renovatedApartments
        ? field(totalCost / renovatedApartments, source)
        : emptyField<number>(),
    averageCostPerSqm:
      totalCost !== null && renovatedArea
        ? field(totalCost / renovatedArea, source)
        : emptyField<number>()
  };
}

function field<T>(value: T | null, source: FieldSource): ExtractedField<T> {
  return {
    value,
    sources: value === null ? [] : [source],
    confidence: value === null ? null : source.confidence ?? 0.75
  };
}

function firstSource(objects: ObjectAnalysis[]): FieldSource {
  const source = objects
    .flatMap((object) => [
      ...object.totalCost.sources,
      ...object.objectAddress.sources,
      ...object.objectNumber.sources
    ])
    .find(Boolean);

  return (
    source ?? {
      documentId: "k.A.",
      fileName: "k.A.",
      confidence: null
    }
  );
}

function firstField<T>(fields: ExtractedField<T>[]): ExtractedField<T> {
  return fields.find((entry) => entry.value !== null) ?? emptyField<T>();
}

function sumField(fields: ExtractedField<number>[]): number | null {
  const values = fields
    .map((entry) => entry.value)
    .filter((value): value is number => typeof value === "number");
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0);
}
