import type { ExtractedField, PortfolioAnalysisState } from "../types/analysis";

export function emptyField<T>(): ExtractedField<T> {
  return {
    value: null,
    sources: [],
    confidence: null
  };
}

export const emptyAnalysisState: PortfolioAnalysisState = {
  year: emptyField<number>(),
  fund: emptyField<string>(),
  objects: [],
  sourceDocuments: [],
  clusterSummary: [],
  totalCost: emptyField<number>(),
  averageCostPerApartment: emptyField<number>(),
  averageCostPerSqm: emptyField<number>(),
  reviewRequiredCount: 0,
  duplicates: [],
  issues: []
};
