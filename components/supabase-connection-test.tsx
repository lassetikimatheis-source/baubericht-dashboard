"use client";

import { useEffect } from "react";
import { runSupabaseConnectionTest } from "../lib/supabase";

export function SupabaseConnectionTest() {
  useEffect(() => {
    runSupabaseConnectionTest().catch((error) => {
      console.error("[Supabase] Verbindungstest fehlgeschlagen:", error);
    });
  }, []);

  return null;
}
