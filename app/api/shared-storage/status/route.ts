import { NextResponse } from "next/server";
import { checkSharedStorageStatus } from "../../../../lib/server/shared-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const status = await checkSharedStorageStatus();
  return NextResponse.json({ ok: true, ...status });
}
