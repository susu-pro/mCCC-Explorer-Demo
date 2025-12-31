export function readQueryState(search) {
  const sp = new URLSearchParams(search);
  const view = sp.get("view") ?? undefined;
  const w = sp.get("w") ?? undefined;

  const fdr = sp.get("fdr");
  const top = sp.get("top");
  const self = sp.get("self");
  const flux = sp.get("flux");
  const ann = sp.get("ann");

  const fdrMax = fdr === null ? undefined : Number(fdr);
  const topEdges = top === null ? undefined : Number(top);
  const includeSelfLoops = self === null ? undefined : self === "1" || self === "true";

  const metaboliteQuery = sp.get("m") ?? undefined;
  const sensorQuery = sp.get("s") ?? undefined;
  const focusCell = sp.get("focus") ?? undefined;
  const focusMode = sp.get("focusMode") ?? undefined;

  const filters = {};
  if (Number.isFinite(fdrMax)) filters.fdrMax = fdrMax;
  if (Number.isFinite(topEdges)) filters.topEdges = topEdges;
  if (typeof includeSelfLoops === "boolean") filters.includeSelfLoops = includeSelfLoops;
  if (typeof metaboliteQuery === "string") filters.metaboliteQuery = metaboliteQuery;
  if (typeof sensorQuery === "string") filters.sensorQuery = sensorQuery;
  if (typeof ann === "string") filters.annotationQuery = ann;
  if (flux === "all" || flux === "pass" || flux === "unpass") filters.fluxPass = flux;
  if (typeof focusCell === "string") filters.focusCell = focusCell;
  if (focusMode === "any" || focusMode === "incoming" || focusMode === "outgoing") filters.focusMode = focusMode;

  return { view, weightMode: w, filters };
}

export function writeQueryState({ view, filters }) {
  const sp = new URLSearchParams();
  sp.set("view", view);
  if (typeof filters.fdrMax === "number") sp.set("fdr", String(filters.fdrMax));
  if (typeof filters.topEdges === "number") sp.set("top", String(filters.topEdges));
  sp.set("self", filters.includeSelfLoops ? "1" : "0");
  if (filters.metaboliteQuery?.trim()) sp.set("m", filters.metaboliteQuery.trim());
  if (filters.sensorQuery?.trim()) sp.set("s", filters.sensorQuery.trim());
  if (filters.annotationQuery?.trim()) sp.set("ann", filters.annotationQuery.trim());
  if (filters.fluxPass && (filters.fluxPass === "all" || filters.fluxPass === "pass" || filters.fluxPass === "unpass")) {
    sp.set("flux", filters.fluxPass);
  }
  if (filters.focusCell?.trim()) sp.set("focus", filters.focusCell.trim());
  if (filters.focusMode) sp.set("focusMode", filters.focusMode);
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export function withWeightMode(search, weightMode) {
  const sp = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (weightMode) sp.set("w", weightMode);
  else sp.delete("w");
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}
