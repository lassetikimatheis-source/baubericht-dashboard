import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createDatabaseClient } from "../../../../lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const database = createDatabaseClient();
    await database.execute(sql`select 1 as ok`);
    return NextResponse.json({ ok: true, database: "connected" });
  } catch {
    return NextResponse.json({ ok: false, database: "unavailable" }, { status: 503 });
  }
}
