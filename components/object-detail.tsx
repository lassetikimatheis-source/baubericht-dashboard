import type { ObjectAnalysis, RegexMatchDebug } from "../types/analysis";
import {
  fieldOrUnknown,
  formatCurrency,
  formatList,
  formatNumber,
  formatSqm,
  sourceLabel,
  valueOrUnknown
} from "../lib/format";

interface ObjectDetailProps {
  object: ObjectAnalysis | null;
}

export function ObjectDetail({ object }: ObjectDetailProps) {
  return (
    <section className="panel" id="details">
      <div className="detailHero">
        <div>
          <h2>Detailansicht Objekt</h2>
          <p>Stammdaten, Dokumentwerte, Maßnahmen, Kosten und Debug-Quellen.</p>
        </div>
        <div className="headerActions">
          <button type="button" disabled={!object}>Manuell korrigieren</button>
          <span className="status statusNeutral">{object ? fieldOrUnknown(object.objectNumber) : "k.A."}</span>
        </div>
      </div>

      {!object ? (
        <div className="emptyState">
          <div>
            <strong>Kein Objekt ausgewaehlt</strong>
            <p>Sobald Dokumentdaten extrahiert wurden, erscheint hier die Objektkarte.</p>
          </div>
        </div>
      ) : (
        <div className="detailGrid">
          <section className="detailSection detailSectionWide">
            <h3>Objekt-Stammdaten</h3>
            <div className="detailMetrics">
              <Metric label="Jahr" value={fieldOrUnknown(object.year)} source={sourceLabel(object.year)} />
              <Metric label="Fonds" value={fieldOrUnknown(object.fund)} source={sourceLabel(object.fund)} />
              <Metric label="Objektnummer" value={fieldOrUnknown(object.objectNumber)} source={sourceLabel(object.objectNumber)} />
              <Metric label="Adresse" value={fieldOrUnknown(object.objectAddress)} source={sourceLabel(object.objectAddress)} />
              <Metric label="Wohnung" value={fieldOrUnknown(object.apartmentNumber)} source={sourceLabel(object.apartmentNumber)} />
              <Metric label="Lage" value={fieldOrUnknown(object.location)} source={sourceLabel(object.location)} />
              <Metric label="Sanierte WE" value={formatNumber(object.renovatedApartmentCount)} source={sourceLabel(object.renovatedApartmentCount)} />
              <Metric label="Wohnungen" value={formatList(object.renovatedApartments)} source={sourceLabel(object.renovatedApartments)} />
              <Metric label="Gesamtfläche" value={formatSqm(object.totalAreaSqm)} source={sourceLabel(object.totalAreaSqm)} />
              <Metric label="Sanierte Fläche" value={formatSqm(object.renovatedAreaSqm)} source={sourceLabel(object.renovatedAreaSqm)} />
            </div>
          </section>

          <section className="detailSection">
            <h3>Erkannte Dokumente</h3>
            <div className="documentSummary">
              <Metric label="Dokumenttyp" value={fieldOrUnknown(object.documentType)} source={sourceLabel(object.documentType)} />
              <Metric label="Anbieter" value={fieldOrUnknown(object.provider)} source={sourceLabel(object.provider)} />
              <Metric label="Datum" value={fieldOrUnknown(object.documentDate)} source={sourceLabel(object.documentDate)} />
              <Metric label="Dokumentnummer" value={fieldOrUnknown(object.documentNumber)} source={sourceLabel(object.documentNumber)} />
              <Metric label="Datenqualität" value={fieldOrUnknown(object.dataQuality)} source={sourceLabel(object.dataQuality)} />
            </div>
          </section>

          <section className="detailSection">
            <h3>Kostenaufstellung</h3>
            <div className="costStack">
              <CostLine label="Kosten netto" value={formatCurrency(object.netCost)} source={sourceLabel(object.netCost)} />
              <CostLine label="MwSt." value={formatCurrency(object.vatCost)} source={sourceLabel(object.vatCost)} />
              <CostLine label="Kosten brutto" value={formatCurrency(object.totalCost)} source={sourceLabel(object.totalCost)} strong />
              <CostLine label="Kosten pro Wohnung" value={formatCurrency(object.costPerApartment)} source={sourceLabel(object.costPerApartment)} />
              <CostLine label="Kosten pro qm" value={formatCurrency(object.costPerSqm)} source={sourceLabel(object.costPerSqm)} />
            </div>
          </section>

          <section className="detailSection detailSectionWide">
            <h3>Maßnahmen-Zusammenfassung</h3>
            <div className="metric" style={{ marginBottom: 14 }}>
              <span>Beschreibung Maßnahmen</span>
              <strong>{fieldOrUnknown(object.measureDescription)}</strong>
              <small>{sourceLabel(object.measureDescription)}</small>
            </div>
            <div className="clusterList">
              {object.clusters.length === 0 ? (
                <span className="pill">Maßnahmencluster: k.A.</span>
              ) : (
                object.clusters.map((cluster) => (
                  <span className="pill" key={cluster.id}>
                    {fieldOrUnknown(cluster.cluster)} - {formatCurrency(cluster.totalCost)} -{" "}
                    {valueOrUnknown(cluster.allocation.value)}
                  </span>
                ))
              )}
            </div>
            <div className="tableWrap compactTable">
              <table>
                <thead>
                  <tr>
                    <th>Cluster</th>
                    <th>Beschreibung</th>
                    <th>Kosten</th>
                    <th>GE/SE</th>
                    <th>Quelle</th>
                  </tr>
                </thead>
                <tbody>
                  {object.clusters.length === 0 ? (
                    <tr>
                      <td colSpan={5}>k.A.</td>
                    </tr>
                  ) : (
                    object.clusters.map((cluster) => (
                      <tr key={cluster.id}>
                        <td>{fieldOrUnknown(cluster.cluster)}</td>
                        <td>{fieldOrUnknown(cluster.description)}</td>
                        <td>{formatCurrency(cluster.totalCost)}</td>
                        <td>{valueOrUnknown(cluster.allocation.value)}</td>
                        <td>{sourceLabel(cluster.description)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="detailSection">
            <h3>Fehlende Angaben</h3>
            {object.missingInformation.value?.length ? (
              <div className="issueList cleanIssues">
                {object.missingInformation.value.map((item) => <p key={item}>{item}</p>)}
              </div>
            ) : (
              <p className="muted">k.A.</p>
            )}
          </section>

          <section className="detailSection detailSectionWide">
            <h3>Quellen / Debug</h3>
            <CostDebug object={object} />
          </section>
        </div>
      )}
    </section>
  );
}

function CostDebug({ object }: { object: ObjectAnalysis }) {
  const debug = object.costDebug;
  if (!debug) return <p className="muted">Keine Debugdaten vorhanden.</p>;

  return (
    <div className="debugGrid">
      <div className="debugBlock">
        <h4>Erkannter Summenblock</h4>
        <pre>{debug.summaryBlock || "k.A."}</pre>
      </div>
      <div className="debugBlock">
        <h4>Finale Kostenwerte</h4>
        <DebugMatch label="Netto" match={debug.finalValues.net} />
        <DebugMatch label="MwSt." match={debug.finalValues.vat} />
        <DebugMatch label="Brutto" match={debug.finalValues.gross} />
        {debug.notes.length ? (
          <div className="debugNotes">
            {debug.notes.map((note) => <p key={note}>{note}</p>)}
          </div>
        ) : null}
      </div>
      <div className="debugBlock debugBlockWide">
        <h4>Regex-Treffer</h4>
        {debug.matches.length === 0 ? (
          <p className="muted">Keine Treffer.</p>
        ) : (
          <div className="debugMatches">
            {debug.matches.map((match, index) => (
              <DebugMatch key={`${match.label}-${match.raw}-${index}`} label={match.label} match={match} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DebugMatch({ label, match }: { label: string; match: RegexMatchDebug }) {
  return (
    <div className="debugMatch">
      <span>{label}</span>
      <strong>{match.value === null ? "k.A." : formatCurrency(match.value)}</strong>
      <small>{match.source}{match.raw ? ` - ${match.raw}` : ""}</small>
    </div>
  );
}

function CostLine({ label, value, source, strong }: { label: string; value: string; source: string; strong?: boolean }) {
  return (
    <div className={`costLine${strong ? " costLineStrong" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{source}</small>
    </div>
  );
}

function Metric({ label, value, source }: { label: string; value: string; source: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{source}</small>
    </div>
  );
}
