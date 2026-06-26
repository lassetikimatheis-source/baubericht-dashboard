import { NextResponse } from "next/server";
import type { SharedCollectionName } from "../../../lib/shared-storage-types";
import { deleteSharedRecord, readSharedSnapshot, sharedStorageConfigured, upsertSharedRecord } from "../../../lib/server/shared-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await readSharedSnapshot();
    return NextResponse.json({ ok: true, configured: sharedStorageConfigured(), snapshot });
  } catch (error) {
    console.error("Shared storage snapshot failed", error);
    return NextResponse.json({ ok: false, configured: sharedStorageConfigured(), message: "Zentrale Daten konnten nicht geladen werden." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { collection?: SharedCollectionName; id?: string; data?: unknown };
    if (!body.collection || !body.id) {
      return NextResponse.json({ ok: false, message: "collection und id sind erforderlich." }, { status: 400 });
    }
    await upsertSharedRecord(body.collection, body.id, body.data);
    return NextResponse.json({ ok: true, configured: sharedStorageConfigured() });
  } catch (error) {
    console.error("Shared storage save failed", error);
    return NextResponse.json({ ok: false, configured: sharedStorageConfigured(), message: "Zentrale Daten konnten nicht gespeichert werden." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const collection = searchParams.get("collection") as SharedCollectionName | null;
    const id = searchParams.get("id");
    if (!collection || !id) {
      return NextResponse.json({ ok: false, message: "collection und id sind erforderlich." }, { status: 400 });
    }
    await deleteSharedRecord(collection, id);
    return NextResponse.json({ ok: true, configured: sharedStorageConfigured() });
  } catch (error) {
    console.error("Shared storage delete failed", error);
    return NextResponse.json({ ok: false, configured: sharedStorageConfigured(), message: "Zentrale Daten konnten nicht gelöscht werden." }, { status: 500 });
  }
}
