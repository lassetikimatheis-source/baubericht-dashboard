import type { ObjectAnalysis } from "../types/analysis";
import {
  fieldOrUnknown,
  formatCurrency,
  sourceLabel,
  valueOrUnknown
} from "../lib/format";

interface ObjectTableProps {
  objects: ObjectAnalysis[];
  selectedObjectId: string | null;
  onSelectObject: (id: string) => void;
}

export function ObjectTable({ objects, selectedObjectId, onSelectObject }: ObjectTableProps) {
  return (
    <section className="panel panelFlush" id="objects">
      <div className="panelHeader tableHeader">
        <div>
          <h2>Objektübersicht</h2>
          <p>Eine Zeile je erkanntem Dokument/Objekt. Fehlende Werte bleiben k.A.</p>
        </div>
        <span className="status statusNeutral">{objects.length} Datensätze</span>
      </div>

      {objects.length === 0 ? (
        <div className="emptyState">
          <div>
            <strong>Noch keine Objektdaten gefunden</strong>
            <p>Nach Upload und Analyse erscheinen hier die erkannten Objekte.</p>
          </div>
        </div>
      ) : (
        <div className="tableWrap">
          <table className="dataTable">
            <thead>
              <tr>
                <th>Jahr</th>
                <th>Fonds</th>
                <th>Objektnummer</th>
                <th>Adresse</th>
                <th>Wohnung / Lage</th>
                <th>Dokumenttyp</th>
                <th>Anbieter</th>
                <th>Datum</th>
                <th>Dokumentnummer</th>
                <th>Maßnahmencluster</th>
                <th>Kosten netto</th>
                <th>MwSt.</th>
                <th>Kosten brutto</th>
                <th>Kosten pro Wohnung</th>
                <th>Kosten pro qm</th>
                <th>Datenqualität</th>
                <th>Quelle</th>
              </tr>
            </thead>
            <tbody>
              {objects.map((object) => (
                <tr
                  key={object.id}
                  className={selectedObjectId === object.id ? "selectedRow" : ""}
                  onClick={() => onSelectObject(object.id)}
                >
                  <td>{fieldOrUnknown(object.year)}</td>
                  <td>{fieldOrUnknown(object.fund)}</td>
                  <td>{fieldOrUnknown(object.objectNumber)}</td>
                  <td className="wideCell">{fieldOrUnknown(object.objectAddress)}</td>
                  <td>{formatApartment(object)}</td>
                  <td>{fieldOrUnknown(object.documentType)}</td>
                  <td>{fieldOrUnknown(object.provider)}</td>
                  <td>{fieldOrUnknown(object.documentDate)}</td>
                  <td>{fieldOrUnknown(object.documentNumber)}</td>
                  <td className="clusterCell">{formatClusters(object)}</td>
                  <td>{formatCurrency(object.netCost)}</td>
                  <td>{formatCurrency(object.vatCost)}</td>
                  <td className="moneyStrong">{formatCurrency(object.totalCost)}</td>
                  <td>{formatCurrency(object.costPerApartment)}</td>
                  <td>{formatCurrency(object.costPerSqm)}</td>
                  <td>{fieldOrUnknown(object.dataQuality)}</td>
                  <td className="sourceCell">{valueOrUnknown(sourceLabel(object.totalCost))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function formatApartment(object: ObjectAnalysis): string {
  const apartment = fieldOrUnknown(object.apartmentNumber);
  const location = fieldOrUnknown(object.location);
  if (apartment === "k.A." && location === "k.A.") return "k.A.";
  if (location === "k.A.") return apartment;
  if (apartment === "k.A.") return location;
  return `${apartment} / ${location}`;
}

function formatClusters(object: ObjectAnalysis): string {
  const clusters = Array.from(new Set(object.clusters.map((cluster) => cluster.cluster.value).filter(Boolean)));
  return clusters.length === 0 ? "k.A." : clusters.join(", ");
}
