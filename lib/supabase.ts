import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserSupabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("[Supabase] NEXT_PUBLIC_SUPABASE_URL oder NEXT_PUBLIC_SUPABASE_ANON_KEY fehlt.");
    return null;
  }

  if (!browserSupabaseClient) {
    browserSupabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  }

  return browserSupabaseClient;
}

export async function runSupabaseConnectionTest(): Promise<void> {
  console.log("[Supabase] Test wird ausgeführt");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  console.log("[Supabase] Verbindungstest gestartet", {
    hasUrl: Boolean(supabaseUrl),
    hasAnonKey: Boolean(supabaseAnonKey),
    urlHost: supabaseUrl ? new URL(supabaseUrl).host : null
  });

  const supabase = getSupabaseClient();
  if (!supabase) {
    console.error("[Supabase] Verbindungstest abgebrochen: Environment Variables fehlen.", {
      NEXT_PUBLIC_SUPABASE_URL: Boolean(supabaseUrl),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(supabaseAnonKey)
    });
    return;
  }

  const [tradesResult, documentTypesResult] = await Promise.all([
    supabase.from("trades").select("*", { count: "exact" }),
    supabase.from("document_types").select("*", { count: "exact" })
  ]);

  if (tradesResult.error) {
    console.error("[Supabase] Fehler beim Lesen von trades", {
      message: tradesResult.error.message,
      details: tradesResult.error.details,
      hint: tradesResult.error.hint,
      code: tradesResult.error.code,
      error: tradesResult.error
    });
  }

  if (documentTypesResult.error) {
    console.error("[Supabase] Fehler beim Lesen von document_types", {
      message: documentTypesResult.error.message,
      details: documentTypesResult.error.details,
      hint: documentTypesResult.error.hint,
      code: documentTypesResult.error.code,
      error: documentTypesResult.error
    });
  }

  if (!tradesResult.error && !documentTypesResult.error) {
    console.log("[Supabase] Verbindung erfolgreich", {
      trades: tradesResult.count ?? tradesResult.data?.length ?? 0,
      documentTypes: documentTypesResult.count ?? documentTypesResult.data?.length ?? 0
    });
  }

  console.log("[Supabase] trades", tradesResult.data ?? []);
  console.log("[Supabase] document_types", documentTypesResult.data ?? []);
}
