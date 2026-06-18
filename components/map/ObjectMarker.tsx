"use client";

import L from "leaflet";
import { Marker, Popup } from "react-leaflet";

export interface ObjectMapEntry {
  key: string;
  objectId: string;
  title: string;
  objectNumber: string;
  address: string;
  fund: string;
  projectCount: number;
  documentCount: number;
  totalCost: number | null;
  latitude: number;
  longitude: number;
}

const paribusMarkerIcon = L.divIcon({
  className: "paribusPinMarker",
  html: "<span></span>",
  iconSize: [28, 34],
  iconAnchor: [14, 34],
  popupAnchor: [0, -30]
});

export function ObjectMarker({
  entry,
  onOpenObject
}: {
  entry: ObjectMapEntry;
  onOpenObject: (id: string) => void;
}) {
  return (
    <Marker position={[entry.latitude, entry.longitude]} icon={paribusMarkerIcon}>
      <Popup>
        <div className="mapPopup">
          <strong>{entry.objectNumber || "k.A."}</strong>
          <span>{entry.address || entry.title || "k.A."}</span>
          <span>Fonds: {entry.fund || "k.A."}</span>
          <span>Brutto: {formatEuro(entry.totalCost)}</span>
          <span>Projekte: {formatNumber(entry.projectCount)}</span>
          <span>Dokumente: {formatNumber(entry.documentCount)}</span>
          <button type="button" onClick={() => onOpenObject(entry.objectId)}>
            Objekt oeffnen
          </button>
        </div>
      </Popup>
    </Marker>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("de-DE").format(value);
}

function formatEuro(value: number | null): string {
  if (value === null) return "k.A.";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}
