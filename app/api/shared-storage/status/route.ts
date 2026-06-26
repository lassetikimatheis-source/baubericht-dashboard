import { NextResponse } from "next/server";
import { sharedStorageConfigured } from "../../../../lib/server/shared-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const hasProjectUrl = Boolean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const hasPublishableKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY);
  const hasServerKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY);
  return NextResponse.json({
    ok: true,
    configured: sharedStorageConfigured(),
    hasProjectUrl,
    hasPublishableKey,
    hasServerKey,
    storageBucket: process.env.SUPABASE_STORAGE_BUCKET || "paribus-files"
  });
}

