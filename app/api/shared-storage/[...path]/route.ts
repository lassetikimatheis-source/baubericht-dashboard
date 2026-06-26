import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const emptySnapshot = {
  objects: [],
  entrances: [],
  projects: [],
  documents: [],
  assignments: {},
  objectImages: {}
};

function fallbackResponse(request: Request, method: string) {
  const url = new URL(request.url);
  return NextResponse.json({
    ok: false,
    configured: false,
    bucketExists: false,
    canReadTables: false,
    canWrite: false,
    snapshot: emptySnapshot,
    method,
    path: url.pathname,
    message: "Shared-Storage API-Pfad nicht gefunden. Die App nutzt weiter LocalStorage; es wurden keine Daten geloescht oder ueberschrieben."
  });
}

export async function GET(request: Request) {
  return fallbackResponse(request, "GET");
}

export async function POST(request: Request) {
  return fallbackResponse(request, "POST");
}

export async function DELETE(request: Request) {
  return fallbackResponse(request, "DELETE");
}
