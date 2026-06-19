"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import { ObjectMarker, type ObjectMapEntry } from "./ObjectMarker";

export type { ObjectMapEntry };

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
        Fuer dieses Objekt fehlen Koordinaten. Bitte Latitude und Longitude im Objekt bearbeiten.
      </div>
    );
  }

  return (
    <MapContainer center={mapCenter(entries)} zoom={entries.length === 1 ? 15 : 6} scrollWheelZoom dragging className="leafletMap">
      <TileLayer
        attribution='Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      />
      <TileLayer
        attribution='Labels &copy; Esri'
        url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
        pane="overlayPane"
        opacity={0.95}
      />
      <TileLayer
        attribution='Roads &copy; Esri'
        url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"
        pane="overlayPane"
        opacity={0.95}
      />
      <FitBounds entries={entries} />
      {entries.map((entry) => (
        <ObjectMarker key={entry.key} entry={entry} onOpenObject={onOpenObject} />
      ))}
    </MapContainer>
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
