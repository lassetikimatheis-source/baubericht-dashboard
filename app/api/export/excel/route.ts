import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import type { PortfolioAnalysisState } from "../../../../types/analysis";
import { formatList, unwrap } from "../../../../lib/format";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const analysis = (await request.json()) as PortfolioAnalysisState;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "PARIBUS Baukosten Analyse";

  const objectsSheet = workbook.addWorksheet("Objekte");
  objectsSheet.columns = [
    { header: "Jahr", key: "year", width: 12 },
    { header: "Dokumenttyp", key: "documentType", width: 16 },
    { header: "Anbieter", key: "provider", width: 28 },
    { header: "Datum", key: "documentDate", width: 14 },
    { header: "Dokumentnummer", key: "documentNumber", width: 18 },
    { header: "Fonds", key: "fund", width: 28 },
    { header: "Objektnummer", key: "objectNumber", width: 18 },
    { header: "Wohnungsnummer", key: "apartmentNumber", width: 18 },
    { header: "Objektadresse", key: "objectAddress", width: 36 },
    { header: "Lage", key: "location", width: 18 },
    { header: "Sanierte Wohnungen", key: "renovatedApartmentCount", width: 22 },
    { header: "Welche Wohnungen", key: "renovatedApartments", width: 28 },
    { header: "Gesamtfläche qm", key: "totalAreaSqm", width: 18 },
    { header: "Sanierte Fläche qm", key: "renovatedAreaSqm", width: 20 },
    { header: "Kosten netto", key: "netCost", width: 18 },
    { header: "MwSt.", key: "vatCost", width: 18 },
    { header: "Gesamtkosten", key: "totalCost", width: 18 },
    { header: "Kosten pro Wohnung", key: "costPerApartment", width: 22 },
    { header: "Kosten pro qm", key: "costPerSqm", width: 18 },
    { header: "Quelle Adresse", key: "sourceAddress", width: 42 },
    { header: "Quelle Kosten", key: "sourceCost", width: 42 }
  ];

  analysis.objects.forEach((object) => {
    objectsSheet.addRow({
      year: unwrap(object.year) ?? "k.A.",
      documentType: unwrap(object.documentType) ?? "k.A.",
      provider: unwrap(object.provider) ?? "k.A.",
      documentDate: unwrap(object.documentDate) ?? "k.A.",
      documentNumber: unwrap(object.documentNumber) ?? "k.A.",
      fund: unwrap(object.fund) ?? "k.A.",
      objectNumber: unwrap(object.objectNumber) ?? "k.A.",
      apartmentNumber: unwrap(object.apartmentNumber) ?? "k.A.",
      objectAddress: unwrap(object.objectAddress) ?? "k.A.",
      location: unwrap(object.location) ?? "k.A.",
      renovatedApartmentCount: unwrap(object.renovatedApartmentCount) ?? "k.A.",
      renovatedApartments: formatList(object.renovatedApartments),
      totalAreaSqm: unwrap(object.totalAreaSqm) ?? "k.A.",
      renovatedAreaSqm: unwrap(object.renovatedAreaSqm) ?? "k.A.",
      netCost: unwrap(object.netCost) ?? "k.A.",
      vatCost: unwrap(object.vatCost) ?? "k.A.",
      totalCost: unwrap(object.totalCost) ?? "k.A.",
      costPerApartment: unwrap(object.costPerApartment) ?? "k.A.",
      costPerSqm: unwrap(object.costPerSqm) ?? "k.A.",
      sourceAddress: object.objectAddress.sources[0]?.fileName ?? "k.A.",
      sourceCost: object.totalCost.sources[0]?.fileName ?? "k.A."
    });
  });

  const measuresSheet = workbook.addWorksheet("Maßnahmen");
  measuresSheet.columns = [
    { header: "Objekt", key: "object", width: 34 },
    { header: "Cluster", key: "cluster", width: 18 },
    { header: "Beschreibung", key: "description", width: 44 },
    { header: "Kosten", key: "cost", width: 16 },
    { header: "GE/SE", key: "allocation", width: 10 },
    { header: "Quelle", key: "source", width: 40 }
  ];

  analysis.objects.forEach((object) => {
    object.clusters.forEach((measure) => {
      measuresSheet.addRow({
        object: unwrap(object.objectAddress) ?? unwrap(object.objectNumber) ?? "k.A.",
        cluster: unwrap(measure.cluster) ?? "k.A.",
        description: unwrap(measure.description) ?? "k.A.",
        cost: unwrap(measure.totalCost) ?? "k.A.",
        allocation: unwrap(measure.allocation) ?? "k.A.",
        source: measure.description.sources[0]?.fileName ?? "k.A."
      });
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="paribus-baukosten-analyse.xlsx"'
    }
  });
}
