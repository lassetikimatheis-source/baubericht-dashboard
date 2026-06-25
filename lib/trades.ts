import type { MeasureCluster, ObjectAnalysis } from "../types/analysis";

export const HEATING_SANITARY_TRADE: MeasureCluster = "Heizung und Sanitär";
export const TILING_SCREED_TRADE: MeasureCluster = "Fliesen und Estricharbeiten";
export const ASBESTOS_TRADE: MeasureCluster = "Asbestarbeiten";
export const FACADE_TRADE: MeasureCluster = "Fassadenarbeiten";
export const FLOORING_TRADE: MeasureCluster = "Bodenbelagsarbeiten";
export const CARPENTRY_TRADE: MeasureCluster = "Tischlerarbeiten";

export function normalizeTradeName(value: string | null | undefined, description = ""): MeasureCluster | string {
  const raw = `${value ?? ""} ${description}`.trim();
  const text = raw.toLowerCase();
  if (!text || text === "k.a.") return value ?? "";

  if (/asbest|schadstoffsanierung|\bbt\s*(?:11|17\.45)\b|flexplatten|asbesthaltig|beprobung\s+auf\s+asbest/.test(text)) {
    return ASBESTOS_TRADE;
  }

  if (text === "fassade" || /fassadenarbeiten|fassadensanierung|\bwdvs\b|außenfassade|aussenfassade/.test(text)) {
    return FACADE_TRADE;
  }

  if (/\b(hls|shk|san)\b|sanit[aä]r|heizung|therme|kessel|radiator|fernw[aä]rme|heizk[oö]rper|wasseranschluss|armatur|wc|waschbecken|dusche/.test(text)) {
    return HEATING_SANITARY_TRADE;
  }

  if (/bad\s*\/\s*fliesen|fliesen|fliesenspiegel|estrich|badboden|bodenaufbau/.test(text)) {
    return TILING_SCREED_TRADE;
  }

  if (/bodenbel[aä]ge|bodenbelag|bodenbelagsarbeiten|bodenarbeiten|parkett|vinyl|sockel/.test(text)) {
    return FLOORING_TRADE;
  }

  if (/tischlerarbeiten|tischler/.test(text)) {
    return CARPENTRY_TRADE;
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
  }).filter((cluster) => {
    const isEmptyFacadeFallback = cluster.cluster.value === FACADE_TRADE
      && cluster.totalCost.value === null
      && document.clusters.some((entry) => entry.cluster.value !== cluster.cluster.value && entry.totalCost.value !== null);
    if (isEmptyFacadeFallback) changed = true;
    return !isEmptyFacadeFallback;
  });

  const measureDetails = document.measureDetails?.map((detail) => {
    const nextCluster = normalizeTradeName(detail.cluster, `${detail.abschnitt} ${detail.beschreibung}`) as MeasureCluster;
    if (nextCluster && nextCluster !== detail.cluster) changed = true;
    return nextCluster && nextCluster !== detail.cluster ? { ...detail, cluster: nextCluster } : detail;
  }).filter((detail) => {
    const isEmptyFacadeFallback = detail.cluster === FACADE_TRADE
      && detail.summe === null
      && Boolean(document.measureDetails?.some((entry) => entry.cluster !== detail.cluster && entry.summe !== null));
    if (isEmptyFacadeFallback) changed = true;
    return !isEmptyFacadeFallback;
  });

  const measureDebug = document.measureDebug ? {
    ...document.measureDebug,
    mappings: document.measureDebug.mappings.map((mapping) => {
      const nextCluster = normalizeTradeName(mapping.cluster, `${mapping.heading} ${mapping.description}`) as MeasureCluster;
      if (nextCluster && nextCluster !== mapping.cluster) changed = true;
      return nextCluster && nextCluster !== mapping.cluster ? { ...mapping, cluster: nextCluster } : mapping;
    }).filter((mapping) => {
      const isEmptyFacadeFallback = mapping.cluster === FACADE_TRADE
        && mapping.value === null
        && document.measureDebug?.mappings.some((entry) => entry.cluster !== mapping.cluster && entry.value !== null);
      if (isEmptyFacadeFallback) changed = true;
      return !isEmptyFacadeFallback;
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
