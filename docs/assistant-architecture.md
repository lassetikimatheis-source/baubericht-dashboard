# PARIBUS Baukosten-Assistent – Daten- und Rechenwege

## Datenfluss der bestehenden Anwendung

1. `app/api/analyze/route.ts` liest Uploads ausschließlich serverseitig.
2. `lib/server/document-ingestion.ts` extrahiert Text aus PDF, Excel/CSV und Bildern.
3. `lib/server/ai-extraction.ts` kombiniert deterministische Erkennung mit der optionalen OpenAI-Extraktion. Ein Feld wird nur mit Quellenbeleg übernommen.
4. `ObjectAnalysis` in `types/analysis.ts` speichert pro Feld `value`, `sources` und `confidence`. Gewerke können zusätzlich Abschnittssummen und Einzelpositionen mit Menge, Einheit, Einzelpreis und Gesamtpreis enthalten.
5. Die produktive App lädt Objekte, Projekte, Dokumente und Zuordnungen primär über `/api/app-data` aus Neon. Der vorhandene Supabase-Pfad bleibt als Fallback und für Quartalsberichte bestehen.
6. `components/analysis-dashboard.tsx` filtert die Dokumente nach Objekt, Projekt, Jahr, Gewerk, Dokumenttyp und Kostenbasis und rendert daraus Kennzahlen, Tabellen, Diagramme und Berichte.

## Zentrale Berechnungen

Alle folgenden Regeln liegen in `lib/cost-calculations.ts` und werden sowohl von der Oberfläche als auch von den Berechnungserklärungen verwendet.

| Angezeigter Wert | Datenbasis | Regel |
| --- | --- | --- |
| Summe brutto/netto/MwSt. | Feldwerte der ausgewählten Dokumente | Nur gespeicherte numerische Werte werden addiert; `null` bleibt ausgeschlossen und wird als fehlend ausgewiesen. |
| Dashboard-Kostenbasis | Dokumenttyp je Objekt | Reguläre/finale Rechnungen und Gutschriften vor Abschlägen; Abschläge vor Angeboten/Aufträgen. |
| Finale Kosten | Schlussrechnungen, sonst reguläre Rechnungen/Gutschriften | Abschläge werden nicht zusätzlich addiert. |
| Kosten pro Wohnung | Bruttosumme und sanierte Wohnungen | `Bruttosumme ÷ Anzahl sanierter Wohnungen`, auf Cent gerundet. |
| Kosten pro m² | Bruttosumme und sanierte Fläche aus Objekt/Projekt | `Bruttosumme ÷ sanierte Fläche`, auf Cent gerundet. |
| Gewerkesumme | Cluster- oder Abschnittssummen | Gespeicherte Gewerkesumme hat Vorrang. Bei genau einem Gewerk darf die Dokumentensumme einspringen. |
| Mehrfach belegte Dokumentensumme | Identische Dokumentensumme in mehreren Clustern | Gleichmäßige Teilung durch die Anzahl der betroffenen Cluster; der Faktor wird in der Erklärung genannt. |
| Fehlende Abschnittssumme | Dokument mit mehreren Maßnahmendetails | Letzter Fallback ist die gleichmäßige Teilung der Dokumentensumme; die Erklärung kennzeichnet dies ausdrücklich. |

## Erklärungs- und Chatablauf

1. `components/assistant-chat.tsx` übergibt nur Seitenkontext und Frage. Es enthält keinen Datenbank- oder OpenAI-Schlüssel.
2. `app/api/assistant/chat/route.ts` akzeptiert nur Same-Origin-Aufrufe, begrenzt Verlauf, Textlängen und Kontext-IDs und deaktiviert Caching.
3. `lib/server/calculation-explanations.ts` lädt die zugänglichen Daten serverseitig aus Neon und löst Objekt-, Projekt-, Dokument- und Berichtskontext auf.
4. Konkrete Zahlen werden deterministisch aus den zentralen Funktionen erzeugt. Das Sprachmodell formuliert keine Zahlenberechnung.
5. `lib/assistant-knowledge.ts` enthält die interne Wissensgrundlage zu tatsächlich vorhandenen Bedienabläufen.
6. OpenAI wird nur für allgemeine, datenunabhängige Bedienfragen verwendet. Ohne API-Schlüssel bleiben diese Antworten über die lokale Wissensgrundlage verfügbar.
7. Ist eine konkrete Zahl nicht belegbar oder die Datenbank nicht erreichbar, wird keine Ersatzantwort geschätzt.

## Berechnungserklärung

Eine Aufschlüsselung enthält, soweit gespeichert:

- Ergebnis und Formel
- berücksichtigte und ausgeschlossene Dokumente
- Dokumenttyp, Nummer, Anbieter und Objekt
- Gewerk und Abschnitt
- Position, Menge, Einheit, Einzelpreis und Positionssumme
- angewendeten Teilungsfaktor
- Abweichungen zwischen Positions- und Gewerkesumme
- fehlende Angaben
- letzten Datenbank-Aktualisierungszeitpunkt

## Zugriffsmodell

Der Assistent übernimmt das bestehende Zugriffsmodell der Anwendung. In der aktuellen Codebasis liefert `AuthGate` ein offenes Owner-Profil; damit haben alle regulär eingelassenen Nutzer dieselben Leserechte. Die Chatroute erweitert diese Rechte nicht und führt ausschließlich serverseitige Lesezugriffe aus. Wenn das Authentifizierungsmodell später wieder auf Benutzer- oder Rollen-Tokens umgestellt wird, muss dieselbe serverseitige Prüfung vor `loadAssistantDataSnapshot` ergänzt werden.
