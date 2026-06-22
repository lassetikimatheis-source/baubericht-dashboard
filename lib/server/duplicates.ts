import type { DuplicateFinding, SourceDocument } from "../../types/analysis";
import type { ParsedDocument } from "./document-ingestion";

export function detectDuplicates(parsedDocuments: ParsedDocument[]): DuplicateFinding[] {
  const seen = new Map<string, ParsedDocument>();
  const duplicates: DuplicateFinding[] = [];

  parsedDocuments.forEach((document) => {
    const previous = seen.get(document.hash);
    if (previous) {
      duplicates.push({
        documentId: document.id,
        duplicateOf: previous.id,
        reason: "Identischer Datei-Hash"
      });
      return;
    }
    seen.set(document.hash, document);
  });

  return duplicates;
}

export function toSourceDocuments(
  parsedDocuments: ParsedDocument[],
  duplicates: DuplicateFinding[]
): SourceDocument[] {
  return parsedDocuments.map((document) => {
    const duplicate = duplicates.find((entry) => entry.documentId === document.id);
    return {
      id: document.id,
      fileName: document.fileName,
      fileType: document.fileType,
      uploadedAt: document.uploadedAt,
      status: duplicate ? "duplicate" : document.issues.length > 0 ? "review_required" : "extracted",
      textLength: document.text.length,
      extractedText: document.text,
      fileSize: document.fileSize,
      parseDebug: document.parseDebug,
      duplicateOf: duplicate?.duplicateOf ?? null,
      issues: document.issues
    };
  });
}
