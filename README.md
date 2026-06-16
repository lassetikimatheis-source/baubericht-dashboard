# Baubericht Dashboard

Lokale Fullstack-Web-App für den interaktiven Baubericht mit PDF-Upload, Dokumentenanalyse und objektbezogener Auswertung.

## Projektstruktur

```text
/frontend    Dashboard im Browser
/backend     Node.js/Express API
/Dokumente   Ablage für PDF-Rechnungen, Angebote und Bauberichte
/data        gespeicherte Analyseergebnisse
```

## Start

1. Abhängigkeiten installieren:

```bash
npm install
```

2. App starten:

```bash
npm run dev
```

3. Im Browser öffnen:

```text
http://127.0.0.1:4173
```

## PDFs hochladen

Du kannst PDFs auf zwei Arten hinzufügen:

- Im Dashboard den Bereich **Dokumente** öffnen und über **PDFs hochladen** Dateien auswählen.
- PDF-Dateien direkt in den Ordner `Dokumente/` legen.

Der Upload-Endpunkt ist:

```text
POST /api/upload
```

Das Formularfeld heißt `pdfs`.

## Dokumente analysieren

Im Bereich **Dokumente** auf **Dokumente analysieren** klicken.

Der Button ruft diesen Endpunkt auf:

```text
POST /api/analyze-documents
```

Das Backend liest alle PDFs aus `Dokumente/`, extrahiert Text mit `pdf-parse` und speichert die strukturierten Daten hier:

```text
data/extracted-documents.json
```

Wenn keine PDFs vorhanden sind, lädt die App automatisch Beispieldaten, damit das Dashboard direkt testbar bleibt.

## OpenAI API-Key eintragen

1. Datei `.env.example` kopieren und als `.env` speichern.
2. Deinen API-Key eintragen:

```env
OPENAI_API_KEY=dein_api_key
PORT=4173
```

Wenn kein `OPENAI_API_KEY` vorhanden ist, nutzt das Backend den Mock/Testmodus. Dann werden Objekt, Adresse, Maßnahme, Gewerk, Kosten, GE/SE und Zuordnung mit einfachen Regeln erkannt. Mit API-Key ist die Analyse für eine spätere KI-Auswertung vorbereitet.

## Ergebnis prüfen

- Dashboard: Gesamtkosten und Dokumentenstatus
- Objekte: zugeordnete Dokumente pro Immobilie
- Dokumente: Maßnahmen-Tabelle mit Netto, MwSt., Brutto, GE/SE, Quelle und Status
- Datei: `data/extracted-documents.json`

## Deployment auf Vercel

Das Projekt enthält `vercel.json` und `api/index.js`, damit Vercel die Express-API als Serverless Function ausführen kann.

In Vercel:

1. GitHub-Repository importieren.
2. Framework Preset auf **Other** lassen.
3. Environment Variable setzen:

```text
OPENAI_API_KEY=dein_api_key
```

4. Deploy starten.

Hinweis: Auf Vercel ist der lokale Dateispeicher nicht dauerhaft. Uploads und Analyseergebnisse funktionieren im Prototyp über temporären Speicher. Für echte dauerhafte PDF-Ablage sollte später Vercel Blob, Supabase Storage oder ein ähnlicher Speicher angebunden werden.
