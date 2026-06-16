import type { ExtractedField } from "../types/analysis";

export function unwrap<T>(field: ExtractedField<T> | T | null | undefined): T | null {
  if (field && typeof field === "object" && "value" in field) return field.value;
  return field ?? null;
}

export function valueOrUnknown(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "k.A.";
  return String(value);
}

export function fieldOrUnknown<T extends string | number>(field: ExtractedField<T> | null | undefined): string {
  return valueOrUnknown(field?.value);
}

export function formatCurrency(value: number | ExtractedField<number> | null | undefined): string {
  const unwrapped = unwrap(value);
  if (unwrapped === null || unwrapped === undefined || Number.isNaN(Number(unwrapped))) return "k.A.";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  }).format(Number(unwrapped));
}

export function formatNumber(value: number | ExtractedField<number> | null | undefined): string {
  const unwrapped = unwrap(value);
  if (unwrapped === null || unwrapped === undefined || Number.isNaN(Number(unwrapped))) return "k.A.";
  return new Intl.NumberFormat("de-DE").format(Number(unwrapped));
}

export function formatSqm(value: number | ExtractedField<number> | null | undefined): string {
  const formatted = formatNumber(value);
  return formatted === "k.A." ? formatted : `${formatted} qm`;
}

export function formatList(value: string[] | ExtractedField<string[]> | null | undefined): string {
  const unwrapped = unwrap(value);
  if (!unwrapped || unwrapped.length === 0) return "k.A.";
  return unwrapped.join(", ");
}

export function sourceLabel(field: ExtractedField<unknown> | null | undefined): string {
  const source = field?.sources?.[0];
  if (!source) return "Quelle: k.A.";
  const location = source.sheet
    ? `${source.sheet}${source.cell ? ` ${source.cell}` : ""}`
    : source.page
      ? `Seite ${source.page}`
      : "Dokument";
  return `${source.fileName} · ${location}`;
}
