import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  return NextResponse.json({
    supabaseUrl,
    supabaseAnonKey,
    hasUrl: Boolean(supabaseUrl),
    hasAnonKey: Boolean(supabaseAnonKey),
    urlVariableName: "NEXT_PUBLIC_SUPABASE_URL",
    anonKeyVariableName: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    runtime: "server"
  });
}
