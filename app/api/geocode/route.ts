import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address")?.trim();

  if (!address) {
    return NextResponse.json({ ok: false, message: "Adresse fehlt." }, { status: 400 });
  }

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "de");
    url.searchParams.set("q", address);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "PARIBUS-Baukosten-Analyse/1.0",
        "Accept-Language": "de"
      },
      next: { revalidate: 60 * 60 * 24 * 14 }
    });

    if (!response.ok) {
      return NextResponse.json({ ok: false, message: "Adresse konnte nicht geocodiert werden." }, { status: 502 });
    }

    const results = await response.json() as Array<{ lat?: string; lon?: string; display_name?: string }>;
    const result = results[0];

    if (!result?.lat || !result?.lon) {
      return NextResponse.json({ ok: false, message: "Keine Koordinaten fuer diese Adresse gefunden." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      latitude: Number(result.lat),
      longitude: Number(result.lon),
      label: result.display_name ?? address
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      message: error instanceof Error ? error.message : "Geocoding fehlgeschlagen."
    }, { status: 500 });
  }
}
