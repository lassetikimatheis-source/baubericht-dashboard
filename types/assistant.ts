export type AssistantCalculationMode =
  | "effectiveTotal"
  | "sum"
  | "net"
  | "vat"
  | "costPerApartment"
  | "costPerSqm"
  | "offerTotal"
  | "progressTotal"
  | "finalTotal"
  | "tradeTotal"
  | "documentTotal"
  | "assignment";

export interface AssistantExplainTarget {
  label: string;
  metric?: string;
  calculation?: AssistantCalculationMode;
  displayedValue?: string;
  documentIds?: string[];
  objectId?: string | null;
  projectId?: string | null;
  documentId?: string | null;
  reportId?: string | null;
  trade?: string | null;
}

export interface AssistantPageContext {
  view: string;
  objectTab?: string | null;
  objectId?: string | null;
  projectId?: string | null;
  documentId?: string | null;
  reportId?: string | null;
  trade?: string | null;
  target?: AssistantExplainTarget | null;
}

export interface AssistantChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface AssistantSourceReference {
  documentId: string;
  documentName: string;
  documentType: string;
  documentNumber: string;
  provider: string;
  objectLabel: string;
  trade: string | null;
  amount: number | null;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  position: string | null;
  description: string | null;
  snippet: string | null;
  updatedAt: string | null;
}

export interface AssistantCalculationBreakdown {
  kind: AssistantCalculationMode;
  title: string;
  result: number | null;
  unit: "EUR" | "EUR_PER_SQM" | "TEXT";
  formula: string | null;
  operands: Array<{
    label: string;
    value: number | null;
    sourceValue?: number | null;
    unit?: "EUR" | "COUNT" | "SQM";
    documentId?: string;
    included: boolean;
    reason: string;
    multiplier?: number | null;
  }>;
  sources: AssistantSourceReference[];
  excluded: Array<{ label: string; reason: string; value: number | null }>;
  missing: string[];
  notes: string[];
  lastUpdatedAt: string | null;
  objectLabel: string | null;
  trade: string | null;
}

export interface AssistantChatResponse {
  answer: string;
  breakdown: AssistantCalculationBreakdown | null;
  suggestedQuestions: string[];
  context: {
    objectId: string | null;
    documentId: string | null;
    projectId: string | null;
    reportId: string | null;
    trade: string | null;
  };
}
