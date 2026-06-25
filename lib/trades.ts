import type { MeasureCluster, ObjectAnalysis } from "../types/analysis";

export const HEATING_SANITARY_TRADE: MeasureCluster = "Heizung und Sanitär";
export const TILING_SCREED_TRADE: MeasureCluster = "Fliesen und Estricharbeiten";

export function normalizeTradeName(value: string | null | undefined, description = ""): MeasureCluster | string {
  const raw = `${value ?? ""} ${description}`.trim();
  const text = raw.toLowerCase();
  if (!text || text === "k.a.") return value ?? "";

  if (/\b(hls|shk|san)\b|sanit[aä]r|heizung|therme|kessel|radiator|fernw[aä]rme|heizk[oö]rper|wasseranschluss|armatur|wc|waschbecken|dusche/.test(text)) {
    return HEATING_SANITARY_TRADE;
  }

  if (/bad\s*\/\s*fliesen|fliesen|fliesenspiegel|estrich|badboden|bodenaufbau/.test(text)) {
    return TILING_SCREED_TRADE;
  }

  return value ?? "";
}

export function normalizeDocumentTrades(document: ObjectAnalysis): { document: ObjectAnalysis; changed: boolean } {
  let changed = false;
  const clusters = document.clusters.map((cluster) => {
    const nextCluster = normalizeTradeName(cluster.cluster.value, cluster.description.value ?? "") as MeasureCluster;
    if (nextCluster && nextCluster !== cluster.cluster.value) changed = true;
    return nextCluster && nextCluster !== cluster.cluster.value
      ? { ...cluster, cluster: { ...cluster.cluster, value: nextCluster } }
      : cluster;
  });

  const measureDetails = document.measureDetails?.map((detail) => {
    const nextCluster = normalizeTradeName(detail.cluster, `${detail.abschnitt} ${detail.beschreibung}`) as MeasureCluster;
    if (nextCluster && nextCluster !== detail.cluster) changed = true;
    return nextCluster && nextCluster !== detail.cluster ? { ...detail, cluster: nextCluster } : detail;
  });

  const measureDebug = document.measureDebug ? {
    ...document.measureDebug,
    mappings: document.measureDebug.mappings.map((mapping) => {
      const nextCluster = normalizeTradeName(mapping.cluster, `${mapping.heading} ${mapping.description}`) as MeasureCluster;
      if (nextCluster && nextCluster !== mapping.cluster) changed = true;
      return nextCluster && nextCluster !== mapping.cluster ? { ...mapping, cluster: nextCluster } : mapping;
    })
  } : document.measureDebug;

  return {
    document: {
      ...document,
      clusters,
      measureDetails,
      measureDebug
    },
    changed
  };
}
