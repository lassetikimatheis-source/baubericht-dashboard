import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL ist nicht gesetzt.");
  }
  return databaseUrl;
}

export function createDatabaseClient() {
  return drizzle(neon(getDatabaseUrl()), { schema });
}
