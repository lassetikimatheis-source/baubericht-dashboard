import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const nextPublicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serverUrl = process.env.SUPABASE_URL ?? "";
  const nextPublicAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const serverAnonKey = process.env.SUPABASE_ANON_KEY ?? "";
  const supabaseUrl = [nextPublicUrl, serverUrl, nextPublicAnonKey, serverAnonKey].find(isHttpUrl) ?? "";
  const supabaseAnonKey = [nextPublicAnonKey, serverAnonKey, nextPublicUrl, serverUrl].find((value) => Boolean(value) && !isHttpUrl(value)) ?? "";

  console.log("[Supabase Config] Server Environment Status", {
    NEXT_PUBLIC_SUPABASE_URL: nextPublicUrl ? "vorhanden" : "fehlt",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: nextPublicAnonKey ? "vorhanden" : "fehlt",
    SUPABASE_URL: serverUrl ? "vorhanden" : "fehlt",
    SUPABASE_ANON_KEY: serverAnonKey ? "vorhanden" : "fehlt",
    resolvedUrl: supabaseUrl ? "vorhanden" : "fehlt",
    returnedAnonKey: supabaseAnonKey ? "vorhanden" : "fehlt"
  });

  return NextResponse.json({
    supabaseUrl,
    supabaseAnonKey,
    hasUrl: Boolean(supabaseUrl),
    hasAnonKey: Boolean(supabaseAnonKey),
    hasNextPublicAnonKey: Boolean(nextPublicAnonKey),
    hasServerAnonKey: Boolean(serverAnonKey),
    hasServerUrl: Boolean(serverUrl),
    resolvedUrlFrom: supabaseUrl === nextPublicUrl ? "NEXT_PUBLIC_SUPABASE_URL" : supabaseUrl === serverUrl ? "SUPABASE_URL" : supabaseUrl === nextPublicAnonKey ? "NEXT_PUBLIC_SUPABASE_ANON_KEY" : supabaseUrl === serverAnonKey ? "SUPABASE_ANON_KEY" : null,
    resolvedAnonKeyFrom: supabaseAnonKey === nextPublicAnonKey ? "NEXT_PUBLIC_SUPABASE_ANON_KEY" : supabaseAnonKey === serverAnonKey ? "SUPABASE_ANON_KEY" : supabaseAnonKey === nextPublicUrl ? "NEXT_PUBLIC_SUPABASE_URL" : supabaseAnonKey === serverUrl ? "SUPABASE_URL" : null,
    urlVariableName: "NEXT_PUBLIC_SUPABASE_URL",
    anonKeyVariableName: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    runtime: "server"
  });
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}
