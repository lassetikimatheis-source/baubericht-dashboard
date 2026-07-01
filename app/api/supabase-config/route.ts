import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const nextPublicAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const serverAnonKey = process.env.SUPABASE_ANON_KEY ?? "";
  const supabaseAnonKey = nextPublicAnonKey || serverAnonKey;

  console.log("[Supabase Config] Server Environment Status", {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl ? "vorhanden" : "fehlt",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: nextPublicAnonKey ? "vorhanden" : "fehlt",
    SUPABASE_ANON_KEY: serverAnonKey ? "vorhanden" : "fehlt",
    returnedAnonKey: supabaseAnonKey ? "vorhanden" : "fehlt"
  });

  return NextResponse.json({
    supabaseUrl,
    supabaseAnonKey,
    hasUrl: Boolean(supabaseUrl),
    hasAnonKey: Boolean(supabaseAnonKey),
    hasNextPublicAnonKey: Boolean(nextPublicAnonKey),
    hasServerAnonKey: Boolean(serverAnonKey),
    urlVariableName: "NEXT_PUBLIC_SUPABASE_URL",
    anonKeyVariableName: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    runtime: "server"
  });
}
