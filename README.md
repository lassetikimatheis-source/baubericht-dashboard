# PARIBUS Baukosten Analyse

Next.js Anwendung fuer Upload, Analyse und Export von Baukosten-Dokumenten.

## Ziel

Rechnungen, Angebote, Scans und Excel-Dateien werden hochgeladen. Die Anwendung liest Dokumentinhalte aus und bereitet sie fuer eine KI-Extraktion auf.

Wichtig: Es werden nur Werte angezeigt, die aus den hochgeladenen Dokumenten extrahiert wurden. Wenn kein Wert gefunden wird, erscheint `k.A.`.

## Aktueller Funktionsumfang

- OCR fuer Bild-Scans (`png`, `jpg`, `jpeg`) via Tesseract
- PDF-Textanalyse via `pdf-parse`
- Excel-/CSV-Analyse via `xlsx`
- KI-Extraktion via OpenAI API
- Dublettenpruefung ueber Datei-Hash
- Quellenangaben pro Feld
- Strenge Feldvalidierung: Werte werden nur uebernommen, wenn ein Quellenbeleg im Dokumenttext gefunden wird
- Textvorschau vor der KI-Analyse, damit PDF-/Excel-Auslesung kontrolliert werden kann
- Export nach Excel
- Export nach PDF
- Dashboard, Upload-Bereich, Objektbereich, Projekte, unzugeordnete Dokumente und Auswertungen

## PARIBUS Baukosten KI

Die Anwendung nutzt einen eigenen Analyse-Agenten namens `PARIBUS Baukosten KI`.

Arbeitsweise:

- Schritt 1: Dokument verstehen
- Schritt 2: Stammdatenabgleich gegen vorhandene Objekte und Projekte vorbereiten
- Schritt 3: Confidence Score vergeben
- Schritt 4: Nutzerentscheidung offen lassen

Die KI darf keine endgueltigen Entscheidungen treffen. Sie erzeugt Vorschlaege fuer Objekte, Projekte, Massnahmencluster, Kosten und Zuordnung. Der Nutzer kann alle erkannten Werte nachtraeglich korrigieren. Manuelle Eingaben haben immer Vorrang.

Confidence:

- 95-100 Prozent: Sicher erkannt
- 80-94 Prozent: Wahrscheinlich erkannt
- 60-79 Prozent: Pruefung empfohlen
- unter 60 Prozent: Manuelle Zuordnung erforderlich

Wenn ein Wert nicht sicher im Dokument steht, bleibt er `k.A.`.

## Start lokal

```bash
npm install
npm run dev
```

Dann oeffnen:

```text
http://localhost:3000
```

## Environment

Datei `.env.example` kopieren und als `.env` speichern:

```env
OPENAI_API_KEY=dein_api_key
OPENAI_MODEL=gpt-4o-mini
SUPABASE_URL=https://dein-projekt.supabase.co
NEXT_PUBLIC_SUPABASE_URL=https://dein-projekt.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=dein_service_role_key
SUPABASE_STORAGE_BUCKET=paribus-files
```

Ohne `OPENAI_API_KEY` werden Dokumente zwar gelesen, aber keine KI-Extraktion ausgefuehrt. Die Oberflaeche zeigt dann `k.A.` und einen entsprechenden Hinweis.

## Zentrale Speicherung fuer geteilte Links

Die App nutzt LocalStorage nur noch als lokalen Zwischenspeicher. Damit andere Nutzer ueber denselben Vercel-Link dieselben Objekte, Projekte, Dokumente und Objektbilder sehen, muss Supabase konfiguriert sein.

1. In Supabase ein Projekt anlegen.
2. `supabase-schema.sql` im Supabase SQL Editor ausfuehren.
3. In Vercel unter Environment Variables setzen:
   - `SUPABASE_URL` oder `NEXT_PUBLIC_SUPABASE_URL` im Format `https://xxxxx.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` fuer den Publishable Key (`sb_publishable_...`)
   - `SUPABASE_SERVICE_ROLE_KEY` oder `SUPABASE_SECRET_KEY` nur serverseitig fuer API-Routen
   - `SUPABASE_STORAGE_BUCKET=paribus-files`
4. Neu deployen.

Danach laedt die App beim Start einen zentralen Snapshot ueber `/api/shared-storage`. Aenderungen an Objekten, Hauseingaengen, Projekten, Dokumenten, Zuordnungen und Objektbildern werden zusaetzlich zentral gespeichert. Ohne Supabase-Konfiguration arbeitet die App weiter lokal, geteilte Links enthalten dann aber keine gemeinsamen Daten.

Hinweis: Ein Wert wie `sb_publishable_...` ist ein Publishable Key, nicht die Project URL. Die Project URL steht in Supabase unter Project Settings > API und sieht aus wie `https://xxxxx.supabase.co`. Tabellen koennen nicht mit dem Publishable Key erstellt werden; dafuer muss `supabase-schema.sql` einmal im Supabase SQL Editor ausgefuehrt werden.

Mit `/api/shared-storage/status` kann geprueft werden, ob Vercel die benoetigten Supabase-Variablen sieht. Die Route gibt nur Booleans aus und zeigt keine Secrets an.

## Warum Werte verworfen werden koennen

Die App uebernimmt keine KI-Antwort blind. Jedes Feld braucht:

- einen Wert
- einen Quellenbeleg (`evidence`)
- einen passenden Originalausschnitt im Dokumenttext

Wenn z. B. Elektroarbeiten im PDF stehen, aber die Adresse oder der Preis nicht eindeutig im gleichen Dokumentausschnitt belegbar ist, wird nur die belegte Information uebernommen. Adresse oder Preis bleiben dann `k.A.`.

## Standardformat Angebot

Die Analyse kennt jetzt das Angebotsformat von Artis Projekte GmbH als Standardfall.

Erkannt werden u. a.:

- Dokumenttyp `Angebot`
- Anbieter
- Fonds
- Datum und Belegnummer
- Betreff mit Objekt und Wohnung
- Muster `760005-1008`: erster Teil = Objektnummer, zweiter Teil = Wohnungsnummer
- Lage wie `2.OG 3.v.li`
- Nettosumme, Umsatzsteuer und Gesamtsumme am Dokumentende
- Massnahmencluster aus Abschnittsueberschriften

Cluster-Mapping:

- Erstbegehung -> Planung / Dokumentation
- Bodenbelagsarbeiten -> Boden
- Malerarbeiten -> Maler
- Fliesenarbeiten und Estrich -> Bad / Fliesen
- Sanitaer - Heizungsarbeiten -> Sanitaer / Heizung
- Elektroarbeiten -> Elektro
- Tischlerarbeiten -> Tueren / Fenster
- Reinigung -> Reinigung
- Zusatzarbeiten -> Sonstiges

Die Haupttabelle wird je Dokument und Objekt zusammengefasst. Einzelpositionen werden optional je Cluster gespeichert, wenn sie eindeutig aus dem Text gelesen werden koennen.

## Projektstruktur

```text
app/
  api/analyze/route.ts
  api/export/excel/route.ts
  api/export/pdf/route.ts
  layout.tsx
  page.tsx
  globals.css
components/
  analysis-dashboard.tsx
  object-detail.tsx
  object-table.tsx
  upload-panel.tsx
lib/
  analysis-state.ts
  format.ts
  server/
    ai-extraction.ts
    document-ingestion.ts
    duplicates.ts
types/
  analysis.ts
```

## Datenmodell

Das Datenmodell liegt in:

```text
types/analysis.ts
```

Alle relevanten Werte sind als `ExtractedField<T>` modelliert. Dadurch hat jedes Feld:

- `value`
- `sources`
- `confidence`

So kann die App spaeter bei jedem Wert zeigen, aus welcher Datei, Seite, Tabelle oder Textstelle er stammt.
