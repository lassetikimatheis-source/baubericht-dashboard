import type { ObjectAnalysis } from "../types/analysis";
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
          <p>Alle Felder zeigen ihre Quelle, sofern ein Dokumentwert vorhanden ist.</p>
        </div>
        <span className="status statusNeutral">
          {object ? fieldOrUnknown(object.objectNumber) : "k.A."}
        </span>
      </div>

      {!object ? (
        <div className="emptyState">
          <div>
            <strong>Kein Objekt ausgewaehlt</strong>
            <p>Sobald Dokumentdaten extrahiert wurden, erscheint hier die Objektkarte.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="detailMetrics">
            <Metric label="Jahr" value={fieldOrUnknown(object.year)} source={sourceLabel(object.year)} />
            <Metric label="Dokumenttyp" value={fieldOrUnknown(object.documentType)} source={sourceLabel(object.documentType)} />
            <Metric label="Anbieter" value={fieldOrUnknown(object.provider)} source={sourceLabel(object.provider)} />
            <Metric label="Fonds" value={fieldOrUnknown(object.fund)} source={sourceLabel(object.fund)} />
            <Metric label="Dokumentnummer" value={fieldOrUnknown(object.documentNumber)} source={sourceLabel(object.documentNumber)} />
            <Metric label="Datum" value={fieldOrUnknown(object.documentDate)} source={sourceLabel(object.documentDate)} />
            <Metric label="Adresse" value={fieldOrUnknown(object.objectAddress)} source={sourceLabel(object.objectAddress)} />
            <Metric label="Wohnung" value={fieldOrUnknown(object.apartmentNumber)} source={sourceLabel(object.apartmentNumber)} />
            <Metric label="Lage" value={fieldOrUnknown(object.location)} source={sourceLabel(object.location)} />
            <Metric label="Sanierte WE" value={formatNumber(object.renovatedApartmentCount)} source={sourceLabel(object.renovatedApartmentCount)} />
            <Metric label="Wohnungen" value={formatList(object.renovatedApartments)} source={sourceLabel(object.renovatedApartments)} />
            <Metric label="Gesamtflaeche" value={formatSqm(object.totalAreaSqm)} source={sourceLabel(object.totalAreaSqm)} />
            <Metric label="Sanierte Flaeche" value={formatSqm(object.renovatedAreaSqm)} source={sourceLabel(object.renovatedAreaSqm)} />
            <Metric label="Netto" value={formatCurrency(object.netCost)} source={sourceLabel(object.netCost)} />
            <Metric label="MwSt." value={formatCurrency(object.vatCost)} source={sourceLabel(object.vatCost)} />
            <Metric label="Gesamtkosten" value={formatCurrency(object.totalCost)} source={sourceLabel(object.totalCost)} />
            <Metric label="Kosten/WE" value={formatCurrency(object.costPerApartment)} source={sourceLabel(object.costPerApartment)} />
            <Metric label="Kosten/qm" value={formatCurrency(object.costPerSqm)} source={sourceLabel(object.costPerSqm)} />
          </div>

          <div className="metric" style={{ marginBottom: 14 }}>
            <span>Beschreibung Massnahmen</span>
            <strong>{fieldOrUnknown(object.measureDescription)}</strong>
            <small>{sourceLabel(object.measureDescription)}</small>
          </div>

          <div className="clusterList">
            {object.clusters.length === 0 ? (
              <span className="pill">Massnahmencluster: k.A.</span>
            ) : (
              object.clusters.map((cluster) => (
                <span className="pill" key={cluster.id}>
                  {fieldOrUnknown(cluster.cluster)} · {formatCurrency(cluster.totalCost)} ·{" "}
                  {valueOrUnknown(cluster.allocation.value)}
                </span>
              ))
            )}
          </div>

          <div className="tableWrap">
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
        </>
      )}
    </section>
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
