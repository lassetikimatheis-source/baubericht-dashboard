import { NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import type { PortfolioAnalysisState } from "../../../../types/analysis";
import { formatCurrency, formatList, formatSqm, unwrap } from "../../../../lib/format";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const analysis = (await request.json()) as PortfolioAnalysisState;
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 42;
  let y = 48;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text("PARIBUS Baukosten Analyse", margin, y);
  y += 28;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text("Export mit Quellenangaben. Fehlende Werte werden als k.A. dargestellt.", margin, y);
  y += 28;

  analysis.objects.forEach((object, index) => {
    if (y > 720) {
      pdf.addPage();
      y = 48;
    }

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text(`${index + 1}. ${unwrap(object.objectNumber) ?? "k.A."} · ${unwrap(object.objectAddress) ?? "k.A."}`, margin, y);
    y += 18;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    const lines = [
      `Dokumenttyp: ${unwrap(object.documentType) ?? "k.A."}`,
      `Anbieter: ${unwrap(object.provider) ?? "k.A."}`,
      `Jahr: ${unwrap(object.year) ?? "k.A."}`,
      `Datum: ${unwrap(object.documentDate) ?? "k.A."}`,
      `Dokumentnummer: ${unwrap(object.documentNumber) ?? "k.A."}`,
      `Fonds: ${unwrap(object.fund) ?? "k.A."}`,
      `Wohnung: ${unwrap(object.apartmentNumber) ?? "k.A."}`,
      `Lage: ${unwrap(object.location) ?? "k.A."}`,
      `Sanierte Wohnungen: ${unwrap(object.renovatedApartmentCount) ?? "k.A."}`,
      `Welche Wohnungen: ${formatList(object.renovatedApartments)}`,
      `Gesamtfläche: ${formatSqm(object.totalAreaSqm)}`,
      `Sanierte Fläche: ${formatSqm(object.renovatedAreaSqm)}`,
      `Netto: ${formatCurrency(object.netCost)}`,
      `MwSt.: ${formatCurrency(object.vatCost)}`,
      `Gesamtkosten: ${formatCurrency(object.totalCost)}`,
      `Kosten pro Wohnung: ${formatCurrency(object.costPerApartment)}`,
      `Kosten pro qm: ${formatCurrency(object.costPerSqm)}`,
      `Quelle Kosten: ${object.totalCost.sources[0]?.fileName ?? "k.A."}`
    ];

    lines.forEach((line) => {
      pdf.text(line, margin, y);
      y += 13;
    });
    y += 10;
  });

  if (analysis.objects.length === 0) {
    pdf.text("Keine extrahierten Objektdaten vorhanden.", margin, y);
  }

  const arrayBuffer = pdf.output("arraybuffer");
  return new NextResponse(Buffer.from(arrayBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="paribus-baukosten-analyse.pdf"'
    }
  });
}
