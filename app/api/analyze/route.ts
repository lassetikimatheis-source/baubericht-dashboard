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
    const analysis = await extractPortfolioData(parsedDocuments);

    return NextResponse.json({
      ok: true,
      analysis
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Analyse fehlgeschlagen."
      },
      { status: 500 }
    );
  }
}
