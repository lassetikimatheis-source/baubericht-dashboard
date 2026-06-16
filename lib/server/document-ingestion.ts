import crypto from "crypto";
import type { SourceDocument } from "../../types/analysis";

export interface ParsedDocument {
  id: string;
  fileName: string;
  fileType: SourceDocument["fileType"];
  buffer: Buffer;
  text: string;
  uploadedAt: string;
  issues: string[];
  hash: string;
}

export async function parseUploadedFiles(files: File[]): Promise<ParsedDocument[]> {
  const documents: ParsedDocument[] = [];

  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileType = getFileType(file.name);
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    const issues: string[] = [];
    let text = "";

    try {
      if (fileType === "pdf") {
        text = await extractPdfText(buffer);
        if (!text.trim()) {
          issues.push("PDF enthaelt keinen lesbaren Text. OCR-Pruefung erforderlich.");
        }
      } else if (fileType === "xlsx" || fileType === "xls" || fileType === "csv") {
        text = await extractSpreadsheetText(buffer, file.name);
      } else if (fileType === "png" || fileType === "jpg" || fileType === "jpeg") {
        text = await extractImageText(buffer);
      } else {
        issues.push("Dateityp wird noch nicht unterstuetzt.");
      }
    } catch (error) {
      issues.push(error instanceof Error ? error.message : "Dokument konnte nicht gelesen werden.");
    }

    documents.push({
      id: crypto.randomUUID(),
      fileName: file.name,
      fileType,
      buffer,
      text,
      uploadedAt: new Date().toISOString(),
      issues,
      hash
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
