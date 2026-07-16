"use client";

import type React from "react";
import L from "leaflet";
import { Marker, Popup } from "react-leaflet";

const LeafletMarker = Marker as unknown as React.ComponentType<any>;
const LeafletPopup = Popup as unknown as React.ComponentType<any>;

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
  status: "ok" | "attention" | "overBudget" | "done";
  statusLabel: string;
  budget: number | null;
  budgetDeviation: number | null;
  budgetDeviationPercent: number | null;
  progress: number;
  openIssues: number;
  topIssue: string;
  unitCount: string;
  imageUrl: string | null;
}

function markerIcon(status: ObjectMapEntry["status"]) {
  return L.divIcon({
    className: `paribusPinMarker paribusPinMarker_${status}`,
    html: "<span></span>",
    iconSize: [30, 36],
    iconAnchor: [15, 36],
    popupAnchor: [0, -30]
  });
}

export function ObjectMarker({
  entry,
  onOpenObject
}: {
  entry: ObjectMapEntry;
  onOpenObject: (id: string) => void;
}) {
  return (
    <LeafletMarker position={[entry.latitude, entry.longitude]} icon={markerIcon(entry.status)}>
      <LeafletPopup>
        <div className="mapPopup">
          {entry.imageUrl ? <img className="mapPopupImage" src={entry.imageUrl} alt="" /> : null}
          <strong>{entry.objectNumber || "k.A."}</strong>
          <span>{entry.address || entry.title || "k.A."}</span>
          <em className={`mapPopupStatus ${entry.status}`}>{entry.statusLabel}</em>
          <dl>
            <div><dt>Wohneinheiten</dt><dd>{entry.unitCount || "k.A."}</dd></div>
            <div><dt>Budget</dt><dd>{formatEuro(entry.budget)}</dd></div>
            <div><dt>Aktuelle Kosten</dt><dd>{formatEuro(entry.totalCost)}</dd></div>
            <div><dt>Abweichung</dt><dd>{formatEuro(entry.budgetDeviation)}{entry.budgetDeviationPercent !== null ? ` (${formatNumber(entry.budgetDeviationPercent)} %)` : ""}</dd></div>
            <div><dt>Fortschritt</dt><dd>{formatNumber(entry.progress)} %</dd></div>
            <div><dt>Offene Vorgänge</dt><dd>{formatNumber(entry.openIssues)}</dd></div>
          </dl>
          <span className="mapPopupIssue">{entry.topIssue}</span>
          <button type="button" onClick={() => onOpenObject(entry.objectId)}>
            Objekt ansehen
          </button>
        </div>
      </LeafletPopup>
    </LeafletMarker>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(value);
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
