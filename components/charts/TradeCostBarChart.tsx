"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

export interface TradeCostChartRow {
  id: string;
  cluster: string;
  beschreibung: string;
  kosten_brutto: number | null;
  anteil_prozent: number | null;
  quelle: string;
  status: string;
}

export function TradeCostBarChart({
  rows,
  onSelect
}: {
  rows: TradeCostChartRow[];
  onSelect?: (id: string) => void;
}) {
  const chartRows = rows
    .filter((row) => typeof row.kosten_brutto === "number")
    .sort((a, b) => (b.kosten_brutto ?? 0) - (a.kosten_brutto ?? 0));

  if (chartRows.length === 0) {
    return (
      <section className="measureChartEmpty">
        <h3>Kosten nach Gewerk</h3>
        <p>Keine Maßnahmen mit Kosten vorhanden.</p>
      </section>
    );
  }

  return (
    <section className="tradeChartCard">
      <div className="panelHeader compactHeader">
        <div>
          <h3>Kosten nach Gewerk</h3>
          <p>Bruttokosten nach erkanntem Maßnahmencluster.</p>
        </div>
      </div>
      <div className="tradeChart">
        <ResponsiveContainer width="100%" height={Math.max(340, chartRows.length * 48)}>
          <BarChart
            data={chartRows}
            layout="vertical"
            margin={{ top: 12, right: 34, bottom: 16, left: 30 }}
            barCategoryGap={14}
          >
            <XAxis
              type="number"
              axisLine={{ stroke: "#DCE2E8" }}
              tickLine={false}
              tick={{ fill: "#63748A", fontSize: 12 }}
              tickFormatter={(value) => formatShortEuro(Number(value))}
            />
            <YAxis
              type="category"
              dataKey="cluster"
              width={170}
              axisLine={{ stroke: "#DCE2E8" }}
              tickLine={false}
              tick={{ fill: "#24364D", fontSize: 12, fontWeight: 800 }}
            />
            <Tooltip
              cursor={{ fill: "rgba(70, 99, 137, 0.06)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as TradeCostChartRow;
                return (
                  <div className="tradeTooltip">
                    <strong>{row.cluster}</strong>
                    <span>{row.beschreibung || "k.A."}</span>
                    <span>{formatEuro(row.kosten_brutto)} - {formatPercent(row.anteil_prozent)}</span>
                  </div>
                );
              }}
            />
            <Bar
              dataKey="kosten_brutto"
              radius={[0, 8, 8, 0]}
              onClick={(data) => onSelect?.((data as TradeCostChartRow).id)}
            >
              {chartRows.map((row, index) => (
                <Cell key={row.id} fill={index === 0 ? "#FF6E42" : "#466389"} cursor="pointer" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
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

function formatShortEuro(value: number): string {
  if (value >= 1000000) return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(value / 1000000)} Mio.`;
  if (value >= 1000) return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(value / 1000)} Tsd.`;
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value: number | null): string {
  if (value === null) return "k.A.";
  return `${new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} %`;
}
