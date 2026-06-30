import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserSupabaseClient: SupabaseClient | null = null;
let connectionTestStarted = false;

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
  if (connectionTestStarted) return;
  connectionTestStarted = true;

  const supabase = getSupabaseClient();
  if (!supabase) return;

  const [tradesResult, documentTypesResult] = await Promise.all([
    supabase.from("trades").select("*"),
    supabase.from("document_types").select("*")
  ]);

  console.group("[Supabase] Verbindungstest");
  if (tradesResult.error) {
    console.error("trades konnte nicht gelesen werden:", tradesResult.error);
  } else {
    console.info("trades:", tradesResult.data);
  }

  if (documentTypesResult.error) {
    console.error("document_types konnte nicht gelesen werden:", documentTypesResult.error);
  } else {
    console.info("document_types:", documentTypesResult.data);
  }
  console.groupEnd();
}
