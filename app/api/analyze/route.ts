import { NextResponse } from "next/server";
import { parseUploadedFiles } from "../../../lib/server/document-ingestion";
import { extractPortfolioData } from "../../../lib/server/ai-extraction";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);

    if (files.length === 0) {
      return NextResponse.json(
        { ok: false, message: "Keine Dateien hochgeladen." },
        { status: 400 }
      );
    }

    const parsedDocuments = await parseUploadedFiles(files);
    console.log("[Upload Workflow] PDF Upload verarbeitet", {
      files: files.map((file) => ({ name: file.name, size: file.size, type: file.type || "k.A." })),
      parsedDocuments: parsedDocuments.map((document) => ({
        id: document.id,
        fileName: document.fileName,
        fileType: document.fileType,
        textLength: document.text.length,
        issues: document.issues
      }))
    });

    const analysis = await extractPortfolioData(parsedDocuments);
    console.log("[Upload Workflow] KI-Auswertung abgeschlossen", {
      success: true,
      objectCount: analysis.objects.length,
      sourceDocumentCount: analysis.sourceDocuments.length,
      issues: analysis.issues,
      objects: analysis.objects.map((document) => ({
        id: document.id,
        objectNumber: document.objectNumber.value,
        documentType: document.documentType.value,
        documentNumber: document.documentNumber.value,
        documentDate: document.documentDate.value,
        supplier: document.provider.value,
        totalAmount: document.totalCost.value,
        sourceDocumentIds: document.sourceDocumentIds
      }))
    });

    return NextResponse.json({
      ok: true,
      analysis
    });
  } catch (error) {
    console.error("[Upload Workflow] Analyse fehlgeschlagen", error);
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Analyse fehlgeschlagen."
      },
      { status: 500 }
    );
  }
}
