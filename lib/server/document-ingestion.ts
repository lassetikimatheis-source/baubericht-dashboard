import crypto from "crypto";
import type { DocumentParseDebug, SourceDocument } from "../../types/analysis";

export interface ParsedDocument {
  id: string;
  fileName: string;
  fileType: SourceDocument["fileType"];
  buffer: Buffer;
  text: string;
  uploadedAt: string;
  issues: string[];
  hash: string;
  fileSize: number;
  parseDebug: DocumentParseDebug;
}

export async function parseUploadedFiles(files: File[]): Promise<ParsedDocument[]> {
  const documents: ParsedDocument[] = [];

  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileType = getFileType(file.name);
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    const issues: string[] = [];
    let text = "";
    let ocrUsed = false;
    let ocrAvailable = fileType === "png" || fileType === "jpg" || fileType === "jpeg";
    let status: DocumentParseDebug["status"] = "read";

    try {
      if (fileType === "pdf") {
        text = await extractPdfText(buffer);
        if (text.trim().length < 50) {
          status = "ocr_unavailable";
          issues.push("PDF enthaelt keinen lesbaren Text - OCR wird verwendet.");
          issues.push("PDF scheint ein Scan zu sein. Bitte OCR aktivieren oder Datei als durchsuchbares PDF hochladen.");
        }
      } else if (fileType === "xlsx" || fileType === "xls" || fileType === "csv") {
        text = await extractSpreadsheetText(buffer, file.name);
      } else if (fileType === "png" || fileType === "jpg" || fileType === "jpeg") {
        text = await extractImageText(buffer);
        ocrUsed = true;
      } else {
        issues.push("Dateityp wird noch nicht unterstuetzt.");
      }
    } catch (error) {
      status = "error";
      issues.push(error instanceof Error ? error.message : "Dokument konnte nicht gelesen werden.");
    }

    const parseDebug = buildParseDebug({
      fileName: file.name,
      fileType,
      fileSize: file.size,
      text,
      ocrUsed,
      ocrAvailable,
      status
    });

    console.info("[PARIBUS PDF DEBUG]", {
      fileName: parseDebug.fileName,
      fileType: parseDebug.fileType,
      fileSize: parseDebug.fileSize,
      textLength: parseDebug.textLength,
      textPreview: parseDebug.textPreview,
      amountMatches: parseDebug.amountMatches,
      objectNumberMatches: parseDebug.objectNumberMatches,
      addressMatches: parseDebug.addressMatches,
      status: parseDebug.status
    });

    documents.push({
      id: crypto.randomUUID(),
      fileName: file.name,
      fileType,
      buffer,
      text,
      uploadedAt: new Date().toISOString(),
      issues,
      hash,
      fileSize: file.size,
      parseDebug
    });
  }

  return documents;
}

export function getFileType(fileName: string): SourceDocument["fileType"] {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return "pdf";
  if (extension === "xlsx") return "xlsx";
  if (extension === "xls") return "xls";
  if (extension === "csv") return "csv";
  if (extension === "png") return "png";
  if (extension === "jpg") return "jpg";
  if (extension === "jpeg") return "jpeg";
  return "unknown";
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfParse = (await import("pdf-parse")).default;
  const parsed = await pdfParse(buffer);
  return parsed.text || "";
}

async function extractSpreadsheetText(buffer: Buffer, fileName: string): Promise<string> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const rows: string[] = [];

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    rows.push(`Sheet: ${sheetName}\n${csv}`);
  });

  if (rows.length === 0) {
    throw new Error(`${fileName} enthaelt keine lesbaren Tabellenblaetter.`);
  }

  return rows.join("\n\n");
}

async function extractImageText(buffer: Buffer): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("deu");
  try {
    const result = await worker.recognize(buffer);
    return result.data.text || "";
  } finally {
    await worker.terminate();
  }
}

function buildParseDebug({
  fileName,
  fileType,
  fileSize,
  text,
  ocrUsed,
  ocrAvailable,
  status
}: {
  fileName: string;
  fileType: SourceDocument["fileType"];
  fileSize: number;
  text: string;
  ocrUsed: boolean;
  ocrAvailable: boolean;
  status: DocumentParseDebug["status"];
}): DocumentParseDebug {
  return {
    fileName,
    fileType,
    fileSize,
    textLength: text.length,
    textPreview: text.slice(0, 1000),
    amountMatches: uniqueMatches(text, /(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}\s*(?:\u20ac|EUR|Euro)?/gi, 20),
    objectNumberMatches: uniqueMatches(text, /\b\d{6}(?:-\d{3,})?\b/g, 20),
    addressMatches: findAddressMatches(text),
    ocrUsed,
    ocrAvailable,
    status
  };
}

function uniqueMatches(text: string, pattern: RegExp, limit: number): string[] {
  const values = new Set<string>();
  let match: RegExpExecArray | null;
  pattern.lastIndex = 0;
  while ((match = pattern.exec(text)) && values.size < limit) {
    values.add(match[0].replace(/\s+/g, " ").trim());
  }
  return Array.from(values);
}

function findAddressMatches(text: string): string[] {
  const patterns = [
    /\b[A-Z\u00c4\u00d6\u00dc][A-Za-z\u00c4\u00d6\u00dc\u00e4\u00f6\u00fc\u00df.-]+(?:stra\u00dfe|strasse|weg|allee|platz|ring|damm)\s+\d+[a-z]?(?:\s*,?\s*\d{5}\s+[A-Z\u00c4\u00d6\u00dc][A-Za-z\u00c4\u00d6\u00dc\u00e4\u00f6\u00fc\u00df.-]+)?/gi,
    /\bPamirweg\s+\d+[a-z]?(?:\s*,?\s*Hamburg)?/gi
  ];
  return Array.from(new Set(patterns.flatMap((pattern) => uniqueMatches(text, pattern, 12)))).slice(0, 12);
}
