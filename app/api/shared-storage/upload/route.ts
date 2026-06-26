import { NextResponse } from "next/server";
import { sharedStorageConfigured, uploadSharedFile } from "../../../../lib/server/shared-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!sharedStorageConfigured()) {
      return NextResponse.json({ ok: false, configured: false, message: "Zentraler Datei-Speicher ist nicht konfiguriert." }, { status: 503 });
    }
    const formData = await request.formData();
    const folder = String(formData.get("folder") || "uploads");
    const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File);
    const uploaded = await Promise.all(files.map((file) => uploadSharedFile(file, folder)));
    return NextResponse.json({ ok: true, configured: true, files: uploaded });
  } catch (error) {
    console.error("Shared file upload failed", error);
    return NextResponse.json({ ok: false, configured: sharedStorageConfigured(), message: "Datei konnte nicht zentral gespeichert werden." }, { status: 500 });
  }
}
