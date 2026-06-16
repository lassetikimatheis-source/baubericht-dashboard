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

interface ObjectTableProps {
  objects: ObjectAnalysis[];
  selectedObjectId: string | null;
  onSelectObject: (id: string) => void;
}

export function ObjectTable({ objects, selectedObjectId, onSelectObject }: ObjectTableProps) {
  return (
    <section className="panel" id="objects">
      <div className="panelHeader">
        <div>
          <h2>Objektuebersicht Tabelle</h2>
          <p>Die Tabelle zeigt nur extrahierte Werte. Fehlende Felder bleiben k.A.</p>
        </div>
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
          <table>
            <thead>
              <tr>
                <th>Jahr</th>
                <th>Dokumenttyp</th>
                <th>Anbieter</th>
                <th>Fonds</th>
                <th>Objektnummer</th>
                <th>Wohnung</th>
                <th>Objektadresse</th>
                <th>Lage</th>
                <th>Sanierte Wohnungen</th>
                <th>Welche Wohnungen</th>
                <th>Gesamtflaeche</th>
                <th>Sanierte Flaeche</th>
                <th>Gesamtkosten</th>
                <th>Kosten/WE</th>
                <th>Kosten/qm</th>
                <th>Quelle Kosten</th>
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
                  <td>{fieldOrUnknown(object.documentType)}</td>
                  <td>{fieldOrUnknown(object.provider)}</td>
                  <td>{fieldOrUnknown(object.fund)}</td>
                  <td>{fieldOrUnknown(object.objectNumber)}</td>
                  <td>{fieldOrUnknown(object.apartmentNumber)}</td>
                  <td>{fieldOrUnknown(object.objectAddress)}</td>
                  <td>{fieldOrUnknown(object.location)}</td>
                  <td>{formatNumber(object.renovatedApartmentCount)}</td>
                  <td>{formatList(object.renovatedApartments)}</td>
                  <td>{formatSqm(object.totalAreaSqm)}</td>
                  <td>{formatSqm(object.renovatedAreaSqm)}</td>
                  <td>{formatCurrency(object.totalCost)}</td>
                  <td>{formatCurrency(object.costPerApartment)}</td>
                  <td>{formatCurrency(object.costPerSqm)}</td>
                  <td>{valueOrUnknown(sourceLabel(object.totalCost))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
