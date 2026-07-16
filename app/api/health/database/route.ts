import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createDatabaseClient } from "../../../../lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      {
        ok: false,
        database: "unavailable",
        reason: "DATABASE_URL missing"
      },
      { status: 503 }
    );
  }

  try {
    const database = createDatabaseClient();
    await database.execute(sql`select 1 as ok`);
    return NextResponse.json({ ok: true, database: "connected" });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        database: "unavailable",
        reason: "connection failed",
        errorType: error instanceof Error ? error.name : "UnknownError"
      },
      { status: 503 }
    );
  }
}
