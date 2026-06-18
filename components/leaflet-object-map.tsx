"use client";

import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import type { ObjectAnalysis } from "../types/analysis";

export interface LeafletMapEntry {
  key: string;
  objectId: string;
  title: string;
  objectNumber: string;
  address: string;
  fund: string;
  projectCount: number;
  documents: ObjectAnalysis[];
  totalCost: number | null;
  latitude: number | null;
  longitude: number | null;
}

const paribusMapIcon = L.divIcon({
  className: "paribusLeafletMarker",
  html: "<span></span>",
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -14]
});

export default function LeafletObjectMap({
  entries,
  center,
  onOpenObject,
  onSelectDocument
}: LeafletObjectMapProps) {
  return (
    <MapContainer center={center} zoom={entries.length === 1 ? 15 : 6} scrollWheelZoom dragging className="leafletMap">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitMapToMarkers entries={entries} />
      {entries.map((entry) => (
        <Marker
          key={entry.key}
          position={[entry.latitude as number, entry.longitude as number]}
          icon={paribusMapIcon}
          eventHandlers={{
            click: () => {
              if (!entry.objectId && entry.documents[0]) onSelectDocument(entry.documents[0].id);
            }
          }}
        >
          <Popup>
            <div className="mapPopup">
              <strong>{entry.objectNumber || "k.A."}</strong>
              <span>{entry.address || entry.title || "k.A."}</span>
              <span>Fonds: {entry.fund || "k.A."}</span>
              <span>Projekte: {formatNumber(entry.projectCount)}</span>
              <span>Dokumente: {formatNumber(entry.documents.length)}</span>
              <span>Brutto: {formatCurrency(entry.totalCost)}</span>
              <button type="button" onClick={() => entry.objectId ? onOpenObject(entry.objectId) : entry.documents[0] && onSelectDocument(entry.documents[0].id)}>
                Objekt oeffnen
              </button>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

export interface LeafletObjectMapProps {
  entries: LeafletMapEntry[];
  center: [number, number];
  onOpenObject: (id: string) => void;
  onSelectDocument: (id: string) => void;
}

function FitMapToMarkers({ entries }: { entries: LeafletMapEntry[] }) {
  const map = useMap();
  useEffect(() => {
    const coordinates = entries
      .filter((entry) => entry.latitude !== null && entry.longitude !== null)
      .map((entry) => [entry.latitude as number, entry.longitude as number] as [number, number]);
    if (coordinates.length === 0) return;
    if (coordinates.length === 1) {
      map.setView(coordinates[0], 15);
      return;
    }
    map.fitBounds(coordinates, { padding: [36, 36] });
  }, [entries, map]);
  return null;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("de-DE").format(value);
}

function formatCurrency(value: number | null): string {
  if (value === null) return "k.A.";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}
