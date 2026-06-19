import { NextResponse } from "next/server";
import { parseUploadedFiles } from "../../../lib/server/document-ingestion";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);

    const parsed = await parseUploadedFiles(files);

    return NextResponse.json({
      ok: true,
      documents: parsed.map((document) => ({
        id: document.id,
        fileName: document.fileName,
        fileType: document.fileType,
        textLength: document.text.length,
        preview: document.text.slice(0, 3000),
        issues: document.issues,
        parseDebug: document.parseDebug
      }))
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Vorschau fehlgeschlagen."
      },
      { status: 500 }
    );
  }
}
