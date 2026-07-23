export interface AssistantKnowledgeEntry {
  id: string;
  title: string;
  keywords: string[];
  answer: string;
}

export const assistantKnowledgeBase: AssistantKnowledgeEntry[] = [
  {
    id: "tool-overview",
    title: "So funktioniert das Tool",
    keywords: ["wie funktioniert", "überblick", "ablauf", "tool", "start"],
    answer:
      "Das Tool verwaltet Fonds, Objekte, Hauseingänge, Projekte und Dokumente. Hochgeladene PDF-, Excel-, CSV- oder Bilddateien werden serverseitig gelesen, auf Dubletten geprüft und in belegte Stammdaten, Kosten, Gewerke und Positionen überführt. Unsichere oder nicht belegte Werte bleiben „k.A.“ und können in der Dokumentprüfung manuell korrigiert werden. Die Objektansicht bündelt anschließend Dokumente, Kosten, Maßnahmen, Gewerke, Wohnungen und Berichte."
  },
  {
    id: "document-upload",
    title: "Dokument hochladen und prüfen",
    keywords: ["hochladen", "upload", "dokument analysieren", "textvorschau"],
    answer:
      "Öffne „Dokumente“ oder nutze „+ Dokument hochladen“. Wähle eine unterstützte Datei bis 4 MB, starte bei Bedarf zuerst die Textvorschau und danach die Analyse. Prüfe anschließend Dokumenttyp, Objekt, WE-Nummer, Anbieter, Datum, Gewerke sowie Netto, MwSt. und Brutto. Manuelle Eingaben haben Vorrang vor der KI-Erkennung."
  },
  {
    id: "document-assignment",
    title: "Dokumentzuordnung ändern",
    keywords: ["zuordnen", "zuordnung", "anderes objekt", "anderem objekt", "projektzuordnung"],
    answer:
      "Die dauerhafte Dokumentzuordnung erfolgt im aktuellen Tool über ein Projekt. Öffne das Dokument in der Dokumentprüfung und ändere dort die „Projektzuordnung“. Das Projekt ist einem Objekt zugeordnet; dadurch erscheint das Dokument in dessen Objektakte. Beim Erstimport kannst du außerdem „Bestehendem Objekt zuordnen“ wählen. Eine separate direkte Objektzuordnung außerhalb dieser beiden Wege gibt es derzeit nicht."
  },
  {
    id: "object-report",
    title: "Objektbericht erstellen",
    keywords: ["objektbericht", "bericht erstellen", "pdf", "export"],
    answer:
      "Öffne zuerst das gewünschte Objekt. Klicke danach oben auf „Export PDF“. Solange ein Objekt ausgewählt ist, erzeugt das Tool den Objektbericht; ohne ausgewähltes Objekt wird der Gesamtbericht erstellt. „Gesamtbericht PDF“ erzeugt immer den Portfoliobericht."
  },
  {
    id: "cost-basis",
    title: "Kostenbasis und Dokumentauswahl",
    keywords: ["kostenbasis", "filter", "abschlag", "schlussrechnung", "final", "doppelt"],
    answer:
      "In der Objektakte steuert „Kostenbasis“, welche Dokumente einfließen: alle Dokumente, Angebote, Aufträge, Eingangsrechnungen, Abschläge, Schlussrechnungen, finale Rechnungen, ohne Abschläge oder eine manuelle Auswahl. Bei vorhandener Schlussrechnung warnt das Tool vor einer Doppeladdition von Abschlägen. Dashboard-Kennzahlen verwenden pro Objekt die wirksame Dokumentauswahl: reguläre/finale Rechnungen vor Abschlägen, Abschläge vor Angeboten."
  },
  {
    id: "trade-calculation",
    title: "Gewerkekosten",
    keywords: ["gewerk", "elektro", "maler", "sanitär", "heizung", "asbest", "position"],
    answer:
      "Gewerkekosten stammen vorrangig aus gespeicherten Abschnitts- oder Clustersummen eines Dokuments. Fehlt eine Abschnittssumme bei genau einem Gewerk, wird die Dokumentensumme verwendet. Ist dieselbe Dokumentensumme fälschlich bei mehreren Gewerken gespeichert, teilt die zentrale Regel sie gleichmäßig auf. Jede konkrete Antwort nennt Dokumente, Positionen, verwendete Teilungsfaktoren und fehlende Angaben."
  },
  {
    id: "partial-full-renovation",
    title: "Teil- und Vollsanierung",
    keywords: ["teilsanierung", "vollsanierung", "teil- und vollsanierung", "unterschied"],
    answer:
      "Fachlich betrifft eine Teilsanierung nur einzelne Bereiche oder Gewerke, eine Vollsanierung dagegen die Wohnung oder das Objekt umfassend über mehrere Gewerke. Im aktuellen Tool gibt es dafür keine automatische Schwelle oder eigene Rechenregel: Die Projektart wird aus dem Dokument übernommen oder manuell gepflegt. Kosten werden immer aus den zugeordneten Dokumenten und Positionen berechnet, nicht aus der Bezeichnung „Teil-“ oder „Vollsanierung“."
  },
  {
    id: "quarterly-report",
    title: "Quartalsberichte",
    keywords: ["quartalsbericht", "quartal", "fondsbericht", "powerbi", "power bi"],
    answer:
      "Der Bereich „Quartalsberichte“ lädt Fonds-, Berichts-, Datei-, PowerBI- und Prüfwerte aus Supabase. Der separate Berichtsworkflow ordnet definierte Excel-Zellen, Bereiche und Diagramme PowerPoint-Platzhaltern zu, erstellt eine Vorschau und kennzeichnet fehlende Quellen oder Ziele für die manuelle Prüfung."
  },
  {
    id: "data-quality",
    title: "Datenqualität und Quellen",
    keywords: ["datenqualität", "quelle", "dokumente stammt", "warum fehlt", "k.a.", "confidence"],
    answer:
      "Ein erkannter Wert wird nur gespeichert, wenn ein Quellenbeleg im Dokument vorhanden ist. Zu einem Feld werden Dateiname, Dokument-ID, Methode, Textausschnitt und Confidence gespeichert. Fehlt ein belegbarer Wert oder eine eindeutige Zuordnung, zeigt das Tool „k.A.“ beziehungsweise einen Prüffall; der Assistent nennt dann genau die fehlende Information."
  }
];

export function findKnowledgeAnswer(question: string): AssistantKnowledgeEntry | null {
  const normalized = normalize(question);
  const ranked = assistantKnowledgeBase
    .map((entry) => ({
      entry,
      score: entry.keywords.reduce((sum, keyword) => sum + (normalized.includes(normalize(keyword)) ? 1 : 0), 0)
    }))
    .sort((left, right) => right.score - left.score);
  return ranked[0]?.score ? ranked[0].entry : null;
}

export function knowledgeAsPrompt(): string {
  return assistantKnowledgeBase
    .map((entry) => `${entry.title}: ${entry.answer}`)
    .join("\n\n");
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
