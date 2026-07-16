"use client";

import type React from "react";
import { useEffect } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import { ObjectMarker, type ObjectMapEntry } from "./ObjectMarker";

export type { ObjectMapEntry };

const LeafletMapContainer = MapContainer as unknown as React.ComponentType<any>;
const LeafletTileLayer = TileLayer as unknown as React.ComponentType<any>;

export function ObjectMap({
  entries,
  onOpenObject
}: {
  entries: ObjectMapEntry[];
  onOpenObject: (id: string) => void;
}) {
  if (entries.length === 0) {
    return (
      <div className="mapEmpty">
        Für dieses Objekt fehlen Koordinaten. Bitte Latitude und Longitude im Objekt bearbeiten.
      </div>
    );
  }

  return (
    <LeafletMapContainer center={mapCenter(entries)} zoom={entries.length === 1 ? 15 : 6} scrollWheelZoom dragging className="leafletMap">
      <LeafletTileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds entries={entries} />
      {entries.map((entry) => (
        <ObjectMarker key={entry.key} entry={entry} onOpenObject={onOpenObject} />
      ))}
      <MapLegend />
    </LeafletMapContainer>
  );
}

function MapLegend() {
  return (
    <div className="mapLegend">
      <span><i className="ok" /> Planmäßig</span>
      <span><i className="attention" /> Handlungsbedarf</span>
      <span><i className="overBudget" /> Budgetüberschreitung</span>
      <span><i className="done" /> Abgeschlossen</span>
    </div>
  );
}

function FitBounds({ entries }: { entries: ObjectMapEntry[] }) {
  const map = useMap();
  useEffect(() => {
    if (entries.length === 0) return;
    const coordinates = entries.map((entry) => [entry.latitude, entry.longitude] as [number, number]);
    if (coordinates.length === 1) {
      map.setView(coordinates[0], 15);
      return;
    }
    map.fitBounds(coordinates, { padding: [36, 36] });
  }, [entries, map]);
  return null;
}

function mapCenter(entries: ObjectMapEntry[]): [number, number] {
  const latitude = entries.reduce((sum, entry) => sum + entry.latitude, 0) / entries.length;
  const longitude = entries.reduce((sum, entry) => sum + entry.longitude, 0) / entries.length;
  return [latitude, longitude];
}
