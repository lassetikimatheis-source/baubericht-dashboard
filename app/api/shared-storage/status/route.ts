import { NextResponse } from "next/server";
import { checkSharedStorageStatus } from "../../../../lib/server/shared-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await checkSharedStorageStatus();
    return NextResponse.json({ ok: true, ...status });
  } catch (error) {
    console.error("Shared storage status failed", error);
    return NextResponse.json({
      ok: false,
      configured: false,
      message: "Supabase Diagnose konnte nicht ausgefuehrt werden.",
      error: error instanceof Error ? error.message : "Unbekannter Fehler."
    }, { status: 500 });
  }
}
